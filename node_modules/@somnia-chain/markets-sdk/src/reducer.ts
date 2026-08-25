// Pure event reducer — the client-side mirror of the Envio handlers in
// indexer/src/handlers/orderbook.ts (the shared OrderBook core, dispatched per
// pool type by binary.ts / spot.ts). Given a decoded chain event it mutates the
// in-memory store the same way the indexer mutates Postgres, so the locally
// materialized state matches what Hasura would eventually serve.
//
// Keep this in lockstep with the Envio handlers: any change to how an event maps
// to entity state must be mirrored there (and vice versa) or the live tail will
// diverge from the snapshot it stitches onto.

import type { Address, DecodeEventLogReturnType } from "viem";
import type { LiveFill, LiveMarket, LiveOrder, MaterializerStore } from "./store.js";
import * as Store from "./store.js";
import { type BinaryMarket, lower0x } from "./markets.js";
import type { liveEventsAbi } from "./eventsAbi.js";
import * as Interval from "./interval.js";

/**
 *  What `decodeEventLog` returns for the live ABI: a union of
 *  `{ eventName, args }`, one member per event.
 *
 *  Derived from viem rather than abitype directly — viem re-exports this and
 *  abitype is only a transitive dep, so this adds no dependency. `liveEventsAbi`
 *  is `as const`, which is what makes the union resolve instead of collapsing to
 *  `string` / `unknown`.
 */
type LiveEventLog = DecodeEventLogReturnType<typeof liveEventsAbi>;

/** Every event name in the live ABI — the discriminant. */
export type LiveEventName = LiveEventLog["eventName"];

/**
 *  A decoded chain event, normalized with the block context the reducer needs.
 *
 *  **Details**
 *
 *  A DISCRIMINATED UNION over the live ABI's event names, derived from the ABI
 *  itself — so `switch (ev.eventName)` narrows `ev.args` to exactly that event's
 *  parameters (`uint256` → `bigint`, `address` → `` `0x${string}` ``, a `tuple` →
 *  a nested object). A renamed or retyped ABI parameter becomes a `tsc` error at
 *  the read rather than a silent `undefined` at runtime.
 *
 *  **Gotchas**
 *
 *  `args` is only typed AFTER narrowing on `eventName`. A handler taking the bare
 *  union sees no usable `args`, so handlers take their own member ({@link EventOf})
 *  and {@link applyEvent}'s switch does the narrowing.
 */
export type DecodedEvent = LiveEventLog & {
  /** lowercased log source address (a pool, a BinaryMarket, or the factory) */
  address: Address;
  blockNumber: number;
  logIndex: number;
  timestampSec: number;
  txHash: string;
};

/** The {@link DecodedEvent} member for one event name — a handler's parameter type. */
export type EventOf<N extends LiveEventName> = Extract<DecodedEvent, { eventName: N }>;

