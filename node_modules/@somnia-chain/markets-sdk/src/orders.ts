// Orders — the shared order-book concept: reads, books, and placement.
//
// SHARED across market kinds because the ORDER BOOK is shared: spot, perp and
// binary pools all embed the same OrderBook core, emit the same OrderPlaced /
// OrderFilled events, and answer the same cancel/reduce calls. So
// `placeSpotOrder` and `placePerpOrder` live here alongside `placeOrder`
// (binary) — they differ in which pool they target and how a price is scaled,
// not in the machinery they drive.
//
// What does NOT live here: mechanics that exist for only one kind and hit their
// own contracts — stop orders (spot's registry, see spot/stops.ts), margin
// (perp/margin.ts), complete sets and settlement (binary/).
//
// Writes take the `Writer` context as their first parameter (CONVENTIONS.md
// data-first); the `Trader` facade binds them.

import {
  decodeEventLog,
  encodeFunctionData,
  maxUint256,
  toFunctionSelector,
} from "viem";
import type { Address, PublicClient } from "viem";
import * as IndexerRead from "./indexerRead.js";
import * as Interval from "./interval.js";
import { graphql } from "./gql/gql.js";
import { ContractRevertError, InvalidInputError } from "./errors.js";
import type { BookLevel, BinarySide, OrderStatus } from "./store.js";
import type { MarketType } from "./markets.js";
import type { Order_Bool_Exp, OrderMarketFieldsFragment } from "./gql/graphql.js";
import * as EventsAbi from "./eventsAbi.js";
import * as ReadsAbi from "./readsAbi.js";
import * as Store from "./store.js";
import * as Writer from "./writer.js";
import type { Writer as WriterCtx } from "./writer.js";
import * as TradeAbi from "./tradeAbi.js";
import type {
  AmendOrderParams,
  AmendOrderResult,
  AmendOrdersParams,
  AmendOrdersResult,
  BatchOrderRequest,
  BatchPlaceOutcome,
  CancelExpiredOrdersParams,
  CancelOrderParams,
  CancelOrdersParams,
  CancelOrdersResult,
  OrderFill,
  PlaceOrderParams,
  PlaceOrderResult,
  PlacePerpOrderParams,
  PlaceSpotOrderParams,
  PlaceSpotOrdersParams,
  PlaceSpotOrdersResult,
  ReduceOrderParams,
  ReduceOrdersParams,
  SweepExpiredAtLevelParams,
  TxResult,
} from "./trade.js";

/**
 *  The market context carried on every order row — enough to LABEL the row
 *  (asset, question, expiry, decimals) without a second read. For the full
 *  market pass the row's `market` id to
 *  {@link SomniaMarketsClient.getMarket | client.getMarket}.
 *
 *  The binary-only fields are null on SPOT and PERP, which is how the indexer
 *  stores them — an order read is not scoped by market kind, so a caller sees
 *  rows of every kind mixed together.
 */
export type OrderMarket = {
  /** The BinaryMarket clone contract's address (lowercased); null on SPOT/PERP. */
  marketAddress: string | null;
  /** Underlying asset symbol (e.g. "BTC"); null on SPOT/PERP. */
  asset: string | null;
  /** Display question text; null on SPOT/PERP. */
  question: string | null;
  /** Timestamp (unix seconds) trading ends; null on SPOT/PERP. */
  expiry: string | null;
  /** Timestamp (unix seconds) trading opened; null on SPOT/PERP. */
  tradingStart: string | null;
  /**
   *  Collateral decimals (per-market — e.g. 6dp TestUSDC vs 18dp USDso). Format
   *  this row's `price` and quantities with it, never a hard-coded 6.
   */
  quoteDecimals: number;
  /** Series cadence in seconds, as the indexer derived it; null on SPOT/PERP and on legacy rows. */
  intervalSec: string | null;
  /**
   *  Compact cadence label ("15m" / "1h" / "4h" / "24h") — DERIVED by the SDK
   *  from {@link OrderMarket.intervalSec}, matching `PortfolioMarket.interval`.
   *  Null when unknown.
   */
  interval: string | null;
};

/**
 *  Shape the market relationship an order read selected into {@link OrderMarket},
 *  stamping the derived cadence label the same way the portfolio reads do.
 *
 *  Shared by all three order reads so their market context cannot drift apart.
 */
function toOrderMarket(m: OrderMarketFieldsFragment | null): OrderMarket | null {
  if (m == null) return null;
  // Named explicitly rather than spread, for two reasons that pull the same way.
  // The parameter is the GENERATED fragment type, so a field dropped from
  // `OrderMarketFields` becomes a compile error here instead of being silently
  // backfilled as null — the failure mode a hand-written optional shape hid.
  // And the queries select `poolAddress` (plus `marketType` on the sweep read)
  // ALONGSIDE the fragment, so a blind spread would leak those onto the public
  // `marketInfo`, which names the market and deliberately does not repeat the
  // row's own `pool`.
  const { marketAddress, asset, question, expiry, tradingStart, quoteDecimals, intervalSec } = m;
  return {
    marketAddress,
    asset,
    question,
    expiry,
    tradingStart,
    quoteDecimals,
    intervalSec,
    interval: Interval.marketIntervalLabel(m),
  };
}

/**
 *  A currently-open resting order (subset of the indexer `Order` entity), as
 *  returned by {@link SomniaMarketsClient.getOpenOrders}. {@link OrderRow} extends it with the
 *  lifecycle/fill-progress fields for order history.
 */
export type OpenOrder = {
  /** Order id (`${pool}_${orderId}`). */
  id: string;
  /** uint128 OrderId as a decimal string (pass to trader.cancelOrder). */
  orderId: string;
  /**
   *  The market's bytes32 marketId — the STABLE identity of the market this
   *  order belonged to, and the key to label a historical row by.
   *
   *  Use this, never `pool` alone: a binary pool is recycled across successive
   *  markets, so the same `pool` names a different market depending on when the
   *  order was placed. On SPOT/PERP the pool address IS the market id, so the
   *  two agree there. Pass it straight to
   *  {@link SomniaMarketsClient.getMarket | client.getMarket} for the full row.
   */
  market: string;
  /**
   *  The market's labelling context, so a row can be NAMED without a second
   *  query. Null only if the indexer has no market row for the order.
   */
  marketInfo: OrderMarket | null;
  /**
   *  Lower-cased pool address the order rests on. A TIME-VARYING binding — see
   *  `market` for the identity that does not move.
   */
  pool: string;
  /**
   *  BINARY YES/NO classification; NULL on spot orders (the indexer only sets it
   *  for binary). For a buy/sell distinction that works on BOTH kinds use `isBid`.
   */
  side: BinarySide | null;
  /**
   *  True = bid (buy), false = ask (sell). The canonical buy/sell flag — set for
   *  spot AND binary, unlike `side` which is null on spot. Colour/label off this.
   */
  isBid: boolean;
  /** Limit price, raw quote units per whole base (binary: YES-probability scale). */
  price: string;
  /** Unfilled remainder, raw base/outcome units. */
  quantityRemaining: string;
};

