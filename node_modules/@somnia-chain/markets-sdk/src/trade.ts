// Write side of the SDK — placing/cancelling orders + complete-set settlement.
// You give it a signer (a private key / local account, or a browser WalletClient)
// and it sends the pool / market transactions. This is the only part of
// @somnia-chain/markets-sdk that signs; the rest (the tail + hooks) is read-only.
//
// Latency doctrine: a local-signer write is ONE round-trip. Gas is a fixed
// generous ceiling (never estimated), fees are fixed (never estimated), the
// nonce is tracked locally (fetched once, then incremented), and the signed tx
// goes out via Somnia's realtime_sendRawTransaction — which blocks server-side
// and returns the receipt (with logs) in the same call. Nothing is polled and
// nothing falls back: the WebSocket transport is assumed healthy and errors
// propagate to the caller.
//
// Architecture (settlement-extraction v2): trading + complete-set (placeBinaryOrder /
// mintSet / burnSet) live on the pool; REDEMPTION lives on the permanent
// BinarySettlement singleton, reached module-routed (`redeem`, unchanged
// signatures) or directly (`redeemDirect`). The trader approves whichever
// contract pulls the escrow: the pool for orders/sets, the module for redeem,
// the settlement for redeemDirect.

import { type Account, type Address, type Hash, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import * as Writer from "./writer.js";
import type { UnsignedCall, UnsignedOrder } from "./writer.js";
import * as Orders from "./orders.js";
import * as Fees from "./fees.js";
import * as Testnet from "./testnet.js";
import * as BinarySettlement from "./binary/settlement.js";
import * as SpotStops from "./spot/stops.js";
import * as SpotVaultMode from "./spot/vaultMode.js";
import * as SpotOperatorGrants from "./spot/operatorGrants.js";
import * as VaultFunding from "./vault/funding.js";
import * as PerpState from "./perp/state.js";
import * as PerpMargin from "./perp/margin.js";
import type { UnsignedMarginDeposit } from "./perp/margin.js";
import * as PerpStops from "./perp/stops.js";
import type { UnsignedPerpStopOrder } from "./perp/stops.js";
import * as BinarySets from "./binary/sets.js";
import type { ClientConfig } from "./config.js";
import type { Debug } from "./debug.js";
import * as ReadsAbi from "./readsAbi.js";
import * as ModuleAbi from "./moduleAbi.js";
import * as Ids from "./ids.js";
import type { BinarySide } from "./store.js";
import * as TradeAbi from "./tradeAbi.js";

/**
 *  Signer + defaults for `client.createTrader` — how a {@link Trader} signs. Provide
 *  at least one signing source: `privateKey`, a local `account`, or a `walletClient`.
 */
export interface TraderConfig {
  /**
   *  A pre-built signer (e.g. a browser/wagmi wallet over an injected provider).
   *  Only needed when the SDK can't sign locally — with `privateKey` / a local
   *  `account`, the SDK signs itself and sends over the client's WebSocket via
   *  realtime_sendRawTransaction (send + confirm in one round-trip).
   */
  walletClient?: WalletClient;
  /** A local signing account (e.g. from viem's privateKeyToAccount). */
  account?: Account | Address;
  /** Private key — the SDK derives the account. */
  privateKey?: `0x${string}`;
  /** Read client for allowance/receipts. Defaults to the client's WebSocket client. */
  publicClient?: PublicClient;
  /** Outcome/collateral decimals (default 6). */
  decimals?: number;
  /**
   *  Default gas ceiling per tx (10,000,000 when unset); each write can override
   *  per-call via its params' `gas`.
   */
  gas?: bigint;
}

/** Base result of a confirmed write — the SDK waits for the receipt before resolving. */
export interface TxResult {
  /** The transaction hash. */
  hash: Hash;
  /** The mined receipt (status, gas used, logs). */
  receipt: TransactionReceipt;
}

/** A single fill that occurred within a tx (decoded from the pool's OrderFilled). */
export interface OrderFill {
  /** On-chain id of the taker (incoming) order. */
  takerOrderId: bigint;
  /** On-chain id of the maker (resting) order that matched. */
  makerOrderId: bigint;
  /** Quantity exchanged in this fill, raw units (outcome tokens on binary, base on spot). */
  quantityFilled: bigint;
  /** Taker order's quantity still unfilled after this fill, raw units. */
  takerRemainingQuantity: bigint;
  /** Maker order's quantity still resting after this fill, raw units. */
  makerRemainingQuantity: bigint;
  /**
   *  Fill price — the YES price on a binary pool (raw collateral units per whole
   *  outcome token); raw quote units per whole base on a spot pool.
   */
  fillPrice: bigint;
}

/** Result of placing an order: the confirmed tx plus what it did on the book. */
/** {@link Trader.placeSpotStopOrder}'s result: the tx plus the registry id. */
export interface PlaceStopOrderResult extends TxResult {
  /**
   *  The pending order's id on the registry (from `PendingOrderCreated`) —
   *  pass to {@link Trader.cancelStopOrder}. Undefined only if the event
   *  wasn't found in the receipt (an ABI/deployment drift, not a normal path).
   */
  stopOrderId?: bigint;
}

/**
 *  {@link Trader.placePerpStopOrder}'s result: the tx plus the registry id(s).
 *
 *  Both ids come from `PendingOrderCreated`, because the function's return value is
 *  unreadable from a receipt.
 */
export interface PlacePerpStopOrderResult extends TxResult {
  /**
   *  The id of the leg described by the call's own top-level fields — pass to
   *  {@link Trader.cancelPerpStopOrder}. Undefined only if the event wasn't found in
   *  the receipt (an ABI/deployment drift, not a normal path).
   */
  stopOrderId?: bigint;
  /** The `pair` leg's id, when one was placed. Undefined for a single stop. */
  pairedStopOrderId?: bigint;
}

export interface PlaceOrderResult extends TxResult {
  /** The resting order's on-chain id, if the order rested (OrderPlaced emitted). */
  orderId?: bigint;
  /** Fills that executed in this tx (empty for a cleanly-resting limit order). */
  fills: OrderFill[];
}

/**
 *  Inputs to {@link Trader.placeOrder} — a binary YES/NO limit or market order
 *  on a BinaryPool.
 */
export interface PlaceOrderParams {
  /** BinaryPool address. */
  pool: Address;
  /**
   *  Side + outcome ("BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO") — mapped onto
   *  the pool's OrderKind enum. Buys escrow collateral, sells escrow outcome tokens.
   */
  side: BinarySide;
  /** YES limit price as raw collateral units per whole outcome token (price × 10^decimals). */
  price: bigint;
  /** Outcome-token quantity, raw units. */
  quantity: bigint;
  /**
   *  Outcome-token singleton + this pool's YES/NO ids. Resolved from the pool
   *  (IBinaryPool.outcomeToken/yesId/noId) if omitted.
   */
  outcomeToken?: Address;
  /** This pool's YES position id on the singleton; resolved from the pool if omitted. */
  yesId?: bigint;
  /** This pool's NO position id on the singleton; resolved from the pool if omitted. */
  noId?: bigint;
  /** Collateral (buy-side escrow) token; resolved from the pool if omitted. */
  collateral?: Address;
  /**
   *  Order expiry in ns. Defaults to the POOL'S MARKET EXPIRY, not to a far
   *  future — a binary order must satisfy `0 < expireNs <= pool.marketExpiryNs`
   *  or the pool rejects it with `OrderExpiryBeyondMarket`, which keeps the book
   *  drainable by the expiry sweeps once the market locks.
   *
   *  So an order left to default stops resting when its market expires. On a
   *  rolling series that is hours, not decades. There is no GTC here; ~50y is
   *  the spot and perp default, where there is no market expiry to outlive.
   *
   *  A value already in the past reverts (`OrderAlreadyExpired`) — a deliberate
   *  choice is honoured verbatim rather than silently clamped.
   */
  expireTimestampNs?: bigint;
  /**
   *  OrderBook OrderType (see {@link ORDER_TYPE}): 0 NormalOrder (rest), 1 FillOrKill,
   *  2 ImmediateOrCancel, 3 PostOnly. Defaults to 0. A market order is an IOC (2)
   *  placed at the price extreme so it crosses immediately and cancels the remainder.
   */
  orderType?: number;
  /** Approve the escrow token to the pool if allowance is short (default true). */
  autoApprove?: boolean;
  /**
   *  Routing/builder frontend address to attribute the order to. Requires the
   *  trader to have opted this builder in via {@link Trader.approveBuilder}.
   *  Omit (or zero) for no routing fee.
   */
  builder?: Address;
  /**
   *  Per-order builder/routing fee in the pool's native bps×1000 unit (≤ the
   *  venue's frozen `maxBuilderFee` ceiling AND ≤ the trader's approval). 0 = none.
   */
  builderFeeBpsTimes1k?: bigint;
  /**
   *  Opaque market-maker bookkeeping tag (v2). Forwarded verbatim to the pool
   *  (stored on the order + emitted in `OrderPlaced`); the SDK never interprets it
   *  and the pool no longer uses it for side derivation. Default 0.
   */
  userData?: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Opt a routing/builder frontend in to charge up to `maxFeeBpsTimes1k` (pool
 *  bps×1000 unit) per order the trader submits with that builder code. Set 0 to revoke.
 */
export interface ApproveBuilderParams {
  /** Pool address (binary, spot, or perp). The approval is per-pool. */
  pool: Address;
  /** Builder/routing frontend address. */
  builder: Address;
  /** Max per-order builder fee to allow (pool bps×1000). 0 revokes. */
  maxFeeBpsTimes1k: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.cancelOrder} — cancel one resting order, returning its
 *  remaining escrow to the owner. Works on spot AND binary pools.
 */
export interface CancelOrderParams {
  /** BinaryPool (or SpotPool) address hosting the resting order. */
  pool: Address;
  /** uint128 OrderId (decimal string or bigint). */
  orderId: bigint | string;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Shrink a resting order's remaining quantity IN PLACE — keeps its price-time
 *  queue priority (unlike {@link Trader.placeOrder} + amend, which re-queues at
 *  the back). Works on spot AND binary pools: BinaryPool implements the
 *  reduce-refund hook, so the freed escrow (collateral for a buy, outcome tokens
 *  for a sell) is returned to the owner.
 */
export interface ReduceOrderParams {
  /** BinaryPool (or SpotPool) address hosting the resting order. */
  pool: Address;
  /** uint128 OrderId of the resting order to shrink (decimal string or bigint). */
  orderId: bigint | string;
  /**
   *  The order's NEW remaining quantity. Must be a `lotSize` multiple,
   *  `>= minQuantity`, and strictly less than the current remaining. Reverts
   *  on-chain (`ExpiredOrderMustBeCancelled`) if the order has already expired —
   *  use {@link Trader.cancelOrder} to recover an expired order's funds.
   */
  newQuantityRemaining: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Permissionless keeper drain: clean an explicit list of EXPIRED resting orders
 *  on a pool, returning each order's locked escrow to its owner. Best-effort —
 *  non-expired or stale ids are silently skipped on-chain (no revert).
 */
export interface CancelExpiredOrdersParams {
  /** BinaryPool (or SpotPool) address whose expired orders to clean. */
  pool: Address;
  /** uint128 OrderIds to attempt to clean (decimal strings or bigints). */
  orderIds: (bigint | string)[];
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Permissionless keeper drain: walk ONE price level from the best order on a
 *  side, cleaning up to `maxCount` expired orders. The complement of
 *  {@link CancelExpiredOrdersParams} when you have a price level rather than a
 *  list of ids (e.g. draining a locked market's book so its pool can be
 *  released). Each cleaned order's escrow returns to its owner.
 */
export interface SweepExpiredAtLevelParams {
  /** BinaryPool (or SpotPool) address to sweep. */
  pool: Address;
  /** True to sweep the bid side, false the ask side. */
  isBid: boolean;
  /** The exact price level to sweep (raw pool price units). */
  price: bigint;
  /** Max number of expired orders to clean in this call. */
  maxCount: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  OrderBook OrderType — shared by binary `placeOrder` and spot `placeSpotOrder`
 *  (both ride the same OrderBook core): 0 NormalOrder (limit), 1 FillOrKill,
 *  2 ImmediateOrCancel (market), 3 PostOnly. Pass to either call's `orderType`.
 */
export const ORDER_TYPE = {
  /** 0 — NormalOrder: fill what crosses, rest the remainder on the book. */
  LIMIT: 0,
  /** 1 — FillOrKill: fill the full quantity immediately, or place nothing. */
  FILL_OR_KILL: 1,
  /** 2 — ImmediateOrCancel: fill what crosses now, cancel the remainder. */
  MARKET: 2,
  /** 3 — PostOnly: rest only — never takes liquidity. */
  POST_ONLY: 3,
} as const;


/**
 *  Inputs to {@link Trader.placeSpotOrder} — a spot limit or market order on a
 *  SpotPool.
 */
export interface PlaceSpotOrderParams {
  /** SpotPool address. */
  pool: Address;
  /** True = buy the base asset (pay quote); false = sell base (pay base/native). */
  isBid: boolean;
  /**
   *  Limit price — raw quote units per whole base token. For a MARKET order pass a
   *  crossing price (best opposite level ± slippage); it bounds the escrow.
   */
  price: bigint;
  /** Base quantity, raw base units. */
  quantity: bigint;
  /** Base-token decimals (for the buy-side escrow math). */
  baseDecimals: number;
  /** Quote token (approved on a buy). */
  quoteToken: Address;
  /** Base token (approved on a non-native sell). */
  baseToken: Address;
  /** True when the base asset is native SOMI (sell pays via msg.value). */
  baseIsNative?: boolean;
  /**
   *  Order expiry in ns. Defaults to ~50y (GTC). A spot pool has no market
   *  expiry to outlive, so the binary verb's `OrderExpiryBeyondMarket` cap does
   *  not apply here.
   *
   *  Two traps:
   *  - A timestamp already in the PAST reverts with `OrderAlreadyExpired`. It
   *    used to be accepted silently — the pool skipped the placement and
   *    returned no order id, so the transaction succeeded having placed nothing
   *    — but the current protocol rejects it outright.
   *  - An expired order does NOT auto-return its escrow, and this one IS silent.
   *    The funds stay locked in the pool until someone sweeps it —
   *    {@link Trader.cancelExpiredOrders} reclaims them, and is callable by
   *    anyone, not only the owner.
   */
  expireTimestampNs?: bigint;
  /** 0 limit (default) or 2 market (IOC). See {@link ORDER_TYPE}. */
  orderType?: number;
  /** Approve the escrow token if allowance is short (default true). */
  autoApprove?: boolean;
  /**
   *  Routing/builder frontend address to attribute the order to. Requires the
   *  trader to have opted this builder in via {@link Trader.approveBuilder} on
   *  this pool. Omit (or zero) for no routing fee.
   */
  builder?: Address;
  /**
   *  Per-order builder/routing fee in the pool's native bps×1000 unit (≤ the
   *  pool's `maxBuilderFee` ceiling AND ≤ the trader's approval). 0 = none.
   *  The ceiling is owner-updatable on a SpotPool, so read it rather than
   *  caching it indefinitely.
   */
  builderFeeBpsTimes1k?: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  One order inside a {@link Trader.placeSpotOrders} batch — the per-order fields
 *  of {@link PlaceSpotOrderParams}, minus everything the batch supplies once
 *  (`pool`, token/decimals context, gas).
 */
export interface SpotOrderRequest {
  /** True = buy the base asset (pay quote); false = sell base (pay base/native). */
  isBid: boolean;
  /**
   *  Limit price — raw quote units per whole base token. For a MARKET order pass a
   *  crossing price (best opposite level ± slippage); it bounds the escrow.
   */
  price: bigint;
  /** Base quantity, raw base units. */
  quantity: bigint;
  /** 0 limit (default) or 2 market (IOC). See {@link ORDER_TYPE}. */
  orderType?: number;
  /** Order expiry in ns. Defaults to ~50y (GTC). */
  expireTimestampNs?: bigint;
  /** Opaque 64-bit tag carried on the order — for market-maker bookkeeping. */
  userData?: bigint;
}

/**
 *  Inputs to {@link Trader.placeSpotOrders} — place several orders on ONE SpotPool
 *  in a single transaction.
 */
export interface PlaceSpotOrdersParams {
  /** SpotPool address every order in this batch targets. */
  pool: Address;
  /** The orders to place, in the order the results come back. */
  orders: SpotOrderRequest[];
  /** Base-token decimals (for the buy-side escrow math). */
  baseDecimals: number;
  /** Quote token (approved once for the batch's total buy-side escrow). */
  quoteToken: Address;
  /** Base token (approved once for the batch's total sell-side quantity). */
  baseToken: Address;
  /**
   *  True when the base asset is native SOMI. Batch writes are NON-payable, so a
   *  native-base sell here funds from the pool's vault balance — pre-deposit native
   *  to the vault first (the batch cannot send `msg.value`, and nothing is approved
   *  for a native base).
   */
  baseIsNative?: boolean;
  /** Approve the escrow tokens if allowance is short (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** One request's outcome in a {@link Trader.placeSpotOrders} batch. */
export interface BatchPlaceOutcome {
  /**
   *  True when this request produced an order. False for a benign non-placement —
   *  a PostOnly that would have crossed, an unfilled FillOrKill, an IOC that found
   *  no liquidity, an already-expired expiry, or a CancelTaker self-match.
   */
  success: boolean;
  /** The resting order's id, or `undefined` when `success` is false. */
  orderId?: bigint;
}

/** Result of {@link Trader.placeSpotOrders}. */
export interface PlaceSpotOrdersResult extends TxResult {
  /**
   *  Per-request outcomes, index-aligned with the `orders` input. Reconstructed
   *  from the receipt's `OrderPlaced` events (a transaction's return data is not
   *  readable by an EOA).
   */
  outcomes: BatchPlaceOutcome[];
  /** Fills that executed in this tx, across every request in the batch. */
  fills: OrderFill[];
}

/**
 *  Inputs to {@link Trader.cancelOrders} — pull several resting orders on ONE pool
 *  in a single transaction. Works on spot AND binary pools.
 */
export interface CancelOrdersParams {
  /** SpotPool (or BinaryPool) address hosting the resting orders. */
  pool: Address;
  /** uint128 OrderIds to cancel (decimal strings or bigints). */
  orderIds: (bigint | string)[];
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** One id's outcome in a {@link Trader.cancelOrders} batch. */
export interface BatchCancelOutcome {
  /** The order id this entry reports on. */
  orderId: bigint;
  /**
   *  True when this id was cancelled in this transaction. False means the contract
   *  SKIPPED it — already filled, already cancelled, expired-and-swept, or not
   *  owned by the signer. A skip is inferred from the absence of an event, so it
   *  does NOT distinguish a benign race from a caller-side mistake.
   */
  cancelled: boolean;
}

/** Result of {@link Trader.cancelOrders}. */
export interface CancelOrdersResult extends TxResult {
  /** Per-id outcomes, index-aligned with the `orderIds` input. */
  outcomes: BatchCancelOutcome[];
}

/** One reduction inside a {@link Trader.reduceOrders} batch. */
export interface ReduceOrderRequest {
  /** uint128 OrderId of the resting order to shrink (decimal string or bigint). */
  orderId: bigint | string;
  /**
   *  The order's NEW remaining quantity. Must be a `lotSize` multiple,
   *  `>= minQuantity`, and strictly less than the current remaining.
   */
  newQuantityRemaining: bigint;
}

/**
 *  Inputs to {@link Trader.reduceOrders} — shrink several resting orders on ONE
 *  pool in a single transaction. Works on spot AND binary pools.
 */
export interface ReduceOrdersParams {
  /** SpotPool (or BinaryPool) address hosting the resting orders. */
  pool: Address;
  /** The reductions to apply. Any invalid entry reverts the whole batch. */
  reductions: ReduceOrderRequest[];
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.placePerpOrder} — a perp limit or market order on a
 *  PerpPool. Margin is locked from the signer's MarginBank balance (no escrow
 *  transfer in this tx) — {@link Trader.depositMargin} first.
 */
export interface PlacePerpOrderParams {
  /** PerpPool address. */
  pool: Address;
  /** True = buy/long the synthetic base; false = sell/short. */
  isBid: boolean;
  /**
   *  Limit price — raw quote (collateral) units per whole base. For a MARKET
   *  order pass a crossing price; it bounds the margin lock.
   */
  price: bigint;
  /** Base quantity, raw base units. */
  quantity: bigint;
  /** Order expiry in ns. Defaults to ~50y (GTC). */
  expireTimestampNs?: bigint;
  /** 0 limit (default) or 2 market (IOC). See {@link ORDER_TYPE}. */
  orderType?: number;
  /**
   *  Routing/builder frontend address to attribute the order to. Requires the
   *  trader to have opted this builder in via {@link Trader.approveBuilder} on
   *  this pool. Omit (or zero) for no routing fee.
   */
  builder?: Address;
  /**
   *  Per-order builder/routing fee in the pool's native bps×1000 unit (≤ the
   *  pool's `maxBuilderFee` ceiling AND ≤ the trader's approval). 0 = none.
   *  The ceiling is owner-updatable on a PerpPool, so read it rather than
   *  caching it indefinitely.
   */
  builderFeeBpsTimes1k?: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  OrderBook SelfMatchingOption — what happens when your incoming taker order
 *  crosses your OWN resting order: 0 cancels the rest of the taker, 1 cancels the
 *  whole maker. Defaults to 0 everywhere in this SDK.
 */
export const SELF_MATCHING_OPTION = {
  /** 0 — cancel the remaining taker quantity, leave the maker resting. */
  CANCEL_TAKER: 0,
  /** 1 — cancel the full maker order, let the taker continue. */
  CANCEL_MAKER: 1,
} as const;

/**
 *  The replacement order in an amendment. Mirrors the pool's `PlaceOrderRequest`
 *  struct; the owner is the amend caller, not a per-request field.
 */
export interface BatchOrderRequest {
  /** True = buy/bid, false = sell/ask. */
  isBid: boolean;
  /** Limit price, raw quote units per whole base. */
  price: bigint;
  /** Base quantity, raw base units. */
  quantity: bigint;
  /** Order expiry in ns. Defaults to ~50y (GTC). */
  expireTimestampNs?: bigint;
  /** 0 limit (default), 1 FillOrKill, 2 market/IOC, 3 PostOnly. See {@link ORDER_TYPE}. */
  orderType?: number;
  /** Self-match behaviour, default 0. See {@link SELF_MATCHING_OPTION}. */
  selfMatchingOption?: number;
  /** Routing/builder address to attribute this order to; omit for none. */
  builder?: Address;
  /** Per-order builder fee in the pool's bps×1000 unit. 0 = none. */
  builderFeeBpsTimes1k?: bigint;
  /** Opaque market-maker bookkeeping tag, forwarded verbatim. Default 0. */
  userData?: bigint;
}

/**
 *  Inputs to {@link Trader.amendOrders} — cancel N orders and place their
 *  replacements atomically. The replacement loses queue priority; use
 *  `reduceOrder` to shrink one in place without re-queueing.
 *
 *  **Gotchas** — ALL-OR-NOTHING: the first replacement the book will not honour
 *  reverts everything with `AmendReplacementRejected(requestIndex, reason)`.
 */
export interface AmendOrdersParams {
  /** SpotPool or PerpPool address. NOT a BinaryPool. */
  pool: Address;
  /** The amendments to apply, in array order. Must be non-empty. */
  amendments: {
    /** The resting order being replaced (decimal string or bigint). */
    oldOrderId: bigint | string;
    /**
     *  How to handle an `oldOrderId` already filled/cancelled when the tx lands.
     *  False (default) reverts `AmendOldOrderGone`; true skips the cancel leg and
     *  places the replacement anyway (opt-in upsert). It never tolerates an
     *  ownership failure — someone else's live order still reverts.
     */
    alwaysPlace?: boolean;
    /** The replacement order. */
    newOrder: BatchOrderRequest;
  }[];
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** Result of a batch amend — the ids of the replacement orders. */
export interface AmendOrdersResult extends TxResult {
  /**
   *  New order ids, index-aligned with the submitted `amendments`. Reconstructed
   *  from `OrderPlaced` logs, since the pool's `uint128[]` return is not readable
   *  from a receipt.
   *
   *  `0n` means the id could not be reconstructed — the receipt carried fewer
   *  `OrderPlaced` events than there were amendments. It does **not** mean the
   *  replacement failed to rest: `OrderPlaced` fires for every accepted order,
   *  including one that fills completely and never reaches the book (`OrderRested`
   *  is the rest-only event). Amend is all-or-nothing, so in a successful tx every
   *  slot is populated.
   */
  newOrderIds: bigint[];
  /** Fills executed by the replacement orders. */
  fills: OrderFill[];
}

/**
 *  Inputs to {@link Trader.amendOrder} — cancel ONE resting order and place its
 *  replacement atomically, with no gap on the book.
 *
 *  **Gotchas** — the replacement loses queue priority (it re-enters at the back of
 *  the price-time queue for its price); use {@link Trader.reduceOrder} to shrink an
 *  order in place instead. The call is NON-PAYABLE: the cancel leg delivers the old
 *  order's freed native to the WALLET, which the non-payable place leg cannot reach,
 *  so a native auto-pull amend reverts — fund native replacements from a
 *  manual-vault balance.
 */
export interface AmendOrderParams {
  /** SpotPool or PerpPool address. NOT a BinaryPool — see {@link Trader.amendOrder}. */
  pool: Address;
  /** The resting order being replaced (decimal string or bigint). */
  oldOrderId: bigint | string;
  /**
   *  How to handle an `oldOrderId` already filled/cancelled when the tx lands.
   *  False (default) reverts `AmendOldOrderGone`; true skips the cancel leg and
   *  places the replacement anyway (opt-in upsert). It never tolerates an
   *  ownership failure — someone else's live order still reverts `IncorrectSender`.
   */
  alwaysPlace?: boolean;
  /** The replacement order. */
  newOrder: BatchOrderRequest;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** Result of a single amend — the id of the replacement order. */
export interface AmendOrderResult extends TxResult {
  /**
   *  The replacement's NEW order id — update local tracking, the old id is gone.
   *  Reconstructed from the `OrderPlaced` log, since the pool's `uint128` return is
   *  not readable from a receipt.
   *
   *  `0n` means the id could not be reconstructed (no `OrderPlaced` in the
   *  receipt). It does NOT mean the replacement failed: a single amend reverts
   *  outright when its replacement does not rest or fill, so a successful tx
   *  always carries one.
   */
  newOrderId: bigint;
  /** Fills executed by the replacement order. */
  fills: OrderFill[];
}

/**
 *  Inputs to {@link Trader.depositMargin} — fund the signer's cross-margin
 *  MarginBank balance (one balance backs every perp pool on that bank).
 */
export interface DepositMarginParams {
  /** MarginBank address (from the PerpMarket row), or pass `pool` to resolve it. */
  marginBank?: Address;
  /** A PerpPool — its `marginBank()` is read (and cached) when `marginBank` is omitted. */
  pool?: Address;
  /** Collateral amount to deposit, raw units (e.g. USDso 18dp). */
  amount: bigint;
  /** Collateral token; read from the bank's getSystemConfig (cached) if omitted. */
  collateral?: Address;
  /** Approve the collateral to the BANK if allowance is short (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.withdrawMargin} — pull free collateral back out of the
 *  MarginBank (the bank margin-checks the withdrawal on-chain).
 */
export interface WithdrawMarginParams {
  /** MarginBank address (from the PerpMarket row), or pass `pool` to resolve it. */
  marginBank?: Address;
  /** A PerpPool — its `marginBank()` is read (and cached) when `marginBank` is omitted. */
  pool?: Address;
  /** Collateral amount to withdraw, raw units. Must be ≤ withdrawable (margin-checked on-chain). */
  amount: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Claim a payout that fell back to a pool's internal ERC20Vault (a
 *  `PayoutFallbackToVault` credit) back to the caller's wallet.
 */
export interface WithdrawVaultParams {
  /**
   *  The ERC20Vault to withdraw from — the pool address (BinaryPool/SpotPool ARE
   *  ERC20Vaults).
   */
  vault: Address;
  /** Token to withdraw (ERC-20 address, or the vault's native sentinel). */
  token: Address;
  /**
   *  Amount to withdraw, raw units. Must be ≤ the vault's withdrawable balance
   *  (read it with `client.getVaultBalance`).
   */
  amount: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.depositVault} — pre-fund an ERC-20 balance in a pool's
 *  internal vault.
 */
export interface DepositVaultParams {
  /**
   *  The ERC20Vault to deposit into — the pool address (SpotPool/BinaryPool ARE
   *  ERC20Vaults).
   */
  vault: Address;
  /**
   *  ERC-20 to deposit. NOT the native sentinel — use {@link Trader.depositVaultNative}
   *  for native (the contract reverts `UseDepositNative`).
   */
  token: Address;
  /** Amount to deposit, raw units. Must be > 0. */
  amount: bigint;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.depositVaultNative} and {@link Trader.depositVaultNativeFor}
 *  — pre-fund a native balance in a pool's internal vault. The amount travels as
 *  `msg.value`.
 */
export interface DepositVaultNativeParams {
  /** The ERC20Vault to deposit into — the pool address. */
  vault: Address;
  /** Native amount to deposit, wei. Must be > 0. */
  amount: bigint;
  /**
   *  Account to credit. Omit to credit the signer; set it to fund ANOTHER account's
   *  vault balance (an operator pre-funding a bot wallet).
   */
  owner?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.setManualVaultMode} — flip a SpotPool's auto-pull
 *  opt-out for the signer.
 */
export interface SetManualVaultModeParams {
  /** SpotPool the mode applies to. Scoped per user PER POOL. */
  pool: Address;
  /** True to draw only on vault balance; false to restore wallet auto-pull. */
  enabled: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** What both operator-grant writes share. The signer is always the granting owner. */
interface OperatorApprovalParamsBase {
  /** Account being admitted to act for the signer (a bot, a router, a helper contract). */
  operator: Address;
  /**
   *  4-byte selectors the operator may call. Grant only what it needs —
   *  {@link PLACE_ORDER_FOR_SELECTOR} to place, {@link CANCEL_ORDER_FOR_SELECTOR} to
   *  cancel. Must not be empty.
   */
  selectors: readonly Hex[];
  /** True to grant, false to revoke. */
  approved: boolean;
  /**
   *  OperatorPermissionsRegistry address.
   *  @defaultValue `addresses.operatorPermissionsRegistry`
   */
  operatorRegistry?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.setOperatorApprovalGlobal} — admit an operator across
 *  every registered pool (what `SpotRouter` requires).
 */
export interface SetOperatorApprovalGlobalParams extends OperatorApprovalParamsBase {}

/**
 *  Inputs to {@link Trader.setOperatorApprovalForPool} — admit an operator on ONE
 *  SpotPool (the tighter default).
 */
export interface SetOperatorApprovalForPoolParams extends OperatorApprovalParamsBase {
  /** SpotPool the grant applies on. */
  pool: Address;
}

/**
 *  Inputs to {@link Trader.setPerpLeverage} — cap the signer's max leverage on one
 *  perp pool (the MarginBank sizes positions against margin with it).
 */
export interface SetPerpLeverageParams {
  /** PerpPool the leverage cap applies to. */
  pool: Address;
  /** Max leverage multiplier (e.g. 10 = 10x), bounded by the protocol limit. */
  leverageX: number;
  /** MarginBank address; read (and cached) from `pool.marginBank()` when omitted. */
  marginBank?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.placeSpotStopOrder} — a stop-loss / take-profit order
 *  the SpotStopOrderRegistry holds pending and places on the pool when the mark
 *  price crosses the trigger. Funded by SOMI `msg.value` for the trigger gas.
 */
export interface PlaceSpotStopOrderParams {
  /** SpotStopOrderRegistry address (the per-pool registry). */
  registry: Address;
  /**
   *  The SpotPool the registry trades on — needed for the operator-auth check, the
   *  ERC-20 escrow approval, and the native vault pre-load math.
   */
  pool: Address;
  /**
   *  Shared OperatorPermissionsRegistry where the one-time global approval is granted.
   *  Resolved from the live config (addresses.operatorPermissionsRegistry) if omitted.
   */
  operatorRegistry?: Address;
  /** True = buy stop (escrows quote at trigger); false = sell stop (escrows base/native). */
  isBid: boolean;
  /** Base quantity to trade at trigger, raw base units. */
  quantity: bigint;
  /** Mark price that arms the trigger (raw quote per whole base). */
  triggerPrice: bigint;
  /** 0 = GTE (trigger when mark ≥ triggerPrice), 1 = LTE (mark ≤ triggerPrice). */
  triggerOperator: 0 | 1;
  /** 0 = LIMIT (uses limitPrice), 1 = MARKET (slippage-bounded). */
  stopOrderType: 0 | 1;
  /** Limit price for a LIMIT stop order (raw quote per whole base). */
  limitPrice?: bigint;
  /** Quote token — the input escrow on a buy stop. */
  quoteToken: Address;
  /** Base token — the input escrow on a (non-native) sell stop. */
  baseToken: Address;
  /** True when the base asset is native SOMI (sell stops pre-load the pool vault). */
  baseIsNative?: boolean;
  /**
   *  SOMI to fund the reactivity subscription gas. Read from
   *  registry.somiPaymentPerOrder() if omitted.
   */
  somiPayment?: bigint;
  /**
   *  Skip the one-time operator-approval check/tx (default false). Set true if you
   *  know the registry is already operator-approved for this owner.
   */
  skipOperatorApproval?: boolean;
  /** Approve the ERC-20 escrow token to the pool if allowance is short (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.cancelStopOrder} and {@link Trader.cancelPerpStopOrder} —
 *  cancel a pending (untriggered) stop order on its registry.
 *
 *  Shared by both venues because the cancel takes nothing venue-specific: an id and the
 *  registry that issued it. Which registry that is follows from the method you call, so
 *  pass the SpotStopOrderRegistry to the spot cancel and the PerpStopOrderRegistry to
 *  the perp one — ids are per-registry and mean nothing on the other.
 */
export interface CancelStopOrderParams {
  /** The stop-order registry holding the pending order — spot or perp, per the method. */
  registry: Address;
  /** The pending order's id on the registry (decimal string or bigint). */
  orderId: bigint | string;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.claimPerpStopSomi} — recover the SOMI a perp stop
 *  registry owes the signer after a refund transfer failed.
 */
export interface ClaimPerpStopSomiParams {
  /** The perp stop-order registry holding the unclaimed balance. */
  registry: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Whether a triggered perp stop may only REDUCE the signer's position, or may open
 *  and increase one.
 *
 *  Omitting it means `"reduceOnly"` — a take-profit or stop-loss, which is what every
 *  perp stop was before intent existed. `"opening"` is a stop-entry or breakout: it
 *  acquires exposure rather than shedding it, so the registry gates it on initial
 *  margin at creation instead of on holding a reducible position.
 */
export type PerpStopIntent = "reduceOnly" | "opening";

/**
 *  One leg of a perp stop order — the terms shared by a single stop and by each half
 *  of a linked pair.
 */
export interface PerpStopOrderLeg {
  /** True = the triggered order buys, false = sells. */
  isBid: boolean;
  /**
   *  Base quantity to trade at trigger, raw base units.
   *
   *  ZERO is a sentinel meaning "the whole position at trigger time" — the size is
   *  resolved against the live position when it fires, so the stop keeps covering a
   *  position that GREW after it was armed. A non-zero quantity is fixed at creation
   *  and only ever clamped DOWN. Rejected for `"opening"` intent, where it has no
   *  meaning.
   */
  quantity: bigint;
  /** Mark price that arms the trigger (raw collateral units per whole base). */
  triggerPrice: bigint;
  /** 0 = GTE (fires when mark ≥ triggerPrice), 1 = LTE (mark ≤ triggerPrice). */
  triggerOperator: 0 | 1;
  /** 0 = LIMIT (uses limitPrice), 1 = MARKET (slippage-bounded by the registry). */
  stopOrderType: 0 | 1;
  /** Limit price for a LIMIT stop (raw collateral per whole base). Must be 0 for MARKET. */
  limitPrice?: bigint;
  /** Builder to tag on the triggered order. Omit for none. */
  builder?: Address;
  /** Builder fee in bps x 1000 (so 1500 = 1.5bps). Requires `builder`. */
  builderFeeBpsTimes1k?: bigint;
}

/**
 *  Inputs to {@link Trader.placePerpStopOrder} — a take-profit / stop-loss (or, with
 *  `intent: "opening"`, a stop-entry) that the PerpStopOrderRegistry holds pending and
 *  places on the PerpPool when the MARK price crosses the trigger.
 *
 *  Pass `pair` to arm two legs as a linked one-cancels-other set in a single
 *  transaction, at 2x the SOMI payment. There is no separate "place linked" method on
 *  purpose: a pair is the same order with a second leg, and splitting it would give
 *  callers two ways to say one thing.
 */
export interface PlacePerpStopOrderParams extends PerpStopOrderLeg {
  /** PerpStopOrderRegistry address (one per PerpPool). */
  registry: Address;
  /** The PerpPool the registry places on — needed for the operator-auth check. */
  pool: Address;
  /**
   *  Shared OperatorPermissionsRegistry where the one-time global approval is granted.
   *  Resolved from the live config (addresses.operatorPermissionsRegistry) if omitted.
   */
  operatorRegistry?: Address;
  /**
   *  Reduce-only (default) or opening. Omit and existing callers keep the behaviour
   *  they always had.
   */
  intent?: PerpStopIntent;
  /**
   *  A second leg, armed atomically and LINKED to the first: when one fires and
   *  fills, the other is cancelled and its SOMI refunded.
   *
   *  The pair must be a coherent TP/SL set — same side, OPPOSITE trigger operators,
   *  and straddling (the GTE leg's trigger above the LTE leg's) — or the registry
   *  rejects it. Both legs are reduce-only; an opening leg cannot be paired, because a
   *  bracket whose children activate on the parent's FILL is not expressible (the pool
   *  does not notify the registry on fill).
   */
  pair?: PerpStopOrderLeg;
  /**
   *  SOMI to fund the reactivity trigger gas, PER LEG. Read from
   *  registry.somiPaymentPerOrder() if omitted; a pair sends twice this.
   */
  somiPayment?: bigint;
  /**
   *  Skip the one-time operator-approval check/tx (default false). Set true if you
   *  know the registry is already operator-approved for this owner.
   */
  skipOperatorApproval?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.linkPerpStopOrders} — pair two stops that already exist.
 *
 *  The after-the-fact form of {@link PlacePerpStopOrderParams.pair}, and the way to
 *  re-pair a survivor: when one leg of a pair fires WITHOUT filling, the other stays
 *  armed and is unlinked, free to be paired with a fresh leg.
 */
export interface LinkPerpStopOrdersParams {
  /** The PerpStopOrderRegistry holding both orders. */
  registry: Address;
  /** First order id (either operator; the pair is ordered by the registry). */
  orderIdA: bigint | string;
  /** Second order id. */
  orderIdB: bigint | string;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.cancelPerpStopOrders} — cancel several of the signer's
 *  pending stops in one transaction, refunded in a single transfer.
 *
 *  The way to tear down a linked pair: cancelling ONE leg only unlinks the other,
 *  which stays armed. Every id must be live and owned by the signer — one bad id
 *  reverts the whole batch.
 */
export interface CancelPerpStopOrdersParams {
  /** The PerpStopOrderRegistry holding the pending orders. */
  registry: Address;
  /** The pending order ids (decimal strings or bigints). Must be non-empty. */
  orderIds: (bigint | string)[];
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** Inputs to {@link Trader.mintSet} — deposit collateral, receive equal YES + NO. */
export interface MintSetParams {
  /** BinaryPool address — pool pulls collateral and mints YES+NO. */
  pool: Address;
  /** Collateral amount → mints `amount` YES + `amount` NO to the signer. */
  amount: bigint;
  /** Collateral token; resolved from the live store (by pool) if omitted. */
  collateral?: Address;
  /** Approve collateral → pool if allowance is short (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** Inputs to {@link Trader.burnSet} — surrender equal YES + NO, get collateral back. */
export interface BurnSetParams {
  /** BinaryPool address — pool burns the caller's YES + NO and refunds collateral. */
  pool: Address;
  /** Outcome amount to burn (same for YES + NO). */
  amount: bigint;
  /**
   *  Outcome-token singleton; resolved from the pool if omitted. Both YES + NO
   *  are covered by a single operator approval on it.
   */
  outcomeToken?: Address;
  /** Ensure the pool is an operator on the outcome-token singleton (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.redeem} — burn winning outcome tokens for collateral on
 *  a resolved/voided market (module-routed redemption).
 */
export interface RedeemParams {
  /**
   *  bytes32 marketId the module keys the redemption on (settlement-extraction v2:
   *  redemption is module-routed — the module pulls the caller's winning tokens,
   *  finalizes-if-needed, and redeems through the BinarySettlement singleton).
   */
  marketId: Hex;
  /** Outcome-token amount to burn for collateral. */
  amount: bigint;
  /**
   *  Winning outcome (0 = YES, 1 = NO). Looked up via `market.winningOutcome()`
   *  when omitted (needs `market` set, else pass `outcomeIdx` explicitly).
   */
  outcomeIdx?: 0 | 1;
  /**
   *  BinaryMarket address — only needed to auto-look-up `outcomeIdx` /
   *  `outcomeToken` when those are omitted.
   */
  market?: Address;
  /** Routing operator id (uint32) for attribution; 0 = none (default). */
  operatorId?: number;
  /** Routing venue id (bytes32 hex); 32-byte zero = none (default). */
  venueId?: Hex;
  /**
   *  Outcome-token singleton the winning position lives on (for the operator
   *  grant). Looked up via `market.outcomeToken()` when omitted.
   */
  outcomeToken?: Address;
  /**
   *  BinaryMarketsModule address; resolved from `config.addresses.binaryModule`
   *  when omitted. Throws if neither is set.
   */
  module?: Address;
  /** Ensure the module is an operator on the outcome-token singleton (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Claim winnings from several settled markets in ONE transaction — the batch
 *  form of {@link RedeemParams}. Each entry is redeemed independently for the
 *  signer (settlement pays each straight to their wallet); all-or-nothing.
 */
export interface RedeemManyParams {
  /** Per-market redemptions. `outcomeIdx` is required per entry (0 = YES, 1 = NO). */
  entries: {
    /** bytes32 marketId of the market to redeem on. */
    marketId: Hex;
    /** Which outcome's tokens to redeem (0 = YES, 1 = NO). */
    outcomeIdx: 0 | 1;
    /** Outcome tokens to redeem, raw units (collateral decimals). */
    amount: bigint;
  }[];
  /** Routing operator id (uint32) for attribution; 0 = none (default). */
  operatorId?: number;
  /** Routing venue id (bytes32 hex); 32-byte zero = none (default). */
  venueId?: Hex;
  /**
   *  Outcome-token singleton to grant the module operator on (one grant covers all
   *  ids). Resolved from the settlement singleton when omitted.
   */
  outcomeToken?: Address;
  /** BinaryMarketsModule address; resolved from `config.addresses.binaryModule`. */
  module?: Address;
  /** Ensure the module is an operator on the outcome-token singleton (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  A signed authorization the position OWNER produces so a relayer can call
 *  {@link Trader.redeemFor} on their behalf. The on-chain payout is hard-pinned
 *  to `owner` (never the relayer), so this is a pure gas sponsorship — the signer
 *  keeps every cent of the proceeds. Produced by {@link Trader.signRedeemAuth},
 *  consumed by {@link Trader.redeemFor}.
 */
export interface RedeemAuthorization {
  /** The position owner (the signer). The payout is paid here on-chain. */
  owner: Address;
  /** Routing operator id (uint32) for attribution; part of the signed struct. */
  operatorId: number;
  /** Routing venue id (bytes32 hex); part of the signed struct. */
  venueId: Hex;
  /** bytes32 marketId the redemption targets. */
  marketId: Hex;
  /** Outcome the owner holds (0 = YES, 1 = NO). */
  outcomeIdx: 0 | 1;
  /** Outcome-token amount to burn for collateral. */
  amount: bigint;
  /** Per-owner replay nonce (module tracks `(owner, nonce)`); any unused value. */
  nonce: bigint;
  /** Signature deadline (unix seconds). The module rejects a stale authorization. */
  deadline: bigint;
  /** The EIP-712 signature over the authorization (65-byte r‖s‖v hex). */
  signature: Hex;
}

/**
 *  Inputs to {@link Trader.signRedeemAuth} — everything in the signed struct
 *  EXCEPT the signature (which the call produces). Signed by the connected signer
 *  (the position owner); the resulting {@link RedeemAuthorization} is handed to a
 *  relayer to submit via {@link Trader.redeemFor}.
 */
export interface SignRedeemAuthParams {
  /** bytes32 marketId the redemption targets. */
  marketId: Hex;
  /** Outcome the owner holds (0 = YES, 1 = NO). */
  outcomeIdx: 0 | 1;
  /** Outcome-token amount to burn for collateral. */
  amount: bigint;
  /** Per-owner replay nonce; any value not yet consumed for this owner. */
  nonce: bigint;
  /** Signature deadline (unix seconds). */
  deadline: bigint;
  /** Routing operator id (uint32) for attribution; 0 = none (default). */
  operatorId?: number;
  /** Routing venue id (bytes32 hex); 32-byte zero = none (default). */
  venueId?: Hex;
  /**
   *  Owner the payout is pinned to; defaults to the connected signer's address.
   *  Must be the address whose signer produces the signature.
   */
  owner?: Address;
  /**
   *  BinaryMarketsModule address — the EIP-712 `verifyingContract`; resolved from
   *  `config.addresses.binaryModule` when omitted.
   */
  module?: Address;
}

/**
 *  Relayer path: submit a position owner's pre-signed {@link RedeemAuthorization}
 *  so THEY pay the gas while the OWNER receives the payout. The caller (relayer)
 *  need not be the owner; the module recovers the signature to `owner` and pays
 *  `owner` directly.
 */
export interface RedeemForParams {
  /** The owner's signed authorization (from {@link Trader.signRedeemAuth}). */
  authorization: RedeemAuthorization;
  /**
   *  BinaryMarketsModule address; resolved from `config.addresses.binaryModule`
   *  when omitted. Must match the `verifyingContract` the authorization was
   *  signed against.
   */
  module?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Low-level direct redemption against the BinarySettlement singleton — bypasses
 *  the module (no operator attribution). Burns the caller's outcome tokens and
 *  pays `to`. Prefer the module-routed {@link RedeemParams} for normal trading;
 *  use this for keeper/tooling paths that hold the raw outcome id.
 */
export interface RedeemDirectParams {
  /** The ERC-6909 outcome id to redeem (encodes pool + nonce + index). */
  outcomeId: bigint;
  /** Outcome-token quantity to burn. */
  amount: bigint;
  /** Recipient of the released collateral (default: the trader's own address). */
  to?: Address;
  /**
   *  BinarySettlement address; resolved from `config.addresses.binarySettlement`
   *  when omitted. Throws if neither is set.
   */
  settlement?: Address;
  /**
   *  Outcome-token singleton (for the operator grant). Resolved from the
   *  settlement's `outcomeToken()` when omitted.
   */
  outcomeToken?: Address;
  /** Ensure the settlement is an operator on the outcome-token singleton (default true). */
  autoApprove?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Claim an accrued push-fallback balance on the settlement singleton (a payout
 *  that could not be pushed to a reverting recipient was booked to `owed`).
 */
export interface ClaimOwedParams {
  /** The token to claim (the market's collateral token). */
  token: Address;
  /** BinarySettlement address; resolved from `config.addresses.binarySettlement` when omitted. */
  settlement?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Permissionless keeper entry: finalize a settled market (sweep its pool's
 *  backing + resolution snapshot to the settlement singleton). No-op-guarded.
 */
export interface FinalizeMarketParams {
  /** bytes32 marketId to finalize; the market must be resolved or voided. */
  marketId: Hex;
  /** BinaryMarketsModule address; resolved from `config.addresses.binaryModule` when omitted. */
  module?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Permissionless earmark reconcile: release the oracle earmark of a market that
 *  was voided via the `BinaryMarket.voidExpired()` escape hatch (which bypasses the
 *  module, so the hub's earmark release never fired).
 */
export interface SyncSettlementParams {
  /** bytes32 marketId to reconcile; the market must be resolved or voided. */
  marketId: Hex;
  /** BinaryMarketsModule address; resolved from `config.addresses.binaryModule` when omitted. */
  module?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Permissionless keeper entry: release a finalized, drained pool back to its
 *  creator's free list for recycle onto the next market.
 */
export interface ReleasePoolParams {
  /** bytes32 marketId whose (finalized, book-empty) pool to release. */
  marketId: Hex;
  /** BinaryMarketsModule address; resolved from `config.addresses.binaryModule` when omitted. */
  module?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Permissionless oracle retry: ask the module to re-pull the answer for one
 *  oracle question.
 */
export interface PokeOracleParams {
  /**
   *  The ORACLE QUESTION id to retry — not a market id. The module fans out to
   *  every market bound to this question; read it from a market row's
   *  `oracleQuestion` or the module's market record.
   */
  oracleQuestionId: bigint;
  /** BinaryMarketsModule address; resolved from `config.addresses.binaryModule` when omitted. */
  module?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Permissionless dead-oracle escape hatch: void a market whose settlement
 *  window has lapsed without a resolution.
 */
export interface VoidExpiredParams {
  /** bytes32 marketId to void; its market contract is resolved from the module. */
  marketId: Hex;
  /** BinaryMarketsModule address; resolved from `config.addresses.binaryModule` when omitted. */
  module?: Address;
  /**
   *  Skip the pre-send status/window check. The on-chain guards still apply —
   *  this only gives up the clearer client-side error (and its three reads).
   *  @defaultValue false
   */
  skipPreflight?: boolean;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  A market's settlement record on the BinarySettlement singleton (the permanent
 *  redemption home). Mirrors the on-chain `MarketSettlement` struct.
 */
export interface SettlementRecord {
  /** The ERC-20 collateral the net backing is held in. */
  collateralToken: Address;
  /**
   *  The NET collateral held for this market (post fee-skim on resolution),
   *  decremented by each redemption's payout.
   */
  backing: bigint;
  /** True once the pool's backing + snapshot have been swept in. Gates redemption. */
  finalized: boolean;
  /** True if the market voided (both sides redeem at half; never a settlement fee). */
  voided: boolean;
  /**
   *  The winning outcome index (0 = YES, 1 = NO); derived as argmax of
   *  `payoutNumerators`. Meaningful only when `!voided`.
   */
  winningOutcome: number;
  /**
   *  Settlement v3 fee-scaled payout VECTOR (denominator 10_000_000). Redemption of
   *  outcome `i` pays `amount × payoutNumerators[i] / 10_000_000`.
   */
  payoutNumerators: bigint[];
  /** The one-time settlement-fee rate skimmed at finalize (bps×1000; retained for audit). */
  settlementFeeBpsTimes1k: bigint;
  /** The address the settlement fee was skimmed to at finalize. */
  feeRecipient: Address;
  /** The pool that finalized this market (the address encoded in the outcome ids). */
  pool: Address;
  /** The pool's market nonce for this record. */
  nonce: bigint;
}

/**
 *  A canonical Permit2 `PermitTransferFrom` — the signed authorization the
 *  Permit2 mint path forwards to the router (which relays it to Permit2). Build
 *  it (and the EIP-712 signature) with a Permit2 SDK on the app side.
 */
export interface Permit2TransferFrom {
  /** Token + amount the signature authorizes. `token` must equal the market collateral. */
  permitted: {
    /** The ERC-20 the signature authorizes — must equal the market's collateral token. */
    token: Address;
    /** Max amount the signature authorizes, raw collateral units. */
    amount: bigint;
  };
  /** Unordered Permit2 nonce. */
  nonce: bigint;
  /** Signature deadline (unix seconds). */
  deadline: bigint;
}

/** Shared inputs for the CollateralRouter complete-set entry points. */
export interface RouterMintBase {
  /** bytes32 market key the set is minted for (the market's `marketId`). */
  marketId: Hex;
  /** Routing operator id (uint32) for attribution; 0 = none. */
  operatorId: number;
  /** Routing venue id (bytes32 hex); 32-byte zero = none. */
  venueId: Hex;
  /**
   *  CollateralRouter address; resolved from `config.addresses.collateralRouter`
   *  if omitted. Throws if neither is set (never sends to the zero address).
   */
  router?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Params for {@link Trader.mintSetNative} — mint a YES+NO set by paying in the
 *  chain's native coin.
 *
 *  **When to use**
 *
 *  Use when the market's collateral IS wrapped native: the router wraps
 *  `msg.value` for you, so the caller needs no prior approval and no wrap step.
 *  For ERC-20 collateral use {@link MintSetPermit2Params} instead.
 *
 *  @throws {@link ContractRevertError} `CollateralNotWNative` when the market's
 *  collateral is not wrapped native, or `ZeroAmount` when `amount` is 0.
 */
export interface MintSetNativeParams extends RouterMintBase {
  /**
   *  Native (SOMI/STT) amount to wrap → wNative and mint as `amount` YES + NO.
   *  Sent as `msg.value`; the target market's collateral must be wNative.
   */
  amount: bigint;
}

/**
 *  Params for {@link Trader.mintSetPermit2} — mint a YES+NO set from ERC-20
 *  collateral pulled with a signed Permit2 permit.
 *
 *  **When to use**
 *
 *  Use as the sibling of {@link MintSetNativeParams}, for markets whose
 *  collateral is a real ERC-20: one signature replaces the separate `approve`
 *  transaction.
 *
 *  @throws {@link ContractRevertError} `PermitTokenMismatch` when
 *  `permit.permitted.token` is not the market's collateral, or `ZeroAmount`
 *  when `amount` is 0.
 */
export interface MintSetPermit2Params extends RouterMintBase {
  /**
   *  Collateral amount to pull via Permit2 and mint as `amount` YES + NO. Must
   *  match `permit.permitted.amount` semantics on the app side.
   */
  amount: bigint;
  /** Signed Permit2 permit whose `permitted.token` must equal the market collateral. */
  permit: Permit2TransferFrom;
  /** EIP-712 signature over `permit` by the signer. */
  signature: Hex;
}

/**
 *  Inputs to {@link Trader.redeemNative} — redeem winning outcome tokens for a
 *  NATIVE payout via the CollateralRouter (unwraps wNative → native).
 */
export interface RedeemNativeParams {
  /** bytes32 market key redeemed against; its collateral must be wNative. */
  marketId: Hex;
  /**
   *  Outcome the caller holds (0 = YES, 1 = NO). The router is type-blind — it
   *  forwards this to the core, which the pool prices (winner 1:1, void 1/N per
   *  side).
   */
  outcomeIdx: 0 | 1;
  /** Amount of that outcome's tokens to redeem for a native payout. */
  amount: bigint;
  /** Routing operator id (uint32) for attribution; 0 = none. */
  operatorId: number;
  /** Routing venue id (bytes32 hex); 32-byte zero = none. */
  venueId: Hex;
  /**
   *  CollateralRouter address; resolved from `config.addresses.collateralRouter`
   *  if omitted. Throws if neither is set.
   */
  router?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/** Inputs to {@link Trader.faucet} — mint TestUSDC to the signer (testnet only). */
export interface FaucetParams {
  /** Amount to mint (default 10,000 × 10^decimals). */
  amount?: bigint;
  /** TestUSDC address; defaults to the configured one. */
  testUsdc?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.resolve} — resolve a market via the FakeOracle (demo/dev
 *  resolver only).
 */
export interface ResolveParams {
  /** BinaryMarket address to resolve. */
  market: Address;
  /** The outcome to resolve to (0 = YES wins, 1 = NO wins). */
  outcomeIdx: 0 | 1;
  /** FakeOracle address; defaults to the configured one. */
  fakeOracle?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  Inputs to {@link Trader.voidMarket} — void a market via the FakeOracle (demo/dev
 *  resolver only); both sides then redeem at half.
 */
export interface VoidMarketParams {
  /** BinaryMarket address to void. */
  market: Address;
  /** FakeOracle address; defaults to the configured one. */
  fakeOracle?: Address;
  /** Gas ceiling for this tx. @defaultValue {@link TraderConfig.gas} (10,000,000) */
  gas?: bigint;
}

/**
 *  The SDK's write tier — every pool/market transaction it can sign and send,
 *  bound to one signer. Built via `client.createTrader(config)` (see
 *  {@link TraderConfig}); shares that client's chain, addresses, and WebSocket.
 *
 *  Every write AWAITS its receipt before resolving — there is no bare-hash return
 *  to babysit. Order placements additionally resolve to the decoded order id + fills.
 */
export interface Trader {
  /**
   * Place a limit order (auto-approving the escrow token by default). Resolves once
   * mined, with the resting order id and any fills.
   *
   * @example
   * Bid 0.62 for 10 YES, bigint-exact (6-decimal collateral).
   * ```ts
   * const trader = client.createTrader({ privateKey });
   * const res = await trader.placeOrder({
   *   pool,
   *   side: "BUY_YES",
   *   price: 620_000n,       // 0.62 × 10^6
   *   quantity: 10_000_000n, // 10 outcome tokens × 10^6
   * });
   * console.log(res.orderId, res.fills.length); // resting id (if it rested) + immediate fills
   * ```
   *
   * @throws {@link InvalidInputError} - `price` or `quantity` was not > 0.
   * @throws {@link ContractRevertError} - the pool rejected the order; `errorName`
   * carries the protocol's own error (e.g. `InsufficientBalance`). Also thrown when
   * the transaction mines with a reverted status — the SDK replays the call to
   * recover the reason, so you get a name rather than a failed receipt.
   * @throws {@link RpcError} - the send never got an answer from the node.
   */
  placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>;
  /**
   * Cancel a resting order on its pool (works for spot + binary).
   *
   * @throws {@link ContractRevertError} - the cancel did not land (already filled,
   * already canceled, not the owner — `errorName` distinguishes them).
   * @throws {@link RpcError} - the send never got an answer from the node.
   */
  cancelOrder(params: CancelOrderParams): Promise<TxResult>;
  /**
   *  Shrink a resting order's remaining quantity in place, keeping its price-time
   *  queue priority (works for spot + binary). Reverts on-chain for an expired
   *  order — use {@link Trader.cancelOrder} there.
   */
  reduceOrder(params: ReduceOrderParams): Promise<TxResult>;
  /**
   *  Permissionless keeper drain: clean an explicit list of expired resting orders
   *  on a pool, returning each order's escrow to its owner (best-effort; skips
   *  non-expired / stale ids).
   */
  cancelExpiredOrders(params: CancelExpiredOrdersParams): Promise<TxResult>;
  /**
   *  Permissionless keeper drain: clean up to `maxCount` expired orders at one
   *  price level on a side.
   */
  sweepExpiredAtLevel(params: SweepExpiredAtLevelParams): Promise<TxResult>;
  /**
   *  Opt a routing/builder frontend in on a pool so orders the trader places
   *  with that builder code may charge up to `maxFeeBpsTimes1k` (0 revokes). Required
   *  before a non-zero `builder`/`builderFeeBpsTimes1k` on {@link Trader.placeOrder},
   *  {@link Trader.placeSpotOrder} or {@link Trader.placePerpOrder}.
   *
   *  Binary, spot and perp pools each implement this interface, but the approval
   *  is stored PER POOL: approving a builder on one pool grants nothing on
   *  another. Call it once per pool the trader will place attributed orders on,
   *  or the placement reverts. Each pool declares the whole builder-error set;
   *  which one fires depends on the check that trips first. With NO approval at
   *  all that is `BuilderNotApproved` on a SpotPool (it guards `approved > 0`),
   *  `BuilderFeeExceedsApproval` on a PerpPool, and `BuilderFeeExceedsCap` on a
   *  BinaryPool — whose ceiling, unlike the other two, is frozen at init.
   */
  approveBuilder(params: ApproveBuilderParams): Promise<TxResult>;
  /** Read a trader's per-builder approval cap on a pool (pool bps×1000; 0 = none). */
  getBuilderApproval(ref: Fees.BuilderApprovalRef): Promise<bigint>;
  /**
   *  Effective builder approval on a pool: the trader's raw cap clamped by the
   *  pool's protocol-wide `getMaxBuilderFeeBpsTimes1k` ceiling — the actual enforced
   *  limit a `builderFeeBpsTimes1k` on any place-order verb must not exceed.
   */
  getEffectiveBuilderApproval(ref: Fees.BuilderApprovalRef): Promise<bigint>;
  /** Read a pool's protocol-wide builder-fee ceiling (bps×1000). */
  getMaxBuilderFeeBpsTimes1k(pool: Address): Promise<bigint>;
  /**
   *  Place a spot limit/market order on a SpotPool (auto-approves the escrow token,
   *  or sends native msg.value on a native-base sell).
   */
  placeSpotOrder(params: PlaceSpotOrderParams): Promise<PlaceOrderResult>;
  /**
   *  Place several orders on one SpotPool in a single transaction — a market
   *  maker's ladder in one tx instead of a loop of sends.
   *
   *  **Gotchas**
   *
   *  This write is NON-PAYABLE: unlike {@link Trader.placeSpotOrder}, it takes no
   *  `msg.value`. A native-base sell in a batch therefore funds from the pool's
   *  VAULT balance — pre-deposit native to the vault and auto-pull consumes it.
   *  ERC-20 auto-pull works normally per request, and the batch approves each
   *  escrow token once for the whole batch's total.
   *
   *  SPOT ONLY. A binary pool reverts `UseBinaryPlacement` on generic placement —
   *  the YES/NO kind must be explicit, so use {@link Trader.placeOrder} there.
   *
   *  A request that does not place is NOT an error: `outcomes[i].success` is false
   *  with no id for a PostOnly that would cross, an unfilled FillOrKill, an IOC that
   *  found no liquidity, an already-expired expiry, or a CancelTaker self-match. A
   *  hard validation error (bad lot size, insufficient funds) reverts the whole batch.
   *
   *  Outcome attribution matches each `OrderPlaced` event to its request on every
   *  field the event echoes (side, price, quantity, userData, expiry), in order.
   *  Two byte-identical adjacent requests with different outcomes are therefore
   *  indistinguishable from logs — the earlier index gets the credit. Tag rungs
   *  with distinct `userData` when exact attribution matters.
   *
   *  **Example**
   *
   *  ```ts
   *  // Place a three-rung sell ladder in one transaction.
   *  const trader = client.createTrader({ privateKey });
   *  const res = await trader.placeSpotOrders({
   *    pool,
   *    baseDecimals: 6,
   *    quoteToken,
   *    baseToken,
   *    orders: [1_010_000n, 1_020_000n, 1_030_000n].map((price) => ({
   *      isBid: false,
   *      price,
   *      quantity: 1_000_000n,
   *    })),
   *  });
   *  // Index-aligned with `orders`; a rung that did not place is success:false.
   *  const ids = res.outcomes.flatMap((o) => (o.success ? [o.orderId!] : []));
   *  ```
   *
   *  @throws {@link InvalidInputError} - `orders` was empty, or a request had a
   *  non-positive price or quantity.
   *  @throws {@link ContractRevertError} - the batch was rejected; `errorName` carries
   *  the protocol's error (`EmptyBatch`, `UseBinaryPlacement` on a binary pool, or a
   *  per-order validation failure).
   */
  placeSpotOrders(params: PlaceSpotOrdersParams): Promise<PlaceSpotOrdersResult>;
  /**
   *  Cancel several resting orders on one pool in a single transaction — pull a
   *  whole ladder without leaving the remaining rungs exposed. Works on spot AND
   *  binary pools (cancel is inherited from the OrderBook base, not placement-gated).
   *
   *  **Gotchas**
   *
   *  BEST-EFFORT by design: an id that can no longer be cancelled (already filled,
   *  already cancelled, expired-and-swept, not owned by the signer) is SKIPPED
   *  on-chain instead of reverting the batch — which is the point in a fast market.
   *  Each `outcomes[i].cancelled` is inferred from whether the id emitted a cancel
   *  event, so a `false` does NOT tell you WHY: a benign fill race and a wrong id
   *  look identical here. Reconcile against the book if you need to know.
   *
   *  **Example**
   *
   *  ```ts
   *  const trader = client.createTrader({ privateKey });
   *  const res = await trader.cancelOrders({ pool, orderIds: ladderIds });
   *  const skipped = res.outcomes.filter((o) => !o.cancelled).map((o) => o.orderId);
   *  ```
   *
   *  @throws {@link InvalidInputError} - `orderIds` was empty.
   *  @throws {@link ContractRevertError} - `errorName` `EmptyBatch` when the contract
   *  rejects the payload.
   */
  cancelOrders(params: CancelOrdersParams): Promise<CancelOrdersResult>;
  /**
   *  Shrink several resting orders in place in a single transaction, each keeping its
   *  price-time queue priority. Works on spot AND binary pools.
   *
   *  **Gotchas**
   *
   *  ATOMIC, unlike {@link Trader.cancelOrders}: the FIRST invalid reduction reverts
   *  the entire batch and no order changes. A reduction is invalid if the new
   *  quantity is not a `lotSize` multiple, is below `minQuantity`, is not strictly
   *  less than the current remaining, or the order has expired (cancel those
   *  instead). Size the batch accordingly — one stale id loses the whole tx.
   *
   *  @throws {@link InvalidInputError} - `reductions` was empty.
   *  @throws {@link ContractRevertError} - a reduction was rejected; `errorName`
   *  carries the protocol's error.
   */
  reduceOrders(params: ReduceOrdersParams): Promise<TxResult>;
  /**
   *  Place a perp limit/market order on a PerpPool. Margin is locked from the
   *  signer's MarginBank balance — {@link Trader.depositMargin} first.
   */
  placePerpOrder(params: PlacePerpOrderParams): Promise<PlaceOrderResult>;
  /**
   *  Cancel ONE resting order and place its replacement atomically — the re-quote
   *  primitive, with no gap on the book.
   *
   *  **When to use**
   *
   *  Re-pricing a single quote. For a whole ladder use {@link Trader.amendOrders},
   *  which cancels every old order before placing any replacement. To shrink an
   *  order without losing its place in the queue use {@link Trader.reduceOrder} —
   *  amend is not priority-preserving.
   *
   *  **Details**
   *
   *  Prefer this over {@link Trader.amendOrders} with a one-element array: this
   *  raises the replacement's own landing-time reason (`PostOnlyWouldCross`,
   *  `SelfMatchCancelTaker`, `ImmediateOrCancelNoFill`, `FillOrKillNotFillable`,
   *  `OrderAlreadyExpired`), where the batch wraps it as
   *  `AmendReplacementRejected(requestIndex, reason)` and leaves the caller
   *  unwrapping an index it already knew.
   *
   *  **Gotchas**
   *
   *  SpotPool and PerpPool only — a BinaryPool reverts `UseBinaryPlacement`, since
   *  binary placement is its own entry point. The replacement gets a NEW order id,
   *  so update local tracking. Non-payable: a native auto-pull amend reverts,
   *  because the cancel leg delivers the freed native to the wallet and the place
   *  leg cannot reach it — fund native replacements from a manual-vault balance.
   *
   *  @example
   *  Re-quote one bid a tick lower, and keep the new id.
   *  ```ts
   *  const { newOrderId } = await trader.amendOrder({
   *    pool,
   *    oldOrderId: resting,
   *    newOrder: { isBid: true, price: 1_990_000n, quantity: 5_000_000n },
   *  });
   *  ```
   *
   *  @throws {@link InvalidInputError} - `price` or `quantity` was not > 0.
   *  @throws {@link ContractRevertError} - the old order was gone and `alwaysPlace`
   *  was not set (`AmendOldOrderGone`), it belongs to someone else
   *  (`IncorrectSender`), or the replacement did not rest or fill; `errorName`
   *  carries the protocol's error.
   */
  amendOrder(params: AmendOrderParams): Promise<AmendOrderResult>;
  /**
   *  Cancel N orders and place their replacements atomically. All-or-nothing, and it
   *  places — so the same BinaryPool restriction applies.
   */
  amendOrders(params: AmendOrdersParams): Promise<AmendOrdersResult>;
  /**
   *  Build a binary placement WITHOUT sending it — the same inputs as
   *  {@link Trader.placeOrder}, handed back as unsigned calls.
   *
   *  **When to use**
   *
   *  Reach for this when the signing and the sending are not the same moment: to
   *  pre-sign an ERC-4337 UserOp while the user is still filling in the form, to
   *  batch the order into a multicall, to hand it to a relayer, or to simulate it.
   *  For ordinary "place this order now", use {@link Trader.placeOrder} — it is
   *  one call and it handles the approval for you.
   *
   *  **Gotchas**
   *
   *  The approval is RETURNED, not sent. `placeOrder` approves as a side effect;
   *  this cannot, because sending is exactly what it must not do. Send `approval`
   *  first when it is present, or the order reverts on-chain.
   *
   *  Still `async`: a binary placement reads the pool's market expiry when the
   *  caller does not pass `expireTimestampNs`, and resolves the pool's escrow
   *  tokens to work out which approval is needed. Pass `expireTimestampNs`,
   *  `outcomeToken`, `yesId`, `noId`, and `collateral` to keep it off the network.
   *
   *  No gas estimate and no nonce ride along — those belong to the signer, and
   *  pinning them here would stale the moment the call is cached.
   *
   * @example
   * Pre-sign off the form, send on the click.
   * ```ts
   * const { order, approval } = await trader.buildPlaceOrder({
   *   pool, side: "BUY_YES", price: 620_000n, quantity: 10_000_000n,
   * });
   * if (approval) await walletClient.sendTransaction({ ...approval, account });
   * const signed = await account.signTransaction({ ...order, nonce, ...fees });
   * ```
   *
   * @throws {@link InvalidInputError} - `price` or `quantity` was not > 0.
   */
  buildPlaceOrder(params: PlaceOrderParams): Promise<UnsignedOrder>;
  /**
   *  Build a spot placement WITHOUT sending it — see {@link Trader.buildPlaceOrder}
   *  for when to reach for this and how the returned approval works.
   *
   *  A native-base sell pays via `msg.value`, so it comes back with no `approval`
   *  and a non-zero `order.value`.
   *
   *  **Gotchas**
   *
   *  A spot placement that DEFAULTS its expiry pins it to ~50 years from *now*,
   *  so two builds a second apart differ in that one argument. Harmless against a
   *  50-year horizon, but it means such a build is not byte-reproducible: sign and
   *  send the `order` you were handed rather than rebuilding and expecting the
   *  same bytes. Pass {@link PlaceSpotOrderParams.expireTimestampNs} explicitly
   *  and the build is reproducible, as binary and perp already are.
   */
  buildPlaceSpotOrder(params: PlaceSpotOrderParams): Promise<UnsignedOrder>;
  /**
   *  Build a perp placement WITHOUT sending it — see {@link Trader.buildPlaceOrder}
   *  for when to reach for this.
   *
   *  Never carries an `approval`: margin is locked from the MarginBank balance
   *  rather than escrowed per order ({@link Trader.depositMargin} first).
   */
  buildPlacePerpOrder(params: PlacePerpOrderParams): Promise<UnsignedOrder>;
  /**
   *  Deposit collateral into the MarginBank (auto-approving the collateral token
   *  to the bank by default). One cross-margin balance covers every perp pool.
   */
  depositMargin(params: DepositMarginParams): Promise<TxResult>;
  /** Withdraw free collateral from the MarginBank (margin-checked on-chain). */
  withdrawMargin(params: WithdrawMarginParams): Promise<TxResult>;
  /**
   *  Claim a payout that fell back to a pool's internal ERC20Vault (a
   *  `PayoutFallbackToVault` credit) back to the wallet. Read the claimable
   *  amount first with `client.getVaultBalance({ vault, owner, token })`.
   *
   *  Also how funds leave a manual-mode balance — see {@link setManualVaultMode}.
   */
  withdrawVault(params: WithdrawVaultParams): Promise<TxResult>;
  /**
   *  Pre-fund an ERC-20 balance in a pool's internal vault (approves the pool when
   *  needed). Ordinary placement needs no deposit — auto-pull covers it; deposit
   *  when funding must precede the order. Native goes in via
   *  {@link depositVaultNative}.
   */
  depositVault(params: DepositVaultParams): Promise<TxResult>;
  /**
   *  Pre-fund a native (SOMI) vault balance for the signer, or for another account
   *  when `owner` is set. The amount travels as `msg.value`.
   */
  depositVaultNative(params: DepositVaultNativeParams): Promise<TxResult>;
  /**
   *  Pre-fund ANOTHER account's native vault balance — {@link depositVaultNative}
   *  with `owner` required (an operator funding a bot wallet).
   */
  depositVaultNativeFor(params: DepositVaultNativeParams & { owner: Address }): Promise<TxResult>;
  /**
   *  Opt out of (or back into) wallet auto-pull on one SpotPool. While enabled,
   *  orders draw only on pre-deposited vault balance AND payouts stay as vault
   *  credit — claim them with {@link withdrawVault}. Scoped per user per pool.
   */
  setManualVaultMode(params: SetManualVaultModeParams): Promise<TxResult>;
  /**
   *  Grant or revoke an operator on ONE SpotPool — the tighter way to let a bot trade
   *  for you. The signer is the granting owner; `approved: false` revokes. Read it
   *  back with {@link SomniaMarketsClient.isApprovedForPool}.
   */
  setOperatorApprovalForPool(params: SetOperatorApprovalForPoolParams): Promise<TxResult>;
  /**
   *  Grant or revoke an operator across EVERY registered pool. Required for
   *  `SpotRouter` (not on any pool's allowlist); prefer
   *  {@link setOperatorApprovalForPool} for a single-venue bot.
   */
  setOperatorApprovalGlobal(params: SetOperatorApprovalGlobalParams): Promise<TxResult>;
  /** Set the signer's max leverage for one perp pool (caps position size vs margin). */
  setPerpLeverage(params: SetPerpLeverageParams): Promise<TxResult>;
  /** Permissionlessly poke a perp pool's funding settlement (updateFunding). */
  pokeFunding(params: { pool: Address; gas?: bigint }): Promise<TxResult>;
  /**
   *  Place a spot stop-loss / take-profit pending order on a SpotStopOrderRegistry
   *  (funds the trigger via SOMI msg.value).
   */
  placeSpotStopOrder(params: PlaceSpotStopOrderParams): Promise<PlaceStopOrderResult>;
  /** Cancel a pending stop order on its registry. */
  cancelStopOrder(params: CancelStopOrderParams): Promise<TxResult>;
  /**
   *  Place a perp take-profit / stop-loss on a PerpStopOrderRegistry (funds the
   *  trigger via SOMI msg.value), granting the registry's one-time operator approval
   *  first if the signer has not already.
   *
   *  The single perp-stop create entry: pass `pair` for a linked one-cancels-other
   *  set, or `intent: "opening"` for a stop-entry. Both default off, so an existing
   *  call is an ordinary reduce-only stop and produces the same transaction it always
   *  did.
   */
  placePerpStopOrder(params: PlacePerpStopOrderParams): Promise<PlacePerpStopOrderResult>;
  /**
   *  Link two existing perp stops into a one-cancels-other pair — the after-the-fact
   *  form of `placePerpStopOrder({ pair })`, and how a survivor is re-paired.
   */
  linkPerpStopOrders(params: LinkPerpStopOrdersParams): Promise<TxResult>;
  /**
   *  Cancel a pending perp stop. If it is one leg of a pair the other stays armed and
   *  is unlinked — use {@link cancelPerpStopOrders} to tear down both.
   */
  cancelPerpStopOrder(params: CancelStopOrderParams): Promise<TxResult>;
  /** Cancel several of the signer's pending perp stops in one tx, one refund transfer. */
  cancelPerpStopOrders(params: CancelPerpStopOrdersParams): Promise<TxResult>;
  /**
   *  Claim SOMI the perp stop registry owes the signer — the refund path for an
   *  owner that cannot receive native. Reverts `NothingToClaim` on a zero balance.
   */
  claimPerpStopSomi(params: ClaimPerpStopSomiParams): Promise<TxResult>;

  // -- build-only twins -----------------------------------------------------
  // Same parameters as the sending verbs above, but they hand back the unsigned
  // call instead of broadcasting it — so several writes can be packed into ONE
  // transaction (an ERC-4337 UserOp, a Safe batch, a relayed multicall). That
  // matters wherever a flow is only safe as one: an order with TP/SL attached
  // (sent separately, the order can fill and sit with no stop on it), approve +
  // deposit, withdraw + forward to the wallet.
  //
  // Nothing is sent and nothing is read back — no receipt, so no ids and no
  // fills. Every one shares its call construction with its sending twin, so the
  // calldata cannot drift from what the SDK actually puts on the wire.

  /**
   *  Build {@link placePerpStopOrder} without sending it — the stop-registry call
   *  plus, unless skipped, the operator grant the trigger needs first.
   *
   *  Recover the created ids from your own receipt with `decodePerpStopOrderIds`.
   */
  buildPlacePerpStopOrder(params: PlacePerpStopOrderParams): Promise<UnsignedPerpStopOrder>;
  /** Build {@link cancelPerpStopOrder} without sending it. */
  buildCancelPerpStopOrder(params: CancelStopOrderParams): UnsignedCall;
  /** Build {@link cancelPerpStopOrders} without sending it. */
  buildCancelPerpStopOrders(params: CancelPerpStopOrdersParams): UnsignedCall;
  /**
   *  Build {@link depositMargin} without sending it — the `deposit` call plus, unless
   *  `autoApprove: false`, the ERC-20 approval the bank needs first.
   */
  buildDepositMargin(params: DepositMarginParams): Promise<UnsignedMarginDeposit>;
  /** Build {@link withdrawMargin} without sending it. Nothing to approve. */
  buildWithdrawMargin(params: WithdrawMarginParams): Promise<UnsignedCall>;

  /** Mint a YES+NO set: deposit collateral, receive equal YES + NO. */
  mintSet(params: MintSetParams): Promise<TxResult>;
  /** Burn a YES+NO set: surrender both halves, receive collateral back. */
  burnSet(params: BurnSetParams): Promise<TxResult>;
  /**
   *  Burn winning outcome tokens for collateral (resolved/voided markets).
   *  Settlement-extraction v2: module-routed — the module pulls the caller's
   *  winning tokens, finalizes-if-needed, and redeems through BinarySettlement.
   *  Takes `marketId` (not a pool address — a pool serves successive markets).
   */
  redeem(params: RedeemParams): Promise<TxResult>;
  /**
   *  Produce an EIP-712 {@link RedeemAuthorization} the connected signer (the
   *  position owner) hands to a relayer, so the relayer can call
   *  {@link Trader.redeemFor} and pay the gas while the OWNER receives the payout.
   *  Signs over the module's `REDEEM_AUTH_TYPEHASH` in the `SomniaMarkets` domain;
   *  no transaction is sent.
   */
  signRedeemAuth(params: SignRedeemAuthParams): Promise<RedeemAuthorization>;
  /**
   *  Relayer path: submit a position owner's pre-signed {@link RedeemAuthorization}
   *  (from {@link Trader.signRedeemAuth}). The caller pays gas; the module pays the
   *  OWNER the collateral (payout is hard-pinned to `owner`, never the relayer).
   */
  redeemFor(params: RedeemForParams): Promise<TxResult>;
  /** Claim winnings from many settled markets in one transaction (batch redeem). */
  redeemMany(params: RedeemManyParams): Promise<TxResult>;
  /**
   *  Low-level direct redemption against the BinarySettlement singleton (bypasses
   *  the module; no operator attribution). Takes the raw ERC-6909 `outcomeId`.
   */
  redeemDirect(params: RedeemDirectParams): Promise<TxResult>;
  /** Claim an accrued push-fallback (`owed`) balance on the settlement singleton. */
  claimOwed(params: ClaimOwedParams): Promise<TxResult>;
  /**
   *  Permissionless oracle retry — the FIRST move when a market is past expiry
   *  with no resolution: ask the module to re-pull the answer for its oracle
   *  question.
   *
   *  **When to use**
   *
   *  Use before {@link Trader.voidExpired}. A poke that succeeds resolves the
   *  market normally (winners paid in full); voiding pays everyone 1/N instead,
   *  so it is the fallback, not the first resort.
   *
   *  **Gotchas**
   *
   *  Keyed by ORACLE QUESTION, not market: the module fans out to every market
   *  bound to that question and resolves the ones whose adapter answers.
   *  Unanswered adapters are skipped, so this can resolve some markets and leave
   *  others — a success is not "all bound markets resolved". Reverts
   *  `OracleNotAnswered` only when none answered, `UnknownOracleQuestion` when
   *  no market is bound; both decode as {@link ContractRevertError}, so a keeper
   *  loop can branch on `errorName`.
   */
  pokeOracle(params: PokeOracleParams): Promise<TxResult>;
  /**
   *  Permissionless dead-oracle escape hatch: void a market whose oracle never
   *  answered, so both sides can redeem at 1/N collateral.
   *
   *  **When to use**
   *
   *  Use only after {@link Trader.pokeOracle} has failed and
   *  `expiry + settlementWindow` has elapsed — this is the funds-unstranding
   *  backstop, and it pays 1/N rather than the real outcome.
   *
   *  **Gotchas**
   *
   *  This writes to the MARKET contract, bypassing the module — so the oracle
   *  hub's earmark release never fires. Follow with
   *  {@link Trader.syncSettlement}, then {@link Trader.finalizeMarket} and
   *  {@link Trader.releasePool}, to leave the market fully reconciled.
   *
   *  Before sending, this reads the market's status, expiry, and settlement
   *  window and throws {@link InvalidInputError} naming the gate time if the
   *  window is still open — the on-chain `SettlementWindowOpen` revert carries
   *  no timestamp, and "when can I retry" is the operator's real question. The
   *  comparison uses the chain's `block.timestamp`, matching the contract, so a
   *  skewed local clock neither lets a doomed call through nor blocks a valid
   *  one. Pass `skipPreflight` to send blind and let the contract judge.
   */
  voidExpired(params: VoidExpiredParams): Promise<TxResult>;
  /**
   *  Permissionless keeper: finalize a settled market (sweep its pool's backing +
   *  resolution snapshot to the settlement singleton). No-op-guarded on repeat.
   */
  finalizeMarket(params: FinalizeMarketParams): Promise<TxResult>;
  /**
   *  Permissionless earmark reconcile: release the oracle earmark of a market voided
   *  via `BinaryMarket.voidExpired()` (which bypasses the module, so the hub's earmark
   *  release never fired). Idempotent; reverts `MarketNotSettled` while still live.
   */
  syncSettlement(params: SyncSettlementParams): Promise<TxResult>;
  /**
   *  Permissionless keeper: release a finalized, drained pool back to its creator's
   *  free list for recycle onto the next market.
   */
  releasePool(params: ReleasePoolParams): Promise<TxResult>;
  /**
   *  Read a market's settlement record from the BinarySettlement singleton (by
   *  bytes32 marketId — resolves the marketKey via the module's yesId). Returns
   *  null when the market has never been finalized.
   */
  getSettlement(marketId: Hex, opts?: { module?: Address; settlement?: Address }): Promise<SettlementRecord | null>;
  /** Read a creator's free (finalized + released, reusable) pools for a collateral. */
  getFreePools(creator: Address, collateral: Address, opts?: { module?: Address }): Promise<Address[]>;
  /** Read a pool's creator (its first-deploy creator — the only party that can reuse it). */
  poolCreator(pool: Address, opts?: { module?: Address }): Promise<Address>;
  /**
   *  Mint a complete YES+NO set paying with NATIVE token via the CollateralRouter
   *  (wraps `msg.value` → wNative). The market's collateral must be wNative.
   */
  mintSetNative(params: MintSetNativeParams): Promise<TxResult>;
  /**
   *  Mint a complete YES+NO set pulling collateral via a Permit2 signature through
   *  the CollateralRouter (no prior ERC-20 `approve`).
   */
  mintSetPermit2(params: MintSetPermit2Params): Promise<TxResult>;
  /**
   *  Redeem winning outcome tokens for a NATIVE payout via the CollateralRouter
   *  (unwraps wNative → native). Approve the router for the winning outcome first.
   */
  redeemNative(params: RedeemNativeParams): Promise<TxResult>;
  /** Mint TestUSDC from the faucet to the signer. */
  faucet(params?: FaucetParams): Promise<TxResult>;
  /** Resolve a market via the FakeOracle (demo resolver). */
  resolve(params: ResolveParams): Promise<TxResult>;
  /** Void a market via the FakeOracle (demo resolver). */
  voidMarket(params: VoidMarketParams): Promise<TxResult>;
  /** Poke a market to advance its lifecycle. No-op since status is derived; kept for ABI stability. */
  poke(params: { market: Address; gas?: bigint }): Promise<TxResult>;
  /**
   *  Forget cached token approvals so the next escrowing write re-checks allowance.
   *  Pass a (token, spender) to clear one pair, or nothing to clear all. Rarely
   *  needed — maxUint256 approvals don't decrement.
   */
  clearApprovalCache(token?: Address, spender?: Address): void;
}

/**
 *  @internal Wiring a trader resolves config/client through — `createClient()`
 *  passes its own so the trader shares that client's chain, fees, addresses,
 *  and WebSocket. The trader has NO dependency on the live tail or its store:
 *  pool escrow tokens are resolved from the pool contract itself (one
 *  pipelined read, cached per pool) when not passed explicitly. Reached via
 *  `client.createTrader(...)`.
 */
export interface TraderDeps {
  getConfig: () => ClientConfig;
  getClient: () => PublicClient;
  /** @internal The owning client's debug channel; defaults to a no-op when absent. */
  dbg?: Debug;
}

/**
 *  @internal Build a trader bound to a signer + a client's deps. The public entry
 *  is `client.createTrader(traderConfig)`.
 *
 * ```ts
 * const trader = client.createTrader({ walletClient });
 * await trader.placeOrder({ pool, side: "BUY_YES", price, quantity });
 * await trader.mintSet({ pool, amount });
 * await trader.redeem({ marketId, amount, outcomeIdx: 0 });
 * ```
 */
export function createTraderWithDeps(config: TraderConfig, deps: TraderDeps): Trader {
  // The write plane lives in writer.ts (one context instead of ~25 closures).
  // Every trading verb now delegates to a concept module that takes the `Writer`
  // as its first parameter (design D3), so only the few members this file still
  // uses directly are pulled out here.
  const w = Writer.createWriter(config, deps);
  const {
    clearApprovalCache,
    resolveModule,
    resolveSettlement,
    publicClient,
    dbg,
  } = w;

  const trader: Trader = {
    placeOrder: (p) => Orders.placeOrder(w, p),

    approveBuilder: (p) => Fees.approveBuilder(w, p),

    getBuilderApproval: (ref) => Fees.getBuilderApproval(ref, publicClient),

    getEffectiveBuilderApproval: (ref) => Fees.getEffectiveBuilderApproval(ref, publicClient),

    async getMaxBuilderFeeBpsTimes1k(pool: Address): Promise<bigint> {
      return (await publicClient.readContract({
        address: pool,
        abi: TradeAbi.binaryPoolWriteAbi,
        functionName: "getMaxBuilderFeeBpsTimes1k",
      }));
    },

    cancelOrder: (p) => Orders.cancelOrder(w, p),

    reduceOrder: (p) => Orders.reduceOrder(w, p),

    cancelExpiredOrders: (p) => Orders.cancelExpiredOrders(w, p),

    sweepExpiredAtLevel: (p) => Orders.sweepExpiredAtLevel(w, p),

    placeSpotOrder: (p) => Orders.placeSpotOrder(w, p),

    placeSpotOrders: (p) => Orders.placeSpotOrders(w, p),

    cancelOrders: (p) => Orders.cancelOrders(w, p),

    reduceOrders: (p) => Orders.reduceOrders(w, p),

    placePerpOrder: (p) => Orders.placePerpOrder(w, p),
    buildPlaceOrder: (p) => Orders.buildPlaceOrder(w, p),
    buildPlaceSpotOrder: (p) => Orders.buildPlaceSpotOrder(w, p),
    buildPlacePerpOrder: (p) => Orders.buildPlacePerpOrder(w, p),

    amendOrder: (p) => Orders.amendOrder(w, p),
    amendOrders: (p) => Orders.amendOrders(w, p),

    depositMargin: (p) => PerpMargin.depositMargin(w, p),

    withdrawMargin: (p) => PerpMargin.withdrawMargin(w, p),

    withdrawVault: (p) => BinarySettlement.withdrawVault(w, p),

    depositVault: (p) => VaultFunding.depositVault(w, p),

    depositVaultNative: (p) => VaultFunding.depositVaultNative(w, p),

    depositVaultNativeFor: (p) => VaultFunding.depositVaultNative(w, p),

    setManualVaultMode: (p) => SpotVaultMode.setManualVaultMode(w, p),

    setOperatorApprovalForPool: (p) => SpotOperatorGrants.setOperatorApprovalForPool(w, p),

    setOperatorApprovalGlobal: (p) => SpotOperatorGrants.setOperatorApprovalGlobal(w, p),

    setPerpLeverage: (p) => PerpMargin.setPerpLeverage(w, p),

    pokeFunding: (p) => PerpState.pokeFunding(w, p),

    placeSpotStopOrder: (p) => SpotStops.placeSpotStopOrder(w, p),

    cancelStopOrder: (p) => SpotStops.cancelStopOrder(w, p),

    placePerpStopOrder: (p) => PerpStops.placePerpStopOrder(w, p),

    linkPerpStopOrders: (p) => PerpStops.linkPerpStopOrders(w, p),

    cancelPerpStopOrder: (p) => PerpStops.cancelPerpStopOrder(w, p),

    cancelPerpStopOrders: (p) => PerpStops.cancelPerpStopOrders(w, p),

    claimPerpStopSomi: (p) => PerpStops.claimPerpStopSomi(w, p),
    buildPlacePerpStopOrder: (p) => PerpStops.buildPlacePerpStopOrder(w, p),

    buildCancelPerpStopOrder: (p) => PerpStops.buildCancelPerpStopOrder(w, p),

    buildCancelPerpStopOrders: (p) => PerpStops.buildCancelPerpStopOrders(w, p),

    buildDepositMargin: (p) => PerpMargin.buildDepositMargin(w, p),

    buildWithdrawMargin: (p) => PerpMargin.buildWithdrawMargin(w, p),

    mintSet: (p) => BinarySets.mintSet(w, p),

    burnSet: (p) => BinarySets.burnSet(w, p),

    redeem: (p) => BinarySettlement.redeem(w, p),
    signRedeemAuth: (p) => BinarySettlement.signRedeemAuth(w, p),

    redeemFor: (p) => BinarySettlement.redeemFor(w, p),

    redeemMany: (p) => BinarySettlement.redeemMany(w, p),

    redeemDirect: (p) => BinarySettlement.redeemDirect(w, p),

    claimOwed: (p) => BinarySettlement.claimOwed(w, p),

    pokeOracle: (p) => BinarySettlement.pokeOracle(w, p),
    voidExpired: (p) => BinarySettlement.voidExpired(w, p),
    finalizeMarket: (p) => BinarySettlement.finalizeMarket(w, p),

    syncSettlement: (p) => BinarySettlement.syncSettlement(w, p),

    releasePool: (p) => BinarySettlement.releasePool(w, p),

    async getSettlement(
      marketId: Hex,
      opts?: { module?: Address; settlement?: Address },
    ): Promise<SettlementRecord | null> {
      const module = resolveModule(opts?.module);
      const settlement = resolveSettlement(opts?.settlement);
      // The settlement record is keyed by marketKey (= yesId >> 8). Read the
      // market's yesId off the module (its `markets` tuple) → derive the key.
      const rec = (await publicClient.readContract({
        address: module,
        abi: ModuleAbi.binaryModuleReadAbi,
        functionName: "markets",
        args: [marketId],
      })) as readonly unknown[];
      const yesId = rec[10] as bigint; // MarketRecord.yesId (11th tuple field)
      if (yesId === 0n) return null; // unknown / uncreated market
      const key = Ids.marketKey(yesId);
      const s = (await publicClient.readContract({
        address: settlement,
        abi: ReadsAbi.binarySettlementAbi,
        functionName: "getSettlement",
        args: [key],
      }));
      if (!s.finalized) return null;
      // Settlement v3 stores a payout VECTOR; derive the winner as its argmax
      // (meaningful only when !voided).
      const payoutNumerators = [...s.payoutNumerators];
      let winningOutcome = 0;
      for (let i = 1; i < payoutNumerators.length; i++) {
        if ((payoutNumerators[i] ?? 0n) > (payoutNumerators[winningOutcome] ?? 0n)) winningOutcome = i;
      }
      return {
        collateralToken: s.collateralToken,
        backing: s.backing,
        finalized: s.finalized,
        voided: s.voided,
        winningOutcome,
        payoutNumerators,
        settlementFeeBpsTimes1k: s.settlementFeeBpsTimes1k,
        feeRecipient: s.feeRecipient,
        pool: s.pool,
        nonce: s.nonce,
      };
    },

    async getFreePools(creator: Address, collateral: Address, opts?: { module?: Address }): Promise<Address[]> {
      const pools = (await publicClient.readContract({
        address: resolveModule(opts?.module),
        abi: ModuleAbi.binaryModuleReadAbi,
        functionName: "getFreePools",
        args: [creator, collateral],
      }));
      return [...pools];
    },

    async poolCreator(pool: Address, opts?: { module?: Address }): Promise<Address> {
      return (await publicClient.readContract({
        address: resolveModule(opts?.module),
        abi: ModuleAbi.binaryModuleReadAbi,
        functionName: "poolCreator",
        args: [pool],
      }));
    },

    mintSetNative: (p) => BinarySets.mintSetNative(w, p),

    mintSetPermit2: (p) => BinarySets.mintSetPermit2(w, p),

    redeemNative: (p) => BinarySettlement.redeemNative(w, p),

    faucet: (p = {}) => Testnet.faucet(w, p),

    resolve: (p) => Testnet.resolve(w, p),

    voidMarket: (p) => Testnet.voidMarket(w, p),

    poke: (p) => PerpState.poke(w, p),

    clearApprovalCache,
  };

  // Boundary tracing: every public trader method runs in its own ROOT span
  // (`trader.<method>`) with the first argument as span data. The Proxy leaves
  // the table untouched (and is the table itself when debugging is off).
  return dbg.tracedObject("trader", trader);
}