/** Apply one decoded event to `store`. Does NOT commit — caller batches per block. */
export function applyEvent(ev: DecodedEvent, store: MaterializerStore): void {
  switch (ev.eventName) {
    // ---- shared OrderBook events (log source = a spot or binary pool) ----
    case "OrderFilled":
      onOrderFilled(ev, store);
      break;
    case "OrderPlaced":
      onOrderPlaced(ev, store);
      break;
    // v2 side attribution: BinaryOrderPlaced carries the explicit YES/NO kind for
    // an order (userData is opaque now). Fires alongside OrderPlaced on a binary
    // pool; order within the tx is not guaranteed, so record the kind and patch
    // the order row whether it arrives before or after OrderPlaced.
    case "BinaryOrderPlaced":
      onBinaryOrderPlaced(ev, store);
      break;
    case "OrderRested":
      onOrderRested(ev, store);
      break;
    case "OrderCancelled":
      setOrderStatus(ev, store, "Cancelled");
      break;
    // Protocol-initiated maker removals during matching (same-owner self-match
    // with CancelMaker / the exceeds-position guard on perp pools) — terminal like
    // an owner cancel. Mirror of the PerpPool handlers in indexer/src/handlers/perp.ts.
    case "OrderCancelledSelfMatch":
    case "MakerOrderCancelledExceedsPosition":
      setOrderStatus(ev, store, "Cancelled");
      break;
    case "OrderExpired":
      setOrderStatus(ev, store, "Expired");
      break;
    case "OrderReduced":
      onOrderReduced(ev, store);
      break;
    // ---- spot-only pool events ----
    case "MarkPriceUpdated":
      onMarkPriceUpdated(ev, store);
      break;
    case "OrderBookParametersUpdated":
      onBookParametersUpdated(ev, store);
      break;
    // ---- perp-only pool events ----
    case "FundingUpdated":
      onFundingUpdated(ev, store);
      break;
    case "OpenInterestUpdated":
      onOpenInterestUpdated(ev, store);
      break;
    // ---- creation: live discovery of new binary markets (MarketCreator's
    // 13-field event OR BinaryMarketsModule's 19-field event — same name,
    // distinct topic0; onMarketCreated handles both shapes) ----
    case "MarketCreated":
      onMarketCreated(ev, store);
      break;
    // v2 pool→market binding close: PoolReleased ends the pool's current binding
    // (the pool may next be recycled onto a different market). The next
    // MarketCreated on that pool opens a fresh binding.
    case "PoolReleased":
      onPoolReleased(ev, store);
      break;
    // v2 finalize: two events share this name (distinct topic0 → distinct arg
    // shape). The MODULE's `MarketFinalized(marketId, pool, marketKey)` flips
    // status; the SETTLEMENT's `MarketFinalized(marketKey, pool, nonce,
    // collateralToken, netBacking, …)` snapshots the net backing. Dispatch by
    // which args are present.
    case "MarketFinalized":
      onMarketFinalized(ev, store);
      break;
    // ---- BinaryPool backing events (log source = a binary pool) ----
    case "SetMinted":
      // A YES+NO pair minted from collateral → backing grows by `amount`.
      onBacking(ev, store, ev.args.amount, "add");
      break;
    case "SetBurned":
      // A YES+NO pair burned back to collateral → backing shrinks by `amount`.
      onBacking(ev, store, ev.args.amount, "sub");
      break;
    // v2 finalize on the POOL side: the entire setBacking swept to settlement →
    // the pool's live backing is 0 (the settlement's MarketFinalized then records
    // the authoritative post-skim `netBacking` on the same market row).
    case "PoolFinalized":
      onPoolFinalized(ev, store);
      break;
    // v2: redemption moved to the settlement singleton. Its `Redeemed` carries
    // `marketKey` + `collateralOut` and debits that market's settlement backing.
    // (The removed v1 pool `Redeemed` debited pool setBacking instead.)
    case "Redeemed":
      onSettlementRedeemed(ev, store);
      break;
    // ---- BinaryMarket lifecycle (log source = the market contract) ----
    case "StatusChanged":
      onStatusChanged(ev, store);
      break;
    case "Resolved":
      onResolved(ev, store);
      break;
    case "Voided":
      onVoided(ev, store);
      break;
    default:
      break;
  }
}

function marketByPool(store: MaterializerStore, pool: string): LiveMarket | undefined {
  const id = store.poolToMarket.get(pool);
  return id ? store.markets.get(id) : undefined;
}

function binaryByAddress(store: MaterializerStore, addr: string): BinaryMarket | undefined {
  const id = store.addressToMarket.get(addr);
  const m = id ? store.markets.get(id) : undefined;
  return m && m.marketType === "BINARY" ? m : undefined;
}