/**
 *  An owner's currently-OPEN binary orders (optionally scoped to one pool). Used
 *  by the market maker to cancel + re-quote.
 */
/** Options for {@link SomniaMarketsClient.getOpenOrders} / {@link SomniaMarketsClient.getOrders}. All optional. */
export type OrdersOptions = {
  /** Restrict to one pool. */
  pool?: string;
  /** Order status. {@link SomniaMarketsClient.getOrders} only — {@link SomniaMarketsClient.getOpenOrders} is always "Open". */
  status?: OrderStatus;
  /** Restrict to one side. */
  side?: OpenOrder["side"];
  /** Max rows. */
  limit?: number;
  /** Row offset (default 0). */
  offset?: number;
};

/**
 *  A working (`status = "Open"`) order for `owner`, newest first. Pass
 *  {@link OrdersOptions} to scope by pool/side and page. For non-open history use
 *  {@link SomniaMarketsClient.getOrders}.
 */
export async function getOpenOrders(
  owner: string,
  opts: Omit<OrdersOptions, "status"> = {},
  indexerUrl: string,
): Promise<OpenOrder[]> {
  const where = orderWhere(owner, opts, "Open");
  const data = await IndexerRead.gqlRequest(OpenOrdersQuery,
    { where, limit: opts.limit ?? 1000, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Order.map((o) => ({
    id: o.id,
    orderId: o.orderId,
    // `market_id` is the scalar owning column and is `String!` — selected
    // directly so the market identity needs no fallback. The `marketRow`
    // RELATIONSHIP beside it is what Hasura types nullable (it types all of them
    // so), which is why only the pool/labels below carry one.
    market: o.market,
    marketInfo: toOrderMarket(o.marketRow),
    pool: (o.marketRow?.poolAddress ?? "").toLowerCase(),
    side: o.side,
    isBid: o.isBid,
    price: o.price,
    quantityRemaining: o.quantityRemaining,
  }));
}

/** An order row with its lifecycle status + fill progress (from {@link SomniaMarketsClient.getOrders}). */
export type OrderRow = OpenOrder & {
  /** Reconciled lifecycle status (Open/Filled/Cancelled/Expired/Closed). */
  status: OrderStatus;
  /** Original order size, raw base/outcome units. */
  fullQuantity: string;
  /** Cumulative filled quantity, raw base/outcome units. */
  filledQuantity: string;
  /** Whether the order ever rested on the book (an `OrderRested` fired). */
  rested: boolean;
  /**
   *  Order expiry as a uint64 nanosecond timestamp (decimal string). There is no GTC
   *  sentinel — the contract treats any future expiry as live, and this SDK writes GTC
   *  as now + 50 years (`farFutureNs`). The matcher rejects a 0/past expiry at
   *  placement, so "0" is never a live value.
   */
  expireTimestampNs: string;
  /** Tx hash the order was placed in. */
  placedTxHash: string;
  /** Timestamp (unix seconds) the order was placed. */
  placedAtTimestamp: string;
  /**
   *  WHY the order was cancelled, when the PROTOCOL removed it rather than the owner.
   *  Null for an owner cancel and for orders that were never cancelled — so a
   *  `Cancelled` status with a null reason means the owner did it.
   *
   *    SelfMatch        same-owner match (the CancelMaker path)
   *    ExceedsPosition  perps guard: the fill would push the maker past maxPositionSize
   *    NegativeEquity   perps guard: the maker's equity would go negative
   *    PreFill          the base pre-fill guard fired with no more specific tag
   *
   *  PERP only today; spot pools emit the base cancel without a reason tag.
   */
  cancelReason: string | null;
  /**
   *  Amendment linkage: the order this one REPLACED, and the one that replaced it. Lets
   *  an amend chain be followed rather than read as unrelated place/cancel pairs. Both
   *  null on an order that was never amended.
   */
  amendedFromOrderId: string | null;
  amendedToOrderId: string | null;
};

/**
 *  `owner`'s orders across ALL statuses (Open/Filled/Cancelled/Expired/Closed),
 *  newest first — the order-history counterpart to {@link SomniaMarketsClient.getOpenOrders}. Filter
 *  by `status`/`side`/`pool` via {@link OrdersOptions}.
 */
export async function getOrders(
  owner: string,
  opts: OrdersOptions = {},
  indexerUrl: string,
): Promise<OrderRow[]> {
  const where = orderWhere(owner, opts);
  const data = await IndexerRead.gqlRequest(OrdersQuery,
    { where, limit: opts.limit ?? 200, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Order.map((o) => ({
    id: o.id,
    orderId: o.orderId,
    // `market_id` is the scalar owning column and is `String!` — selected
    // directly so the market identity needs no fallback. The `marketRow`
    // RELATIONSHIP beside it is what Hasura types nullable (it types all of them
    // so), which is why only the pool/labels below carry one.
    market: o.market,
    marketInfo: toOrderMarket(o.marketRow),
    pool: (o.marketRow?.poolAddress ?? "").toLowerCase(),
    side: o.side,
    isBid: o.isBid,
    price: o.price,
    quantityRemaining: o.quantityRemaining,
    status: o.status,
    fullQuantity: o.fullQuantity,
    filledQuantity: o.filledQuantity,
    rested: o.rested,
    expireTimestampNs: o.expireTimestampNs,
    placedTxHash: o.placedTxHash,
    placedAtTimestamp: o.placedAtTimestamp,
    cancelReason: o.cancelReason,
    amendedFromOrderId: o.amendedFromOrderId,
    amendedToOrderId: o.amendedToOrderId,
  }));
}

/**
 *  Server-side COUNT of `owner`'s orders matching an {@link OrdersOptions}
 *  filter (Hasura `Order_aggregate`) — so an order-history page paginates
 *  against a real total without fetching every row. Privileged `_aggregate`
 *  role (server-only), with the bounded row-count fallback on the public role.
 */
export async function countOrders(
  owner: string,
  opts: OrdersOptions = {},
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<number> {
  return IndexerRead.aggregateCount("Order", "Order_bool_exp", orderWhere(owner, opts), indexerUrl, headers);
}

/**
 *  Top of a binary market's resting book, in YES terms (raw quote units — the
 *  same scale as `BinaryMarket.lastPrice`). `mid` is (bestBid + bestAsk) / 2,
 *  null unless BOTH sides rest (a one-sided book has no meaningful mid).
 */
export type BookTop = {
  /** Best (highest) resting bid price (raw); null when no bid rests. */
  bestBid: string | null;
  /** Best (lowest) resting ask price (raw); null when no ask rests. */
  bestAsk: string | null;
  /** (bestBid + bestAsk) / 2, floored (raw); null unless BOTH sides rest. */
  mid: string | null;
};

/**
 *  Batch-fetch the top of book (best resting bid/ask + mid) for many binary
 *  markets in ONE round-trip — for list views that want a book-derived implied
 *  probability without an N+1 per-pool fan-out. Returns a map of lowercased
 *  marketId → {@link BookTop}; markets with an empty book are simply absent.
 *
 *  Orders are stamped with `market_id` at placement, so keying on the market is
 *  recycle-safe (a reused pool's prior-market orders never bleed in). On-chain
 *  expiry is LAZY (an expired maker keeps resting with no OrderExpired event),
 *  so this mirrors `getBookLevels`' `now > expiry` skip in the where clause.
 */
export async function getBookTops(
  marketIds: string[],
  indexerUrl: string,
): Promise<Record<string, BookTop>> {
  const out: Record<string, BookTop> = {};
  const ids = marketIds.map((m) => m.toLowerCase());
  if (ids.length === 0) return out;
  const nowNs = (BigInt(Math.floor(Date.now() / 1000)) * 1_000_000_000n).toString();
  const sideWhere = (isBid: boolean): Order_Bool_Exp => ({
    market_id: { _in: ids },
    status: { _eq: "Open" },
    rested: { _eq: true },
    quantityRemaining: { _gt: "0" },
    expireTimestampNs: { _gt: nowNs },
    isBid: { _eq: isBid },
  });
  // distinct_on market_id with price leading the tiebreak = one best level per
  // market per side, in a single aliased round-trip.
  const data = await IndexerRead.gqlRequest(BookTopsQuery,
    { bidWhere: sideWhere(true), askWhere: sideWhere(false) },
    indexerUrl,
  );
  for (const b of data.bids) out[b.market.toLowerCase()] = { bestBid: b.price, bestAsk: null, mid: null };
  for (const a of data.asks) {
    const key = a.market.toLowerCase();
    const row = (out[key] ??= { bestBid: null, bestAsk: null, mid: null });
    row.bestAsk = a.price;
  }
  for (const row of Object.values(out)) {
    if (row.bestBid != null && row.bestAsk != null) {
      row.mid = ((BigInt(row.bestBid) + BigInt(row.bestAsk)) / 2n).toString();
    }
  }
  return out;
}

/**
 *  Both books for a market, 4-sided. NO levels are the YES book inverted into
 *  NO terms (price = 1 − yesPrice), matching BinaryPool's pricing.
 */
export interface BinaryOrderBook {
  /**
   *  Resting YES bids, best (highest price) first — raw collateral units per whole
   *  outcome token.
   */
  yesBids: BookLevel[];
  /** Resting YES asks, best (lowest price) first. */
  yesAsks: BookLevel[];
  /** NO bids derived from the YES asks (price = 1 − yesPrice), best (highest) first. */
  noBids: BookLevel[];
  /** NO asks derived from the YES bids (price = 1 − yesPrice), best (lowest) first. */
  noAsks: BookLevel[];
}

/**
 *  Expand a YES-terms book into the 4-sided binary shape: NO bids come from YES
 *  asks inverted (price = 1 − yesPrice) and vice-versa; quantities carry over.
 *  Shared by the on-chain read and the live-store book.
 */
export function toBinaryBook(yesBids: BookLevel[], yesAsks: BookLevel[], oneBase: bigint): BinaryOrderBook {
  const noBids = yesAsks
    .map((l) => ({ price: oneBase - l.price, quantity: l.quantity }))
    .sort((a, b) => (a.price > b.price ? -1 : 1));
  const noAsks = yesBids
    .map((l) => ({ price: oneBase - l.price, quantity: l.quantity }))
    .sort((a, b) => (a.price > b.price ? 1 : -1));
  return { yesBids, yesAsks, noBids, noAsks };
}

/** A binary pool's order-book increments, as the pool reports them. */
export interface BinaryBookParams {
  /** Price increment, raw collateral units per whole outcome token. */
  tickSize: bigint;
  /** Minimum order quantity, raw outcome-token units. */
  minQuantity: bigint;
  /** Quantity increment, raw outcome-token units. */
  lotSize: bigint;
}

/**
 *  The pool's tick / lot / minimum-quantity increments. Chain read.
 *
 *  **When to use**
 *
 *  Use to round a price or quantity to something the book will accept before
 *  placing an order — the pool rejects an order that is off-tick or below the
 *  minimum.
 */
export async function getBinaryBookParams(pool: Address, client: PublicClient): Promise<BinaryBookParams> {
  const p = await client.readContract({
    address: pool,
    abi: ReadsAbi.binaryPoolReadAbi,
    functionName: "getOrderBookParameters",
  });
  return { tickSize: p.tickSize, minQuantity: p.minQuantity, lotSize: p.lotSize };
}

/**
 *  One resting order exactly as the pool holds it — raw units, `bigint` fields.
 *
 *  Order ids are unique per POOL, not globally: always carry the pool alongside
 *  the id.
 */
export interface OnchainOrder {
  /** The pool's order id (`OrderId`, a uint128). */
  orderId: bigint;
  /** True for a bid (buy), false for an ask (sell). */
  isBid: boolean;
  /** The account the order rests for. */
  owner: Address;
  /** Caller-supplied tag echoed back by the book; 0 when unused. */
  userData: bigint;
  /** Limit price, raw quote/collateral units per whole base unit. */
  price: bigint;
  /** Quantity as originally placed, raw base units. */
  fullQuantity: bigint;
  /** Quantity still resting, raw base units — what a cancel would return. */
  quantityRemaining: bigint;
  /** Expiry as a UNIX timestamp in NANOseconds; 0 means no expiry. */
  expireTimestampNs: bigint;
}

/**
 *  `IncorrectOrder()`'s 4-byte selector, derived from the ABI rather than
 *  written out — the constant tracks the declaration if the error's shape ever
 *  changes.
 */
const INCORRECT_ORDER_SELECTOR = toFunctionSelector("IncorrectOrder()");

/** The pool's Order tuple → the SDK's named shape. */
function toOnchainOrder(o: {
  orderId: bigint;
  isBid: boolean;
  owner: Address;
  userData: bigint;
  price: bigint;
  fullQuantity: bigint;
  quantityRemaining: bigint;
  expireTimestampNs: bigint;
}): OnchainOrder {
  return {
    orderId: o.orderId,
    isBid: o.isBid,
    owner: o.owner,
    userData: o.userData,
    price: o.price,
    fullQuantity: o.fullQuantity,
    quantityRemaining: o.quantityRemaining,
    expireTimestampNs: o.expireTimestampNs,
  };
}

/**
 *  One order's state at chain head, by `(pool, orderId)`.
 *
 *  **When to use**
 *
 *  Use to read your own writes: right after `placeOrder`, this answers from the
 *  block the order landed in, while the indexed counterpart (`getOrders`) may
 *  not have caught up yet. The trade-off is the mirror image — this sees only
 *  what is ACTIVE now, so a filled or cancelled order reads as `null` here while
 *  the indexer keeps its history.
 *
 *  **Gotchas**
 *
 *  Order ids are unique per pool, so the pool is part of the key. `null` covers
 *  every "no active order with that id" case the pool reports — never assigned,
 *  fully filled, cancelled, expired-and-swept, or replaced by a `reduceOrder`
 *  (which re-keys the remainder under a new id).
 *
 *  @returns The order, or `null` if the pool has no active order for that id.
 */
export async function getOrderOnchain(
  pool: Address,
  orderId: bigint,
  client: PublicClient,
): Promise<OnchainOrder | null> {
  try {
    const o = await client.readContract({
      address: pool,
      abi: ReadsAbi.binaryPoolReadAbi,
      functionName: "getOrder",
      args: [orderId],
    });
    return toOnchainOrder(o);
  } catch (err: unknown) {
    // The pool signals "no active order with this id" by reverting, not by
    // returning a zeroed struct — so this is a normal answer, not a failure.
    //
    // Matched on SELECTOR, not `errorName`: the read boundary decodes names from
    // the generated contract-error table, and IncorrectOrder is not in it (that
    // sweep covers `smart-contracts/src/**`, while OrderBook lives in the dex
    // submodule under `lib/`). So the boundary preserves the raw 4 bytes and
    // leaves `errorName` undefined.
    if (err instanceof ContractRevertError && err.data?.startsWith(INCORRECT_ORDER_SELECTOR)) return null;
    throw err;
  }
}

/**
 *  An owner's open order ids at chain head.
 *
 *  **When to use**
 *
 *  Use to re-sync after a restart, or to confirm a placement landed before the
 *  indexer reports it. The indexed counterpart is `getOpenOrders`, which carries
 *  decoded human-unit rows and history but lags chain head.
 *
 *  **Gotchas**
 *
 *  The pool's view answers for `msg.sender`, so the wrapper impersonates the
 *  owner via the `eth_call` sender — no signer, no signature, any address may be
 *  asked about. Ids only: pair with {@link getOrderOnchain} for the structs.
 */
export async function getOwnOpenOrdersOnchain(
  pool: Address,
  owner: Address,
  client: PublicClient,
): Promise<bigint[]> {
  const ids = await client.readContract({
    address: pool,
    abi: ReadsAbi.binaryPoolReadAbi,
    functionName: "getOwnOpenOrders",
    // Impersonate the owner: the view reads msg.sender, and an eth_call `from`
    // needs no signature.
    account: owner,
  });
  return [...ids];
}

/**
 *  One page of every open order on one side of a book, at chain head.
 *
 *  **When to use**
 *
 *  Use to snapshot a full side — the per-order detail `getBookLevels` aggregates
 *  away. For a consistent multi-page snapshot, pin a block: pages taken across
 *  different heads can double-count or miss orders as the book moves.
 *
 *  **Gotchas**
 *
 *  The pool accepts this view ONLY from the zero address, so this read never
 *  attaches an account — a configured signer does not change it. Pagination is
 *  the contract's, surfaced as-is: no auto-drain, since the number of pages is
 *  unbounded. Loop while `hasMore`, passing `nextCursor` back as `cursor`.
 *
 *  @param opts - `isBid` picks the side; `maxCount` caps orders per page
 *  (default 100); `cursor` continues a previous page (omit for the first).
 */
export async function getAllOpenOrdersOnchain(
  pool: Address,
  opts: { isBid: boolean; maxCount?: number; cursor?: bigint },
  client: PublicClient,
): Promise<{ orders: OnchainOrder[]; hasMore: boolean; nextCursor: bigint }> {
  const [orders, hasMoreOrders, nextCursor] = await client.readContract({
    address: pool,
    abi: ReadsAbi.binaryPoolReadAbi,
    functionName: "getAllOpenOrdersOffChain",
    args: [opts.isBid, BigInt(opts.maxCount ?? 100), opts.cursor ?? 0n],
    // Deliberately NO `account`: the contract requires msg.sender == address(0).
  });
  return { orders: orders.map(toOnchainOrder), hasMore: hasMoreOrders, nextCursor };
}

/**
 *  Read the resting orderbook from a BinaryPool via getBookLevels (both sides).
 *  One-shot chain read — for a continuously-current book with zero round-trips,
 *  use `client.getLiveBinaryOrderBook` (or the `useLiveBinaryOrderBook` hook).
 */
export async function getBinaryOrderBook(
  pool: Address,
  opts: { depth?: number; decimals?: number } | undefined,
  client: PublicClient,
): Promise<BinaryOrderBook> {
  const oneBase = 10n ** BigInt(opts?.decimals ?? Store.DECIMALS);
  const { bids, asks } = await readBookLevels(pool, opts?.depth ?? 10, client);
  return toBinaryBook(bids, asks, oneBase);
}

/**
 *  A plain two-sided spot order book (no YES/NO inversion). Prices are raw quote
 *  units per whole base; quantities are raw base units.
 */
export interface SpotOrderBook {
  /** Resting buys, best (highest price) first. */
  bids: BookLevel[];
  /** Resting sells, best (lowest price) first. */
  asks: BookLevel[];
}

/**
 *  Read a SpotPool's resting order book via the shared OrderBook `getBookLevels`
 *  (SpotPool and BinaryPool share the base contract, so the same read works).
 */
export async function getSpotOrderBook(
  pool: Address,
  opts: { depth?: number } | undefined,
  client: PublicClient,
): Promise<SpotOrderBook> {
  return readBookLevels(pool, opts?.depth ?? 12, client);
}

/** Latest chain head as seen by the RPC. */
export async function getHeadBlock(client: PublicClient): Promise<number> {
  return Number(await client.getBlockNumber());
}

/**
 *  A resting order that is PAST ITS EXPIRY but has not been cleaned off the book —
 *  the target of a permissionless sweep.
 *
 *  Carries exactly what the two sweep verbs need: `orderId` for
 *  {@link SomniaMarketsClient.createTrader}'s `cancelExpiredOrders`, and
 *  `isBid` + `price` for `sweepExpiredAtLevel`.
 */
export type SweepableOrder = {
  /** Row id (`${pool}_${orderId}`). */
  id: string;
  /** uint128 OrderId as a decimal string — pass to `cancelExpiredOrders`. */
  orderId: string;
  /**
   *  The market's bytes32 marketId — the market this order rests on, stably.
   *
   *  A sweepable order is by definition still RESTING, and a pool's book is
   *  emptied before the pool is recycled, so this read cannot be mislabelled the
   *  way order HISTORY can. It is carried anyway so all three order reads name a
   *  market the same way.
   */
  market: string;
  /** The market's labelling context. Null only if the indexer has no market row. */
  marketInfo: OrderMarket | null;
  /** The pool the order rests on (lowercased). A time-varying binding — see `market`. */
  pool: string;
  /** Which market kind the pool is — sweeping works the same on all of them. */
  marketType: MarketType;
  /** The order's owner (lowercased). */
  owner: string;
  /** True = bid side, false = ask — pass to `sweepExpiredAtLevel`. */
  isBid: boolean;
  /** The exact price level, raw pool units — pass to `sweepExpiredAtLevel`. */
  price: string;
  /** Unfilled remainder that would be released, raw base/outcome units. */
  quantityRemaining: string;
  /** Expiry as a uint64 NANOsecond timestamp (decimal string). */
  expireTimestampNs: string;
  /** Timestamp (unix seconds) the order was placed. */
  placedAtTimestamp: string;
};

/**
 *  Orders that are past expiry and STILL RESTING, across the whole book — the
 *  work-list for a permissionless expired-order sweep. Not scoped to one account.
 *
 *  Indexer tier. Works on every market kind; scope with `pool` and/or `marketType`.
 *
 *  **This is not `status: "Expired"`, and the difference is the whole point.** That
 *  status is written when the chain emits `OrderExpired` — i.e. once an order has
 *  ALREADY been removed. A keeper needs the opposite: orders the book still holds
 *  whose expiry has passed and which nobody has cleaned up yet. So the filter is
 *  `status = "Open"` AND `expireTimestampNs < now`.
 *
 *  They are **not matched against** — the matching loop skips an expired maker and
 *  moves to the next (F-2026-16202, so one user's expired pollution is no longer paid
 *  for by the next crossing taker). What they still cost is a warm SLOAD every time a
 *  traversal encounters them, plus the priority-index slot they occupy. That is the
 *  reason to sweep, and it is per-ENCOUNTER: an order overdue by a year at an
 *  untouched price level costs less than one overdue by a minute at the top of book.
 *  Longest-overdue first is a stable, obvious order to work through — not a claim
 *  about which orders cost the most.
 *
 *  GTC orders exclude themselves, but not via a sentinel: the contract has none, and
 *  any future expiry is simply live. This SDK writes GTC as now + 50 years
 *  (`farFutureNs`), which no realistic `asOfSec` reaches. An order placed by other
 *  tooling with a nearer expiry is genuinely sweepable once it passes, which is
 *  correct.
 *
 *  @param opts.pool - restrict to one pool
 *  @param opts.marketType - restrict to one market kind
 *  @param opts.owner - restrict to one owner (for a self-cleanup rather than a sweep)
 *  @param opts.asOfSec - the instant to judge expiry against (unix seconds; default now)
 *  @param opts.limit - default 200
 */
export async function listSweepableOrders(
  opts: {
    pool?: string;
    marketType?: MarketType;
    owner?: string;
    asOfSec?: number | bigint;
    limit?: number;
    offset?: number;
  } = {},
  indexerUrl: string,
): Promise<SweepableOrder[]> {
  const nowSec = opts.asOfSec ?? Math.floor(Date.now() / 1000);
  // expireTimestampNs is NANOseconds; the cutoff has to be scaled or every order
  // looks unexpired by a factor of a billion.
  const cutoffNs = BigInt(nowSec) * 1_000_000_000n;
  const where: Record<string, unknown> = {
    status: { _eq: "Open" },
    expireTimestampNs: { _lt: cutoffNs.toString() },
  };
  if (opts.owner != null) where.owner = { _eq: opts.owner.toLowerCase() };
  const market: Record<string, unknown> = {};
  if (opts.pool != null) market.poolAddress = { _eq: opts.pool.toLowerCase() };
  if (opts.marketType != null) market.marketType = { _eq: opts.marketType };
  if (Object.keys(market).length > 0) where.market = market;

  const data = await IndexerRead.gqlRequest(SweepableOrdersQuery,
    { where, limit: opts.limit ?? 200, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Order.map((o) => ({
    id: o.id,
    orderId: o.orderId,
    market: o.market,
    marketInfo: toOrderMarket(o.marketRow),
    pool: (o.marketRow?.poolAddress ?? "").toLowerCase(),
    marketType: o.marketRow?.marketType ?? "SPOT",
    owner: o.owner,
    isBid: o.isBid,
    price: o.price,
    quantityRemaining: o.quantityRemaining,
    expireTimestampNs: o.expireTimestampNs,
    placedAtTimestamp: o.placedAtTimestamp,
  }));
}

/**
 *  Build the server-side `where` for an order query — object form, only the set
 *  fields (no string interpolation).
 */
function orderWhere(owner: string, opts: OrdersOptions, forceStatus?: OrderStatus): Record<string, unknown> {
  const where: Record<string, unknown> = { owner: { _eq: owner.toLowerCase() } };
  const status = forceStatus ?? opts.status;
  if (status != null) where.status = { _eq: status };
  if (opts.side != null) where.side = { _eq: opts.side };
  if (opts.pool != null) where.market = { poolAddress: { _eq: opts.pool.toLowerCase() } };
  return where;
}

// ---------------------------------------------------------------------------
// Typed documents for the reads above. Hoisted here (rather than inline at each
// call site) to keep this file's reading order: functions first, GraphQL after.
// Result and variable types are derived from the committed schema snapshot.

// The market context every order read carries. Selected as a fragment so the
// three reads cannot drift apart, and kept to the fields a consumer needs to
// LABEL a row — anything richer is a `getMarket(row.market)` away, keyed by the
// id these reads now return.
// prettier-ignore
const OrderMarketFields = graphql(`
  fragment OrderMarketFields on Market {
    marketAddress
    asset
    question
    expiry
    tradingStart
    quoteDecimals
    intervalSec
  }
`);

// prettier-ignore
const SweepableOrdersQuery = graphql(`
  query SweepableOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {
        Order(where: $where, order_by: [{expireTimestampNs: asc}, {id: asc}], limit: $limit, offset: $offset) {
          id orderId owner isBid price quantityRemaining expireTimestampNs placedAtTimestamp
          market: market_id
          marketRow: market { poolAddress marketType ...OrderMarketFields }
        }
      }
`);

// prettier-ignore
const OpenOrdersQuery = graphql(`
  query OpenOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {
        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {
          id orderId side isBid price quantityRemaining
          market: market_id
          marketRow: market { poolAddress ...OrderMarketFields }
        }
      }
`);

// prettier-ignore
const OrdersQuery = graphql(`
  query Orders($where: Order_bool_exp!, $limit: Int, $offset: Int) {
        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {
          id orderId side isBid price quantityRemaining fullQuantity filledQuantity status
          rested expireTimestampNs placedTxHash placedAtTimestamp
          cancelReason amendedFromOrderId amendedToOrderId
          market: market_id
          marketRow: market { poolAddress ...OrderMarketFields }
        }
      }
`);

// prettier-ignore
const BookTopsQuery = graphql(`
  query BookTops($bidWhere: Order_bool_exp!, $askWhere: Order_bool_exp!) {
         bids: Order(where: $bidWhere, distinct_on: market_id, order_by: [{market_id: desc}, {price: desc}]) {
           market: market_id price
         }
         asks: Order(where: $askWhere, distinct_on: market_id, order_by: [{market_id: asc}, {price: asc}]) {
           market: market_id price
         }
       }
`);

/**
 *  Read both sides of an OrderBook pool's resting book via `getBookLevels`.
 *  SpotPool and BinaryPool share the base contract, so the same read works for
 *  either — the binary/spot readers just interpret the levels differently.
 */
async function readBookLevels(
  pool: Address,
  depth: number,
  client: PublicClient,
): Promise<{ bids: BookLevel[]; asks: BookLevel[] }> {
  const numLevels = BigInt(depth);
  const [rawBids, rawAsks] = await Promise.all([
    client.readContract({ address: pool, abi: ReadsAbi.binaryPoolReadAbi, functionName: "getBookLevels", args: [true, numLevels] }),
    client.readContract({ address: pool, abi: ReadsAbi.binaryPoolReadAbi, functionName: "getBookLevels", args: [false, numLevels] }),
  ]);
  return { bids: [...rawBids] as BookLevel[], asks: [...rawAsks] as BookLevel[] };
}

// ---------------------------------------------------------------------------
// Writes. Each takes the `Writer` context first (CONVENTIONS.md data-first); the
// `Trader` facade binds them so its public shape is unchanged.
// ---------------------------------------------------------------------------

// The order call itself, with no approval and no send. Split out of `placeOrder`
// so the sending verb and `buildPlaceOrder` encode from ONE definition — the
// build-only verb cannot drift from what actually gets sent.
async function binaryOrderCall(w: WriterCtx, p: PlaceOrderParams): Promise<Writer.WriteCall> {
    if (p.price <= 0n || p.quantity <= 0n) {
      throw new InvalidInputError("price and quantity must be > 0");
    }
    const kind = Writer.ORDER_KIND[p.side];
    const orderType = p.orderType ?? 0;
    // v2 order-expiry rule: every order must satisfy `0 < expireNs <=
    // pool.marketExpiryNs` (the pool rejects `OrderExpiryBeyondMarket`
    // otherwise, so the book stays drainable via the expiry sweeps after the
    // market locks). Default to the market's expiry when the caller doesn't
    // specify; otherwise honour the caller's value verbatim (a too-late value
    // reverts on-w.chain — we don't silently clamp a deliberate choice).
    const expiry = p.expireTimestampNs ?? (await w.marketExpiryNs(p.pool));
    // userData is opaque MM bookkeeping — forwarded verbatim, default 0.
    const userData = p.userData ?? 0n;

    // Pool-direct: BinaryPool exposes placeBinaryOrder (the generic placeOrder
    // reverts UseBinaryPlacement on a binary pool). Builder/routing fee rides the
    // pool's per-order rail — the builder must be opted in via approveBuilder.
    return {
      address: p.pool,
      abi: TradeAbi.binaryPoolWriteAbi,
      functionName: "placeBinaryOrder",
      args: [
        kind,
        p.price,
        p.quantity,
        expiry,
        orderType,
        0,
        p.builder ?? Writer.ZERO_ADDRESS,
        p.builderFeeBpsTimes1k ?? 0n,
        userData,
      ],
      gas: p.gas ?? w.defaultGas,
    };
}

export async function placeOrder(w: WriterCtx, p: PlaceOrderParams): Promise<PlaceOrderResult> {
    const call = await binaryOrderCall(w, p);

    // Escrow pulls w.from msg.sender via the pool, so authorize the POOL:
    // buys need a collateral ERC-20 allowance; sells need a one-time operator
    // grant on the outcome-token singleton (covers all markets + both sides).
    if (p.autoApprove !== false) {
      const gas = p.gas ?? w.defaultGas;
      const e = w.escrow(p, await w.tokens(p));
      if (e.kind === "erc20") await w.approveIfNeeded(e.token, p.pool, e.amount, gas);
      else await w.ensureOperator(e.outcomeToken, p.pool, gas);
    }

    return w.executeOrder(call);
}

export async function cancelOrder(w: WriterCtx, p: CancelOrderParams): Promise<TxResult> {
    return w.execute({
      address: p.pool,
      abi: TradeAbi.binaryPoolWriteAbi,
      functionName: "cancelOrder",
      args: [BigInt(p.orderId)],
      gas: p.gas ?? w.defaultGas,
    });
}

export async function reduceOrder(w: WriterCtx, p: ReduceOrderParams): Promise<TxResult> {
    return w.execute({
      address: p.pool,
      abi: TradeAbi.binaryPoolWriteAbi,
      functionName: "reduceOrder",
      args: [BigInt(p.orderId), p.newQuantityRemaining],
      gas: p.gas ?? w.defaultGas,
    });
}

export async function cancelExpiredOrders(w: WriterCtx, p: CancelExpiredOrdersParams): Promise<TxResult> {
    return w.execute({
      address: p.pool,
      abi: TradeAbi.binaryPoolWriteAbi,
      functionName: "cancelExpiredOrders",
      args: [p.orderIds.map((id) => BigInt(id))],
      gas: p.gas ?? w.defaultGas,
    });
}

export async function sweepExpiredAtLevel(w: WriterCtx, p: SweepExpiredAtLevelParams): Promise<TxResult> {
    return w.execute({
      address: p.pool,
      abi: TradeAbi.binaryPoolWriteAbi,
      functionName: "sweepExpiredAtLevel",
      args: [p.isBid, p.price, p.maxCount],
      gas: p.gas ?? w.defaultGas,
    });
}

/** What a spot placement escrows: the token to approve and how much, or native msg.value. */
function spotEscrow(p: PlaceSpotOrderParams): { token: Address; amount: bigint } | { native: bigint } {
    const oneBase = 10n ** BigInt(p.baseDecimals);
    // Buy base → pay quote. Escrow = ceil(price * quantity / 10^baseDecimals).
    if (p.isBid) return { token: p.quoteToken, amount: (p.price * p.quantity + oneBase - 1n) / oneBase };
    // Sell native base → pay via msg.value (no approval).
    if (p.baseIsNative) return { native: p.quantity };
    // Sell ERC-20 base → approve the pool for the base token.
    return { token: p.baseToken, amount: p.quantity };
}

// Split out of `placeSpotOrder` for the same reason as `binaryOrderCall`: one
// definition of the call, shared by the sending verb and the build-only one.
function spotOrderCall(w: WriterCtx, p: PlaceSpotOrderParams): Writer.WriteCall {
    if (p.price <= 0n || p.quantity <= 0n) {
      throw new InvalidInputError("price and quantity must be > 0");
    }
    const e = spotEscrow(p);
    return {
      address: p.pool,
      abi: TradeAbi.spotPoolWriteAbi,
      functionName: "placeOrder",
      args: [
        p.isBid,
        0n,
        p.price,
        p.quantity,
        p.expireTimestampNs ?? Writer.farFutureNs(),
        p.orderType ?? 0,
        0,
        p.builder ?? Writer.ZERO_ADDRESS,
        p.builderFeeBpsTimes1k ?? 0n,
      ],
      gas: p.gas ?? w.defaultGas,
      value: "native" in e ? e.native : 0n,
    };
}

export async function placeSpotOrder(w: WriterCtx, p: PlaceSpotOrderParams): Promise<PlaceOrderResult> {
    const e = spotEscrow(p);
    if (p.autoApprove !== false && "token" in e) {
      await w.approveIfNeeded(e.token, p.pool, e.amount, p.gas ?? w.defaultGas);
    }

    // Encoded AFTER the approval, as before this verb was split: the expiry
    // `spotOrderCall` stamps is clock-derived, so building it first would date it
    // from before an unbounded wait on the approval receipt.
    return w.executeOrder(spotOrderCall(w, p));
}

// Split out of `placePerpOrder` — see `binaryOrderCall`.
// Decode the per-order lifecycle events this tx emitted on `pool`, in log order.
// Batch outcomes are reconstructed positionally from these: the OrderBook processes
// a batch's requests in input order and emits at most one OrderPlaced per request,
// so the Nth OrderPlaced belongs to the Nth request that placed.
function batchOrderEvents(receipt: TxResult["receipt"], pool: Address) {
  const placed: {
    orderId: bigint;
    isBid: boolean;
    price: bigint;
    quantity: bigint;
    userData: bigint;
    expireTimestampNs: bigint;
  }[] = [];
  const terminated = new Set<bigint>();
  const fills: OrderFill[] = [];
  for (const log of receipt.logs) {
    // Same-tx logs from other contracts (token transfers, vault credits) must not
    // be mistaken for this pool's order events.
    if (log.address.toLowerCase() !== pool.toLowerCase()) continue;
    let decoded: { eventName: string; args: Record<string, unknown> };
    try {
      decoded = decodeEventLog({ abi: EventsAbi.orderBookEventsAbi, data: log.data, topics: log.topics }) as {
        eventName: string;
        args: Record<string, unknown>;
      };
    } catch {
      continue;
    }
    if (decoded.eventName === "OrderPlaced") {
      const o = decoded.args.placedOrder as {
        orderId: bigint;
        isBid: boolean;
        price: bigint;
        fullQuantity: bigint;
        userData: bigint;
        expireTimestampNs: bigint;
      };
      placed.push({
        orderId: o.orderId,
        isBid: o.isBid,
        price: o.price,
        quantity: o.fullQuantity,
        userData: o.userData,
        expireTimestampNs: o.expireTimestampNs,
      });
    } else if (decoded.eventName === "OrderCancelled" || decoded.eventName === "OrderExpired") {
      terminated.add(decoded.args.orderId as bigint);
    } else if (decoded.eventName === "OrderFilled") {
      fills.push({
        takerOrderId: decoded.args.takerOrderId as bigint,
        makerOrderId: decoded.args.makerOrderId as bigint,
        quantityFilled: decoded.args.quantityFilled as bigint,
        takerRemainingQuantity: decoded.args.takerRemainingQuantity as bigint,
        makerRemainingQuantity: decoded.args.makerRemainingQuantity as bigint,
        fillPrice: decoded.args.fillPrice as bigint,
      });
    }
  }
  return { placed, terminated, fills };
}

export async function placeSpotOrders(w: WriterCtx, p: PlaceSpotOrdersParams): Promise<PlaceSpotOrdersResult> {
    if (p.orders.length === 0) {
      // The contract reverts EmptyBatch; fail before spending an RPC round-trip.
      throw new InvalidInputError("orders must not be empty");
    }
    for (const [i, o] of p.orders.entries()) {
      if (o.price <= 0n || o.quantity <= 0n) {
        throw new InvalidInputError(`orders[${i}]: price and quantity must be > 0`);
      }
    }
    const gas = p.gas ?? w.defaultGas;
    const oneBase = 10n ** BigInt(p.baseDecimals);

    // Resolve per-request defaults ONCE, before the send, and keep the resolved
    // array for outcome matching below. This is not a style choice: farFutureNs()
    // is clock-derived, so recomputing a defaulted expiry at match time could
    // disagree with the value that actually went on-chain.
    const requests = p.orders.map((o) => ({
      isBid: o.isBid,
      userData: o.userData ?? 0n,
      price: o.price,
      quantity: o.quantity,
      expireTimestampNs: o.expireTimestampNs ?? Writer.farFutureNs(),
      orderType: o.orderType ?? 0,
      selfMatchingOption: 0,
      builder: Writer.ZERO_ADDRESS,
      builderFeeBpsTimes1k: 0n,
    }));

    // One approval per token for the batch's total escrow — the pool pulls per
    // request, so a per-order allowance would under-approve the later rungs.
    if (p.autoApprove !== false) {
      let quoteIn = 0n;
      let baseIn = 0n;
      for (const o of p.orders) {
        if (o.isBid) quoteIn += (o.price * o.quantity + oneBase - 1n) / oneBase;
        else baseIn += o.quantity;
      }
      if (quoteIn > 0n) await w.approveIfNeeded(p.quoteToken, p.pool, quoteIn, gas);
      // A native-base sell cannot be approved OR paid with msg.value here (batches
      // are non-payable) — it draws on the pool's vault balance instead.
      if (baseIn > 0n && !p.baseIsNative) await w.approveIfNeeded(p.baseToken, p.pool, baseIn, gas);
    }

    const result = await w.execute({
      address: p.pool,
      abi: TradeAbi.orderBookBatchWriteAbi,
      functionName: "placeOrders",
      args: [requests],
      gas,
    });

    // Align the OrderPlaced events back to requests. The contract emits exactly one
    // OrderPlaced per successful request, in request order, echoing the full order
    // (OrderBook.sol `_placeOrder`: every benign non-placement returns before the
    // emit). A non-placement therefore leaves a gap, so walk both lists in step and
    // match on every request-identifying field the event echoes — isBid, price,
    // fullQuantity, userData, expireTimestampNs — to stay aligned past it. Two
    // byte-identical adjacent requests with different outcomes are indistinguishable
    // from logs; the walk credits the earlier index (tag rungs with distinct
    // `userData` when exact attribution matters).
    const { placed, fills } = batchOrderEvents(result.receipt, p.pool);
    let next = 0;
    const outcomes: BatchPlaceOutcome[] = requests.map((r) => {
      const ev = placed[next];
      if (
        ev &&
        ev.isBid === r.isBid &&
        ev.price === r.price &&
        ev.quantity === r.quantity &&
        ev.userData === r.userData &&
        ev.expireTimestampNs === r.expireTimestampNs
      ) {
        next += 1;
        return { success: true, orderId: ev.orderId };
      }
      return { success: false };
    });
    return { ...result, outcomes, fills };
}

export async function cancelOrders(w: WriterCtx, p: CancelOrdersParams): Promise<CancelOrdersResult> {
    if (p.orderIds.length === 0) {
      throw new InvalidInputError("orderIds must not be empty");
    }
    const ids = p.orderIds.map((id) => BigInt(id));
    const result = await w.execute({
      address: p.pool,
      abi: TradeAbi.orderBookBatchWriteAbi,
      functionName: "cancelOrders",
      args: [ids],
      gas: p.gas ?? w.defaultGas,
    });
    // Best-effort: a skipped id emits no event, so absence IS the skip signal.
    const { terminated } = batchOrderEvents(result.receipt, p.pool);
    return {
      ...result,
      outcomes: ids.map((orderId) => ({ orderId, cancelled: terminated.has(orderId) })),
    };
}

export async function reduceOrders(w: WriterCtx, p: ReduceOrdersParams): Promise<TxResult> {
    if (p.reductions.length === 0) {
      throw new InvalidInputError("reductions must not be empty");
    }
    return w.execute({
      address: p.pool,
      abi: TradeAbi.orderBookBatchWriteAbi,
      functionName: "reduceOrders",
      args: [
        p.reductions.map((r) => ({
          orderId: BigInt(r.orderId),
          newQuantityRemaining: r.newQuantityRemaining,
        })),
      ],
      gas: p.gas ?? w.defaultGas,
    });
}

/**
 *  Batch entries revert `EmptyBatch` on-chain for an empty array. Failing here costs
 *  the caller nothing and says which argument was empty.
 */
function requireNonEmpty(items: readonly unknown[], what: string): void {
  if (items.length === 0) throw new InvalidInputError(`${what} must not be empty`);
}

function requirePositive(price: bigint, quantity: bigint): void {
  if (price <= 0n || quantity <= 0n) throw new InvalidInputError("price and quantity must be > 0");
}

/** Fill a {@link BatchOrderRequest}'s optionals into the pool's `PlaceOrderRequest` struct. */
function toPlaceRequest(o: BatchOrderRequest): {
  isBid: boolean;
  userData: bigint;
  price: bigint;
  quantity: bigint;
  expireTimestampNs: bigint;
  orderType: number;
  selfMatchingOption: number;
  builder: Address;
  builderFeeBpsTimes1k: bigint;
} {
  return {
    isBid: o.isBid,
    userData: o.userData ?? 0n,
    price: o.price,
    quantity: o.quantity,
    expireTimestampNs: o.expireTimestampNs ?? Writer.farFutureNs(),
    orderType: o.orderType ?? 0,
    selfMatchingOption: o.selfMatchingOption ?? 0,
    builder: o.builder ?? Writer.ZERO_ADDRESS,
    builderFeeBpsTimes1k: o.builderFeeBpsTimes1k ?? 0n,
  };
}

/**
 *  Cancel ONE order and place its replacement atomically. Calls the pool's singular
 *  `amendOrder`, NOT `amendOrders` with a one-element array: the singular raises the
 *  replacement's own landing-time reason where the batch wraps it as
 *  `AmendReplacementRejected(requestIndex, reason)`, and for one order that index is
 *  noise the caller would have to unwrap.
 */
export async function amendOrder(w: WriterCtx, p: AmendOrderParams): Promise<AmendOrderResult> {
    requirePositive(p.newOrder.price, p.newOrder.quantity);
    const tx = await w.execute({
      address: p.pool,
      // spotPoolWriteAbi is just the encoding table — `amendOrder` is inherited from
      // the shared OrderBook base, so the selector is identical on a PerpPool. Same
      // reason `reduceOrder` above encodes off the binary ABI for every pool kind.
      abi: TradeAbi.spotPoolWriteAbi,
      functionName: "amendOrder",
      args: [
        {
          oldOrderId: BigInt(p.oldOrderId),
          alwaysPlace: p.alwaysPlace ?? false,
          newOrder: toPlaceRequest(p.newOrder),
        },
      ],
      gas: p.gas ?? w.defaultGas,
    });
    return Writer.decodeAmendResult(tx, { pool: p.pool });
}

/**
 *  Cancel N orders and place their replacements atomically. ALL-OR-NOTHING, and it
 *  places — so the BinaryPool restriction in {@link AmendOrdersParams} applies.
 */
export async function amendOrders(w: WriterCtx, p: AmendOrdersParams): Promise<AmendOrdersResult> {
    requireNonEmpty(p.amendments, "amendments");
    for (const a of p.amendments) requirePositive(a.newOrder.price, a.newOrder.quantity);
    const tx = await w.execute({
      address: p.pool,
      abi: TradeAbi.orderBookBatchWriteAbi,
      functionName: "amendOrders",
      args: [
        p.amendments.map((a) => ({
          oldOrderId: BigInt(a.oldOrderId),
          alwaysPlace: a.alwaysPlace ?? false,
          newOrder: toPlaceRequest(a.newOrder),
        })),
      ],
      gas: p.gas ?? w.defaultGas,
    });
    return Writer.decodeBatchAmendResult(tx, { pool: p.pool, amendmentCount: p.amendments.length });
}

function perpOrderCall(w: WriterCtx, p: PlacePerpOrderParams): Writer.WriteCall {
    if (p.price <= 0n || p.quantity <= 0n) {
      throw new InvalidInputError("price and quantity must be > 0");
    }
    // No w.escrow step: margin is locked w.from the signer's MarginBank balance
    // (deposit first), and the pool rejects msg.value.
    return {
      address: p.pool,
      abi: TradeAbi.perpPoolWriteAbi,
      functionName: "placeOrder",
      args: [
        p.isBid,
        0n,
        p.price,
        p.quantity,
        p.expireTimestampNs ?? Writer.farFutureNs(),
        p.orderType ?? 0,
        0,
        p.builder ?? Writer.ZERO_ADDRESS,
        p.builderFeeBpsTimes1k ?? 0n,
      ],
      gas: p.gas ?? w.defaultGas,
    };
}

export async function placePerpOrder(w: WriterCtx, p: PlacePerpOrderParams): Promise<PlaceOrderResult> {
    return w.executeOrder(perpOrderCall(w, p));
}

// ---------------------------------------------------------------------------
// Build-only placement. Same inputs as the sending verbs, but they hand back the
// unsigned call instead of signing it — so a caller can pre-sign, batch, relay,
// or simulate. Each shares its call construction with its sending twin above, so
// the calldata cannot drift from what `place*Order` actually sends.
// ---------------------------------------------------------------------------

export async function buildPlaceOrder(w: WriterCtx, p: PlaceOrderParams): Promise<Writer.UnsignedOrder> {
  const order = Writer.toUnsigned(await binaryOrderCall(w, p), `Place ${p.side} order on binary pool ${p.pool}`);
  // `autoApprove: false` means the caller manages approvals themselves — honour it
  // the same way `placeOrder` does. Worth a branch rather than a wasted step: the
  // escrow lookup can cost a `poolTokens` round-trip, which is exactly the latency
  // a build-only verb exists to avoid.
  if (p.autoApprove === false) return { order };
  const e = w.escrow(p, await w.tokens(p));
  // A buy escrows collateral (ERC-20 approve); a sell escrows outcome tokens (a
  // one-time ERC-6909 operator grant). Both are returned unsigned — never sent,
  // which is the whole point of a build-only verb.
  const approval =
    e.kind === "erc20"
      ? Writer.approvalCall(e.token, p.pool, `Approve collateral ${e.token} for binary pool ${p.pool}`)
      : Writer.toUnsigned(
          { address: e.outcomeToken, abi: ReadsAbi.erc6909Abi, functionName: "setOperator", args: [p.pool, true], gas: 0n },
          `Approve binary pool ${p.pool} as operator on outcome tokens ${e.outcomeToken}`,
        );
  return { order, approval };
}

export async function buildPlaceSpotOrder(w: WriterCtx, p: PlaceSpotOrderParams): Promise<Writer.UnsignedOrder> {
  const order = Writer.toUnsigned(spotOrderCall(w, p), `Place spot ${p.isBid ? "buy" : "sell"} order on pool ${p.pool}`);
  const e = spotEscrow(p);
  // A native-base sell pays via msg.value, so it has nothing to approve; and
  // `autoApprove: false` means the caller handles approvals themselves.
  if ("native" in e || p.autoApprove === false) return { order };
  return { order, approval: Writer.approvalCall(e.token, p.pool, `Approve ${e.token} for spot pool ${p.pool}`) };
}

export async function buildPlacePerpOrder(w: WriterCtx, p: PlacePerpOrderParams): Promise<Writer.UnsignedOrder> {
  // No approval ever: margin comes from the MarginBank balance, not an escrow
  // transfer, and the pool rejects msg.value.
  return { order: Writer.toUnsigned(perpOrderCall(w, p), `Place perp ${p.isBid ? "long" : "short"} order on pool ${p.pool}`) };
}
