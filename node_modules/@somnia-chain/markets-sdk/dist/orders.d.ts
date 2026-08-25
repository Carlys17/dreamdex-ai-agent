import type { Address, PublicClient } from "viem";
import type { BookLevel, BinarySide, OrderStatus } from "./store.js";
import type { MarketType } from "./markets.js";
import * as Writer from "./writer.js";
import type { Writer as WriterCtx } from "./writer.js";
import type { AmendOrderParams, AmendOrderResult, AmendOrdersParams, AmendOrdersResult, CancelExpiredOrdersParams, CancelOrderParams, CancelOrdersParams, CancelOrdersResult, PlaceOrderParams, PlaceOrderResult, PlacePerpOrderParams, PlaceSpotOrderParams, PlaceSpotOrdersParams, PlaceSpotOrdersResult, ReduceOrderParams, ReduceOrdersParams, SweepExpiredAtLevelParams, TxResult } from "./trade.js";
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
export declare function getOpenOrders(owner: string, opts: Omit<OrdersOptions, "status"> | undefined, indexerUrl: string): Promise<OpenOrder[]>;
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
export declare function getOrders(owner: string, opts: OrdersOptions | undefined, indexerUrl: string): Promise<OrderRow[]>;
/**
 *  Server-side COUNT of `owner`'s orders matching an {@link OrdersOptions}
 *  filter (Hasura `Order_aggregate`) — so an order-history page paginates
 *  against a real total without fetching every row. Privileged `_aggregate`
 *  role (server-only), with the bounded row-count fallback on the public role.
 */
export declare function countOrders(owner: string, opts: OrdersOptions | undefined, indexerUrl: string, headers?: Record<string, string>): Promise<number>;
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
export declare function getBookTops(marketIds: string[], indexerUrl: string): Promise<Record<string, BookTop>>;
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
export declare function toBinaryBook(yesBids: BookLevel[], yesAsks: BookLevel[], oneBase: bigint): BinaryOrderBook;
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
export declare function getBinaryBookParams(pool: Address, client: PublicClient): Promise<BinaryBookParams>;
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
export declare function getOrderOnchain(pool: Address, orderId: bigint, client: PublicClient): Promise<OnchainOrder | null>;
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
export declare function getOwnOpenOrdersOnchain(pool: Address, owner: Address, client: PublicClient): Promise<bigint[]>;
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
export declare function getAllOpenOrdersOnchain(pool: Address, opts: {
    isBid: boolean;
    maxCount?: number;
    cursor?: bigint;
}, client: PublicClient): Promise<{
    orders: OnchainOrder[];
    hasMore: boolean;
    nextCursor: bigint;
}>;
/**
 *  Read the resting orderbook from a BinaryPool via getBookLevels (both sides).
 *  One-shot chain read — for a continuously-current book with zero round-trips,
 *  use `client.getLiveBinaryOrderBook` (or the `useLiveBinaryOrderBook` hook).
 */
export declare function getBinaryOrderBook(pool: Address, opts: {
    depth?: number;
    decimals?: number;
} | undefined, client: PublicClient): Promise<BinaryOrderBook>;
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
export declare function getSpotOrderBook(pool: Address, opts: {
    depth?: number;
} | undefined, client: PublicClient): Promise<SpotOrderBook>;
/** Latest chain head as seen by the RPC. */
export declare function getHeadBlock(client: PublicClient): Promise<number>;
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
export declare function listSweepableOrders(opts: {
    pool?: string;
    marketType?: MarketType;
    owner?: string;
    asOfSec?: number | bigint;
    limit?: number;
    offset?: number;
} | undefined, indexerUrl: string): Promise<SweepableOrder[]>;
export declare function placeOrder(w: WriterCtx, p: PlaceOrderParams): Promise<PlaceOrderResult>;
export declare function cancelOrder(w: WriterCtx, p: CancelOrderParams): Promise<TxResult>;
export declare function reduceOrder(w: WriterCtx, p: ReduceOrderParams): Promise<TxResult>;
export declare function cancelExpiredOrders(w: WriterCtx, p: CancelExpiredOrdersParams): Promise<TxResult>;
export declare function sweepExpiredAtLevel(w: WriterCtx, p: SweepExpiredAtLevelParams): Promise<TxResult>;
export declare function placeSpotOrder(w: WriterCtx, p: PlaceSpotOrderParams): Promise<PlaceOrderResult>;
export declare function placeSpotOrders(w: WriterCtx, p: PlaceSpotOrdersParams): Promise<PlaceSpotOrdersResult>;
export declare function cancelOrders(w: WriterCtx, p: CancelOrdersParams): Promise<CancelOrdersResult>;
export declare function reduceOrders(w: WriterCtx, p: ReduceOrdersParams): Promise<TxResult>;
/**
 *  Cancel ONE order and place its replacement atomically. Calls the pool's singular
 *  `amendOrder`, NOT `amendOrders` with a one-element array: the singular raises the
 *  replacement's own landing-time reason where the batch wraps it as
 *  `AmendReplacementRejected(requestIndex, reason)`, and for one order that index is
 *  noise the caller would have to unwrap.
 */
export declare function amendOrder(w: WriterCtx, p: AmendOrderParams): Promise<AmendOrderResult>;
/**
 *  Cancel N orders and place their replacements atomically. ALL-OR-NOTHING, and it
 *  places — so the BinaryPool restriction in {@link AmendOrdersParams} applies.
 */
export declare function amendOrders(w: WriterCtx, p: AmendOrdersParams): Promise<AmendOrdersResult>;
export declare function placePerpOrder(w: WriterCtx, p: PlacePerpOrderParams): Promise<PlaceOrderResult>;
export declare function buildPlaceOrder(w: WriterCtx, p: PlaceOrderParams): Promise<Writer.UnsignedOrder>;
export declare function buildPlaceSpotOrder(w: WriterCtx, p: PlaceSpotOrderParams): Promise<Writer.UnsignedOrder>;
export declare function buildPlacePerpOrder(w: WriterCtx, p: PlacePerpOrderParams): Promise<Writer.UnsignedOrder>;