// v2 side attribution: BinaryOrderPlaced(orderId, kind) carries the explicit
// YES/NO kind. BinaryOrderPlaced and the base OrderPlaced fire in the same tx
// but the on-chain order between them is not guaranteed, so we bridge via the
// store's pendingKinds map: an OrderPlaced consumes a pending kind if present; a
// BinaryOrderPlaced back-patches an already-created order row if OrderPlaced
// landed first. Bounded by set/delete on consumption.
function onBinaryOrderPlaced(ev: EventOf<"BinaryOrderPlaced">, store: MaterializerStore): void {
  const key = Store.orderKey(ev.address, ev.args.orderId);
  const side = Store.sideOfKind(ev.args.kind);
  const existing = store.orders.get(key);
  if (existing) {
    store.orders.set(key, { ...existing, side });
    store.pendingKinds.delete(key);
  } else {
    store.pendingKinds.set(key, side);
  }
}

// OrderPlaced fires LAST in the tx (after all fills). Creates the order row.
// Mirror of orderbook.ts applyOrderPlaced with the per-kind adapter folded in:
// binary takes the YES/NO side from the paired BinaryOrderPlaced (v2 — userData
// is opaque now) and rests as "Open"; spot has no side and is born "Closed"
// until OrderRested promotes it.
function onOrderPlaced(ev: EventOf<"OrderPlaced">, store: MaterializerStore): void {
  const market = marketByPool(store, ev.address);
  if (!market) return;
  const placed = ev.args.placedOrder;
  const orderId: bigint = placed.orderId;
  const isBid: boolean = placed.isBid;
  const userData: bigint = placed.userData;
  const fullQuantity: bigint = placed.fullQuantity;
  const quantityRemaining: bigint = placed.quantityRemaining;
  const expireTimestampNs: bigint = placed.expireTimestampNs;
  const isBinary = market.marketType === "BINARY";
  const key = Store.orderKey(ev.address, orderId);
  // v2: side comes from the paired BinaryOrderPlaced (by orderId), never userData.
  const side = isBinary ? store.pendingKinds.get(key) : undefined;
  if (side) store.pendingKinds.delete(key);

  const order: LiveOrder = {
    id: key,
    market_id: market.id,
    pool: ev.address,
    orderId: orderId.toString(),
    owner: lower0x(placed.owner),
    side,
    isBid,
    // userData is opaque MM bookkeeping in v2 — carried verbatim, never decoded.
    userData: userData.toString(),
    price: (placed.price).toString(),
    fullQuantity: fullQuantity.toString(),
    quantityRemaining: quantityRemaining.toString(),
    filledQuantity: (fullQuantity - quantityRemaining).toString(),
    // Mirror of indexer orderbook.ts: carry the maker's TIF so the book can drop
    // it once now > expireTimestampNs (on-chain expiry is lazy — no event fires).
    expireTimestampNs: expireTimestampNs.toString(),
    // Fully filled on placement → OrderRested won't fire → mark Filled directly.
    status: quantityRemaining === 0n ? "Filled" : isBinary ? "Open" : "Closed",
    rested: false,
    createdAt: ev.timestampSec.toString(),
    txHash: ev.txHash,
  };
  store.orders.set(key, order);
}

function onOrderRested(ev: EventOf<"OrderRested">, store: MaterializerStore): void {
  const key = Store.orderKey(ev.address, ev.args.orderId);
  const order = store.orders.get(key);
  if (!order) return;
  // Spot promotes the "Closed" placeholder to "Open"; binary just flips rested.
  store.orders.set(key, { ...order, rested: true, status: order.status === "Closed" ? "Open" : order.status });
}

function setOrderStatus(
  ev: EventOf<"OrderCancelled" | "OrderCancelledSelfMatch" | "MakerOrderCancelledExceedsPosition" | "OrderExpired">, store: MaterializerStore, status: LiveOrder["status"]): void {
  const key = Store.orderKey(ev.address, ev.args.orderId);
  const order = store.orders.get(key);
  if (!order) return;
  store.orders.set(key, { ...order, status });
}

function onOrderReduced(ev: EventOf<"OrderReduced">, store: MaterializerStore): void {
  const key = Store.orderKey(ev.address, ev.args.orderId);
  const order = store.orders.get(key);
  if (!order) return;
  // Mirror indexer applyOrderReduced, which mirrors the contract: `_reduceOrder`
  // decrements `fullQuantity` AND `quantityRemaining` by the same reduction. A reduce
  // returns UN-filled quantity, so `filledQuantity` must NOT move — but `fullQuantity`
  // must, or the order keeps claiming a size the chain has already shrunk, and any
  // later `fullQuantity - quantityRemaining` reads back more filled than ever traded.
  const reduction = BigInt(order.quantityRemaining) - ev.args.newQuantity;
  store.orders.set(key, {
    ...order,
    fullQuantity: (BigInt(order.fullQuantity) - reduction).toString(),
    quantityRemaining: ev.args.newQuantity.toString(),
  });
}

// OrderFilled — base OrderBook event shared by spot + binary pools. Fires from
// inside the matching loop BEFORE the taker's OrderPlaced for the same tx, so
// the taker's order isn't in the store yet. We resolve the maker from the store
// (placed in a prior tx) and write a partial LiveFill with the maker side and
// takerIsBid (the maker's inverse) filled; the rest of the taker info stays
// undefined until read-time back-join via the takerOrder relation. Mirror of
// orderbook.ts applyOrderFilled.
function onOrderFilled(ev: EventOf<"OrderFilled">, store: MaterializerStore): void {
  const market = marketByPool(store, ev.address);
  if (!market) return;

  const makerKey = Store.orderKey(ev.address, ev.args.makerOrderId);
  const makerOrder = store.orders.get(makerKey);
  const makerSide = makerOrder?.side;
  const maker = makerOrder?.owner;

  const quantity: bigint = ev.args.quantityFilled;
  const fillPrice: bigint = ev.args.fillPrice;
  // quote value scales by the market's own base decimals (mirror of orderbook.ts).
  const quoteQuantity = (quantity * fillPrice) / 10n ** BigInt(market.baseDecimals ?? Store.DECIMALS);

  const id = Store.fillKey(ev.blockNumber, ev.logIndex);
  const fill: LiveFill = {
    id,
    market_id: market.id,
    pool: ev.address,
    // Taker is unknown at OrderFilled time; resolved via the takerOrder join.
    taker: undefined,
    maker,
    takerSide: undefined,
    makerSide,
    // The taker takes the opposite side of the maker's resting order — known
    // right here, so derive it (mirror of orderbook.ts). Falls back to the
    // takerOrder join only when the maker order was never witnessed.
    takerIsBid: makerOrder ? !makerOrder.isBid : undefined,
    kind: undefined,
    fillPrice: fillPrice.toString(),
    quantity: quantity.toString(),
    quoteQuantity: quoteQuantity.toString(),
    takerRemainingQuantity: (ev.args.takerRemainingQuantity).toString(),
    makerRemainingQuantity: (ev.args.makerRemainingQuantity).toString(),
    timestamp: ev.timestampSec.toString(),
    blockNumber: ev.blockNumber,
    logIndex: ev.logIndex,
    txHash: ev.txHash,
    // Foreign keys to LiveOrder rows — missing taker side/address derives via join.
    takerOrder_id: Store.orderKey(ev.address, ev.args.takerOrderId),
    makerOrder_id: makerKey,
  };
  store.fills.set(id, fill);

  // Update the maker order's post-fill remaining/status. Taker order will be
  // created by the trailing OrderPlaced in the same tx.
  if (makerOrder) {
    const makerRemaining: bigint = ev.args.makerRemainingQuantity;
    store.orders.set(makerKey, {
      ...makerOrder,
      quantityRemaining: makerRemaining.toString(),
      filledQuantity: (BigInt(makerOrder.fullQuantity) - makerRemaining).toString(),
      status: makerRemaining === 0n && makerOrder.status === "Open" ? "Filled" : makerOrder.status,
    });
  }

  const next: LiveMarket = {
    ...market,
    lastPrice: fillPrice.toString(),
    lastTradeAt: ev.timestampSec.toString(),
    cumulativeBaseVolume: (BigInt(market.cumulativeBaseVolume) + quantity).toString(),
    cumulativeQuoteVolume: (BigInt(market.cumulativeQuoteVolume) + quoteQuantity).toString(),
    tradeCount: (BigInt(market.tradeCount) + 1n).toString(),
  };
  store.markets.set(market.id, next);
}

// BinaryPool backing events (SetMinted / SetBurned) — log source is a binary
// POOL, so resolve the market by pool address exactly like OrderFilled (mirror
// of the getMarketByPool lookup in indexer/src/handlers/binary.ts). The running
// total is stored on the market as a decimal string; parse → adjust →
// stringify, mirroring the indexer's floor-at-zero on subtractions EXACTLY:
//   SetMinted:  backing += amount
//   SetBurned:  backing  = backing > amount ? backing - amount : 0
// (v2: pool redemption is gone — `PoolFinalized` zeroes the pool backing and the
// settlement events drive `netBacking` from there.) A pool event for a market
// not in the store (or a non-binary market) is a safe no-op.
function onBacking(
  ev: DecodedEvent,
  store: MaterializerStore,
  delta: bigint,
  op: "add" | "sub",
): void {
  const market = marketByPool(store, ev.address);
  if (!market || market.marketType !== "BINARY") return;
  const current = BigInt(market.backing);
  const next = op === "add" ? current + delta : current > delta ? current - delta : 0n;
  store.markets.set(market.id, { ...market, backing: next.toString() });
}

// ---- spot-only pool events (mirror of spot.ts) ----

function onMarkPriceUpdated(ev: EventOf<"MarkPriceUpdated">, store: MaterializerStore): void {
  const market = marketByPool(store, ev.address);
  if (!market || market.marketType !== "SPOT") return;
  store.markets.set(market.id, { ...market, markPrice: (ev.args.markPrice).toString() });
}

function onBookParametersUpdated(ev: EventOf<"OrderBookParametersUpdated">, store: MaterializerStore): void {
  const market = marketByPool(store, ev.address);
  // Spot and perp pools both carry tick/lot/min book params (binary does not).
  if (!market || market.marketType === "BINARY") return;
  const p = ev.args.newParameters;
  store.markets.set(market.id, {
    ...market,
    tickSize: p.tickSize.toString(),
    minQuantity: p.minQuantity.toString(),
    lotSize: p.lotSize.toString(),
  });
}

// ---- perp-only pool events (mirror of indexer/src/handlers/perp.ts) ----

function onFundingUpdated(ev: EventOf<"FundingUpdated">, store: MaterializerStore): void {
  const market = marketByPool(store, ev.address);
  if (!market || market.marketType !== "PERP") return;
  // markPrice == 0 is the contract's SENTINEL for a stale/reverting mark feed, not a
  // price of zero — leave the previous mark in place rather than zeroing it.
  const markPrice = ev.args.markPrice as bigint | undefined;
  const markOk = markPrice != null && markPrice !== 0n;
  store.markets.set(market.id, {
    ...market,
    fundingRate: (ev.args.fundingRate).toString(),
    cumulativeFundingPerUnit: (ev.args.cumulativeFundingPerUnit).toString(),
    indexPrice: (ev.args.indexPrice).toString(),
    fundingUpdatedAt: ev.timestampSec.toString(),
    ...(markOk
      ? { markPrice: markPrice.toString(), markPriceUpdatedAt: ev.timestampSec.toString() }
      : {}),
  });

  // ADDITIONALLY append to the live funding series, so the tail can EXTEND a chart rather
  // than only overwrite the market row.
  //
  // Keyed on (block, logIndex) and written UNCONDITIONALLY, which is what the key already
  // buys: a duplicate delivery lands on itself, and a reorg replay that carries different
  // decoded args at the same position REPLACES the stale value. An earlier revision
  // guarded this with `if (has(key)) return`, which made the second case wrong — it kept
  // the pre-reorg row — while adding nothing to the first. Plain `set` is also what the
  // tail already does for fills (`store.fills.set(id, fill)`).
  const key = `${ev.blockNumber}_${ev.logIndex}`;
  store.fundingUpdates.set(key, {
    id: `${ev.address.toLowerCase()}_${ev.blockNumber}_${ev.logIndex}`,
    pool: ev.address.toLowerCase(),
    fundingRate: (ev.args.fundingRate as bigint).toString(),
    cumulativeFundingPerUnit: (ev.args.cumulativeFundingPerUnit as bigint).toString(),
    indexPrice: (ev.args.indexPrice as bigint).toString(),
    markPrice: markOk ? markPrice.toString() : null,
    intervalsSettled: ((ev.args.intervalsSettled as bigint | undefined) ?? 0n).toString(),
    // The indexer derives intervalsAccrued and the params in force from the epoch
    // series; the tail has neither, so it reports what the event carries and leaves the
    // rest to the indexed row that follows.
    fundingWindowSec: market.fundingWindowSec,
    fundingIntervalSec: market.fundingIntervalSec,
    timestamp: ev.timestampSec.toString(),
    blockNumber: ev.blockNumber.toString(),
    logIndex: ev.logIndex,
  });
}

function onOpenInterestUpdated(ev: EventOf<"OpenInterestUpdated">, store: MaterializerStore): void {
  const market = marketByPool(store, ev.address);
  if (!market || market.marketType !== "PERP") return;
  store.markets.set(market.id, {
    ...market,
    // ONE total, not a (long, short) pair.
    openInterest: (ev.args.openInterest as bigint).toString(),
    openInterestUpdatedAt: ev.timestampSec.toString(),
  });
}

// ---- creation: a new binary market appears without touching the indexer ----
// Two sources, one handler: MarketCreator.MarketCreated (13 fields, carries
// intervalSec) and BinaryMarketsModule.MarketCreated (19 fields, carries the
// (operatorId, venueId) origin attribution + context). Both carry every field
// the market row needs (marketId/market/pool/yesId/noId/collateral/asset/
// question/strike/tradingStart/expiry). For MarketCreator-created markets BOTH
// fire in one tx (module first — it emits inside createMarket), so the
// module-built row wins and the creator's event no-ops on the `has` guard,
// exactly like the indexer (indexer/src/handlers/binary.ts).

function onMarketCreated(ev: EventOf<"MarketCreated">, store: MaterializerStore): void {
  const id = lower0x(ev.args.marketId);
  if (store.markets.has(id)) return;
  const tradingStart = Number(ev.args.tradingStart);
  const expiry = Number(ev.args.expiry);
  // MarketCreator's event carries the cadence explicitly; the module's does not
  // — derive it from the market's own window like the indexer does (binary.ts:
  // consecutive series markets are boundary-aligned, so `expiry - tradingStart`
  // IS the cadence).
  const intervalSecStr =
    "intervalSec" in ev.args ? ev.args.intervalSec.toString() : String(expiry - tradingStart);
  const market: BinaryMarket = {
    id,
    marketType: "BINARY",
    poolAddress: lower0x(ev.args.pool),
    lastPrice: null,
    lastTradeAt: null,
    cumulativeBaseVolume: "0",
    cumulativeQuoteVolume: "0",
    tradeCount: "0",
    baseDecimals: Store.DECIMALS,
    quoteDecimals: Store.DECIMALS,
    createdAtTimestamp: ev.timestampSec.toString(),
    marketId: id,
    marketAddress: lower0x(ev.args.market),
    yesTokenId: (ev.args.yesId).toString(),
    noTokenId: (ev.args.noId).toString(),
    collateral: lower0x(ev.args.collateral),
    asset: ev.args.asset,
    question: ev.args.question,
    // Mirror indexer binary.ts: a market discovered live AT/AFTER its expiry is
    // Settling, not Trading/Listed (collapse expired-at-create → Settling).
    status:
      ev.timestampSec >= tradingStart && ev.timestampSec < expiry
        ? "Trading"
        : ev.timestampSec >= expiry
          ? "Settling"
          : "Listed",
    // Not carried by the live MarketCreator.MarketCreated event — filled on the
    // next snapshot (same null-until-snapshot pattern as venueId/backing below).
    oracleQuestion: null,
    strike: (ev.args.strike).toString(),
    tradingStart: tradingStart.toString(),
    expiry: expiry.toString(),
    winningOutcome: null,
    resolvedAtBlock: null,
    resolvedAtTimestamp: null,
    createdByTx: null,
    voided: false,
    backing: "0",
    // v2 pool binding: the module's MarketCreated carries the pool's market nonce
    // (part of the outcome-id encoding); the MarketCreator's 13-field event does
    // not — null until the next snapshot fills it. Fresh markets start
    // unfinalized with no settlement record.
    nonce: "nonce" in ev.args ? ev.args.nonce.toString() : null,
    finalized: false,
    netBacking: null,
    intervalSec: intervalSecStr,
    // Serve the timeframe label here too (the indexer path stamps it in
    // `toMarket`) so a live-tail-discovered market carries `interval` before the
    // next snapshot merge — one source of truth (see interval.ts).
    interval: Interval.marketIntervalLabel({ intervalSec: intervalSecStr }),
    // Origin attribution: only the module's 19-field MarketCreated carries it.
    // Markets discovered via the MarketCreator event show null until the next
    // snapshot fills it — same pattern as `backing`.
    operatorId: "operatorId" in ev.args ? Number(ev.args.operatorId) : null,
    venueId: "venueId" in ev.args ? lower0x(ev.args.venueId) : null,
    // Opaque creator-supplied bytes — module event only (null-until-snapshot otherwise).
    context: "context" in ev.args ? lower0x(ev.args.context) : null,
  };
  store.indexMarket(market);
}

// ---- settlement-extraction v2: finalize / release / settlement redemption ----

// The settlement marketKey encodes `(uint160(pool) << 64) | nonce`. Resolve the
// market it belongs to: fast path via the pool's CURRENT binding (verifying the
// nonce when the row carries one), slow path a scan for a PAST market of a
// recycled pool (the binding has moved on but the old market row is retained).
function binaryByMarketKey(store: MaterializerStore, key: bigint): BinaryMarket | undefined {
  const pool = `0x${(key >> 64n).toString(16).padStart(40, "0")}`;
  const nonce = (key & ((1n << 64n) - 1n)).toString();
  const bound = marketByPool(store, pool);
  if (
    bound &&
    bound.marketType === "BINARY" &&
    (bound.nonce == null || bound.nonce === nonce)
  ) {
    return bound;
  }
  for (const m of store.markets.values()) {
    if (m.marketType === "BINARY" && m.poolAddress === pool && m.nonce === nonce) return m;
  }
  return undefined;
}

// Pool-side finalize (log source = the pool): the entire setBacking was swept to
// the settlement singleton, so the pool's live backing is 0. The authoritative
// post-skim net backing lands on the same row via the settlement MarketFinalized.
function onPoolFinalized(ev: EventOf<"PoolFinalized">, store: MaterializerStore): void {
  const market = marketByPool(store, ev.address);
  if (!market || market.marketType !== "BINARY") return;
  store.markets.set(market.id, { ...market, backing: "0", finalized: true });
}

// Module PoolReleased(marketId, pool, creator): the pool→market binding CLOSES —
// the pool may next be recycled onto a different market, and order events after
// this must not attribute to the released market. Deleting the binding (only if
// it still points at this market) makes later pool logs no-ops until the next
// MarketCreated on the pool re-opens a binding.
function onPoolReleased(ev: EventOf<"PoolReleased">, store: MaterializerStore): void {
  const id = ev.args.marketId.toLowerCase();
  const pool = ev.args.pool.toLowerCase();
  if (store.poolToMarket.get(pool) === id) store.poolToMarket.delete(pool);
}

// MarketFinalized — TWO events share the name (distinct topic0):
//   module:     MarketFinalized(marketId, pool, marketKey)          → flag the row
//   settlement: MarketFinalized(marketKey, pool, nonce, collateral,
//               netBacking, voided, winningOutcome)                 → net backing
// Dispatch by args shape (only the module's carries `marketId`).
function onMarketFinalized(ev: EventOf<"MarketFinalized">, store: MaterializerStore): void {
  // `in` rather than a null check: the two shapes are a real union now, so this
  // narrows `ev.args` to one variant and the fields below are checked, not cast.
  if ("marketId" in ev.args) {
    const id = ev.args.marketId.toLowerCase();
    const m = store.markets.get(id);
    // "Finalized" is the indexer-derived terminal status (ClobMarketStatus) —
    // it SUPERSEDES Resolved/Voided once finalize lands.
    if (m && m.marketType === "BINARY") {
      store.markets.set(id, { ...m, finalized: true, status: "Finalized" });
    }
    return;
  }
  const market = binaryByMarketKey(store, ev.args.marketKey);
  if (!market) return;
  store.markets.set(market.id, {
    ...market,
    finalized: true,
    status: "Finalized",
    // The pool swept its whole setBacking out (pool backing 0); the settlement
    // record's NET backing (post fee-skim) is the redeemable pot from here on.
    backing: "0",
    netBacking: ev.args.netBacking.toString(),
  });
}

// Settlement Redeemed(marketKey, holder, to, outcomeIdx, amountBurned,
// collateralOut) — a payout debits the market's settlement-side net backing
// (floor 0, mirroring the indexer's subtraction guard). The v1 pool Redeemed
// (which debited pool setBacking) no longer exists.
function onSettlementRedeemed(ev: EventOf<"Redeemed">, store: MaterializerStore): void {
  const market = binaryByMarketKey(store, ev.args.marketKey);
  if (!market || market.netBacking == null) return;
  const out = ev.args.collateralOut;
  const cur = BigInt(market.netBacking);
  store.markets.set(market.id, {
    ...market,
    netBacking: (cur > out ? cur - out : 0n).toString(),
  });
}

// ---- BinaryMarket lifecycle (mirror of binary.ts market handlers) ----

function onStatusChanged(ev: EventOf<"StatusChanged">, store: MaterializerStore): void {
  const market = binaryByAddress(store, ev.address);
  if (!market) return;
  const status = Store.BINARY_MARKET_STATUS[Number(ev.args.newStatus)];
  if (!status) return;
  store.markets.set(market.id, { ...market, status });
}

function onResolved(ev: EventOf<"Resolved">, store: MaterializerStore): void {
  const market = binaryByAddress(store, ev.address);
  if (!market) return;
  // Settlement v3: the event carries the payout VECTOR, not a single winner.
  // Derive winningOutcome as its argmax (a binary win is [D,0]/[0,D]).
  const vec = (ev.args.payoutNumerators ?? []);
  let winningOutcome = 0;
  for (let i = 1; i < vec.length; i++) {
    if ((vec[i] ?? 0n) > (vec[winningOutcome] ?? 0n)) winningOutcome = i;
  }
  store.markets.set(market.id, {
    ...market,
    status: "Resolved",
    winningOutcome,
  });
}

function onVoided(ev: EventOf<"Voided">, store: MaterializerStore): void {
  const market = binaryByAddress(store, ev.address);
  if (!market) return;
  store.markets.set(market.id, { ...market, status: "Voided", voided: true });
}
