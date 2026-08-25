// Perp stop orders — the take-profit / stop-loss plane.
//
// PERP-ONLY. Both tiers live here: the indexer LISTING (what stops do I have) and the
// chain WRITES + a per-order chain read.
//
// LISTING IS STILL INDEXER-ONLY, and not by preference. The registry exposes no
// per-owner or count getter — `allPendingOrders` is private, and `hasOrdersFor` is a
// PerpPool view about RESTING book orders, not a registry one. So nothing on chain
// answers "what stops do I have", and a creation the indexer missed is invisible.
//
// The registry DID gain a per-ORDER getter (`getPendingOrder`), which closes two gaps
// this file used to record as permanent. A LIMIT stop's `limitPrice` is now readable,
// where before it was passed in calldata, kept in private storage, and carried by no
// event — so nothing off-chain could show the limit a trader chose. Same for a linked
// pair's `siblingOrderId` and an order's `intent`. All three need the id first, so
// they enrich a listing rather than replace it.
//
// The listing does not surface pairing or intent yet: the indexer subscribes to four
// registry events and the link events are not among them, and adding them is a schema
// change that forces a reindex. Until then `getPerpStopOrder` is where that state
// lives.
//
// One of those four unsubscribed events is not cosmetic, which matters while this is the
// tip. `LinkedOrderCancelled` is the ONLY signal that a pair's surviving leg was torn
// down after its sibling filled — `_cancelSiblingOnFill` does not also emit
// `PendingOrderCancelled` — so until it is subscribed a listing keeps reporting that leg
// as `PENDING` and cancelling it reverts. Confirm with `getPerpStopOrder`, whose `live`
// flag is the only truth. The indexer side is #276, stacked directly on this branch;
// that PR replaces this paragraph.

import { decodeEventLog, type Address, type Hex, type PublicClient } from "viem";
import * as IndexerRead from "../indexerRead.js";
import { graphql } from "../gql/gql.js";
import { InvalidInputError, NotConfiguredError } from "../errors.js";
import * as TradeAbi from "../tradeAbi.js";
import * as Writer from "../writer.js";
import type { Writer as WriterCtx } from "../writer.js";
import type {
  CancelPerpStopOrdersParams,
  ClaimPerpStopSomiParams,
  CancelStopOrderParams,
  LinkPerpStopOrdersParams,
  PerpStopIntent,
  PerpStopOrderLeg,
  PlacePerpStopOrderParams,
  PlacePerpStopOrderResult,
  TxResult,
} from "../trade.js";
import type { StopOrderStatus } from "../spot/stops.js";

/**
 *  Why a triggered stop placed nothing. Mirrors the registry's `DropReason` enum.
 *
 *  The distinction matters for what a UI should say. `ReduceOnly*` are ordinary
 *  outcomes of a stop that events overtook — the position was already closed, or
 *  flipped, or what remained was dust — while `PlacementFailed` is a real rejection.
 *  Collapsing them all to "failed" makes routine behaviour look broken.
 */
export const PERP_STOP_DROP_REASON = [
  "None",
  "ReduceOnlyNoPosition",
  "ReduceOnlyWrongSide",
  "ReduceOnlyBelowMinQty",
  "PlacementFailed",
  // Appended by the registry; every earlier member keeps its index, so already-indexed
  // rows are unaffected. Separates a placement the pool ACCEPTED but that traded
  // nothing from one it rejected outright — the pool decides an IOC's fate on a dry
  // run, and the real run can fill less, including zero, when it pulls a maker the dry
  // run had counted. Previously reported as a success, which concealed it.
  "NoFill",
] as const;

/** A drop reason, decoded from the on-chain enum index. */
export type PerpStopDropReason = (typeof PERP_STOP_DROP_REASON)[number];

/** The perp market a stop order targets. */
export type PerpStopOrderMarket = {
  /** Pool address (lowercased; == the market id for perp). */
  poolAddress: string;
  /** Synthetic-base symbol (e.g. "WBTC"); null when the wrapper exposes none. */
  baseSymbol: string | null;
  /** Collateral token symbol; null when the token exposes none. */
  quoteSymbol: string | null;
  /** Base-token decimals — format quantities with this. */
  baseDecimals: number;
  /** Collateral decimals — format the trigger price with this. */
  quoteDecimals: number;
};

/** One take-profit / stop-loss order on a perp market. */
export type PerpStopOrder = {
  /** Row id (`${registry}_${orderId}`). */
  id: string;
  /** The PerpStopOrderRegistry holding it (lowercased). */
  registry: string;
  /** uint128 registry OrderId as a decimal string — pass to `trader.cancelStopOrder`. */
  orderIdRaw: string;
  /** The order's owner (lowercased). */
  owner: string;
  /** True = the triggered order buys, false = sells. */
  isBid: boolean;
  /** Quantity in raw base units. */
  quantity: string;
  /** The MARK price at which it fires, raw quote units per whole base. */
  triggerPrice: string;
  /**
   *  Which way the mark must cross `triggerPrice` to fire: `0` = GTE (fires at or
   *  above), `1` = LTE (fires at or below). This, not the side, is what makes a stop a
   *  take-profit or a stop-loss.
   */
  triggerOperator: number;
  /** `0` = LIMIT, `1` = MARKET — the type of order placed when it fires. */
  orderType: number;
  /** Builder tagged on the resulting order (lowercased); zero address for none. */
  builder: string;
  /**
   *  The builder fee the triggered order will charge, in bps x 1000 — so `1500` is
   *  1.5bps, not 1500bps. `"0"` when no builder is tagged.
   *
   *  Only knowable from the creation event: the registry deletes a pending order on
   *  every fire, so after a trigger nothing on chain can say what fee was agreed.
   */
  builderFeeBpsTimes1k: string;
  /** Lifecycle state — see {@link StopOrderStatus}. */
  status: StopOrderStatus;
  /** The PerpPool order id created on a successful trigger; null otherwise. */
  placedOrderId: string | null;
  /**
   *  Why a trigger placed nothing, decoded — null on a pending or successful order.
   *
   *  Read it before calling a `TRIGGER_FAILED` order a failure: a reduce-only drop
   *  means the stop was overtaken by events (position already closed, flipped, or
   *  below minimum), which is ordinary. Only `PlacementFailed` is a rejection. SOMI is
   *  consumed on every fire regardless of outcome.
   */
  dropReason: PerpStopDropReason | null;
  /** Timestamp (unix seconds) the stop was created. */
  createdAt: string;
  /** Timestamp (unix seconds) of the last state change. */
  updatedAt: string;
  /** Tx hash the stop was created in. */
  txHash: string;
  /** The perp market it targets. */
  market: PerpStopOrderMarket;
};

// prettier-ignore
const PerpStopOrdersQuery = graphql(`
  query PerpStopOrders($where: StopOrder_bool_exp!, $limit: Int, $offset: Int) {
    StopOrder(where: $where, order_by: { createdAt: desc }, limit: $limit, offset: $offset) {
      id
      registry
      orderIdRaw
      owner
      isBid
      quantity
      triggerPrice
      triggerOperator
      orderType
      builder
      builderFeeBpsTimes1k
      status
      placedOrderId
      dropReason
      createdAt
      updatedAt
      txHash
      market {
        poolAddress
        baseSymbol
        quoteSymbol
        baseDecimals
        quoteDecimals
      }
    }
  }
`);

/**
 *  Perp stop orders, newest first — the read that makes TP/SL usable.
 *
 *  Indexer tier. Every scope the UI needs comes from the same call:
 *
 *  - **A trader's working stops** — `{ account }`. The default status is `PENDING`.
 *  - **A market's whole pending book** — `{ pool }` with no account.
 *  - **History** — pass `status` (e.g. `["TRIGGERED", "TRIGGER_FAILED", "CANCELLED"]`).
 *
 *  `account` is optional deliberately: the registry is per-market, and a market-wide
 *  view of what will fire is a legitimate read (monitoring, keeper tooling), not just
 *  a per-user one.
 *
 *  There is no chain fallback. The registry exposes no enumeration getter, so if the
 *  indexer has not seen a creation, nothing can list it.
 *
 *  @param opts.account - restrict to one owner; omit for the whole market
 *  @param opts.pool - restrict to one perp pool
 *  @param opts.status - lifecycle states to include; default `["PENDING"]`
 *  @param opts.limit - max rows, default 200
 *  @param opts.offset - row offset for paging, default 0
 */
export async function listPerpStopOrders(
  opts: {
    account?: string;
    pool?: string;
    status?: StopOrderStatus[];
    limit?: number;
    offset?: number;
  } = {},
  indexerUrl: string,
): Promise<PerpStopOrder[]> {
  const where: Record<string, unknown> = {
    // The StopOrder entity is shared with spot; without this a perp read would return
    // spot stops too, and their orderIdRaw addresses a different registry entirely.
    market: { marketType: { _eq: "PERP" } },
  };
  if (opts.pool != null) {
    where.market = { marketType: { _eq: "PERP" }, poolAddress: { _eq: opts.pool.toLowerCase() } };
  }
  if (opts.account != null) where.owner = { _eq: opts.account.toLowerCase() };
  const statuses = opts.status != null && opts.status.length > 0 ? opts.status : ["PENDING"];
  where.status = { _in: statuses };

  const data = await IndexerRead.gqlRequest(PerpStopOrdersQuery,
    { where, limit: opts.limit ?? 200, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return IndexerRead.narrowIndexerInvariant<PerpStopOrder>(
    data.StopOrder.map((o) => ({
      ...o,
      // The enum arrives as its on-chain index. Decoded here so a consumer branches on
      // a name rather than re-deriving the mapping — and null on success, where the
      // contract's `None` would otherwise read as a reason.
      dropReason: o.dropReason == null ? null : (PERP_STOP_DROP_REASON[o.dropReason] ?? null),
    })),
  );
}

// ---------------------------------------------------------------------------
// Writes + the per-order chain read.
//
// The registry places the triggered order via PerpPool.placeOrderFor. Perps reserve
// the pool's SYSTEM allowlist for MarginBank, so the registry is admitted ONLY by the
// owner's per-user operator approval — without it a trigger reverts and the prepaid
// SOMI is consumed for nothing. That approval is a one-time, cross-pool grant, so it
// is checked and granted here rather than left as a documented prerequisite.
//
// Unlike spot there is no token escrow leg: perp collateral is a single USDso balance
// in the MarginBank, so there is nothing to approve to the pool and no native
// pre-load. Margin is the trader's own problem — a stop that cannot be margined at
// trigger surfaces as a drop, not a revert here.

// IOrderBook.placeOrderFor — the capability the registry must hold for the owner.
const PLACE_ORDER_FOR_SELECTOR = "0x80054449" as const;

/** Intent as the contract encodes it: 0 = ReduceOnly, 1 = Opening. */
const INTENT_INDEX = { reduceOnly: 0, opening: 1 } as const;

/**
 *  SOMI a PerpStopOrderRegistry charges per pending order (funds the reactivity
 *  trigger gas; refunded on cancel, consumed on every fire). Raw wei, 18dp native.
 *
 *  A linked pair costs twice this — one payment funds one trigger.
 */
export async function getPerpStopOrderSomiPayment(
  registry: Address,
  client: PublicClient,
): Promise<bigint> {
  return client.readContract({
    address: registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "somiPaymentPerOrder",
  });
}

/** One stored perp stop, read straight from the registry. */
export type PerpStopOrderOnChain = {
  /** True = the triggered order buys. */
  isBid: boolean;
  /** Owner (checksummed as the contract stores it). */
  owner: Address;
  /** Raw base units; `0n` means "the whole position at trigger". */
  quantity: bigint;
  /** Mark price that arms it. */
  triggerPrice: bigint;
  /** 0 = GTE, 1 = LTE. */
  triggerOperator: number;
  /** 0 = LIMIT, 1 = MARKET. */
  orderType: number;
  /** The LIMIT price — the one field the indexer cannot see, since no event carries it. */
  limitPrice: bigint;
  /** Builder tagged on the triggered order; zero address for none. */
  builder: Address;
  /** Builder fee in bps x 1000. */
  builderFeeBpsTimes1k: bigint;
  /** SOMI paid at creation. */
  somiPaid: bigint;
  /** The linked sibling's id, or `0n` when unlinked. */
  siblingOrderId: bigint;
  /** `"reduceOnly"` or `"opening"`. */
  intent: PerpStopIntent;
};

/**
 *  Read one pending stop straight from the registry — the chain tier the listing
 *  never had.
 *
 *  Worth using even though {@link listPerpStopOrders} exists, for two reasons the
 *  indexer cannot cover. It answers during a reindex or an indexer outage. And it is
 *  the ONLY way to see a LIMIT stop's `limitPrice`, its linked `siblingOrderId`, and
 *  its `intent` — none of which any event carries, so nothing off-chain can show them.
 *
 *  It cannot enumerate: the registry exposes no per-owner getter, so listing still
 *  requires the indexer. Fetch ids there, then enrich here.
 *
 *  @returns `null` when the id is not live. **Do not infer liveness from the returned
 *    terms** — a cancelled or triggered order keeps its stored id until its slot is
 *    recycled, so a dead id reads back with a matching id and plausible values. The
 *    contract's `live` flag is the only truth, and this returns `null` on it.
 */
export async function getPerpStopOrder(
  p: { registry: Address; orderId: bigint | string },
  client: PublicClient,
): Promise<PerpStopOrderOnChain | null> {
  const [live, stored] = await client.readContract({
    address: p.registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "getPendingOrder",
    args: [BigInt(p.orderId)],
  });
  if (!live) return null;
  const t = stored.orderWithTrigger;
  return {
    isBid: t.order.isBid,
    owner: t.order.owner,
    quantity: t.order.quantity,
    triggerPrice: t.triggerPrice,
    triggerOperator: t.triggerOperator,
    orderType: t.orderType,
    limitPrice: t.limitPrice,
    builder: t.builder,
    builderFeeBpsTimes1k: t.builderFeeBpsTimes1k,
    somiPaid: stored.somiPaid,
    siblingOrderId: stored.siblingOrderId,
    intent: stored.intent === INTENT_INDEX.opening ? "opening" : "reduceOnly",
  };
}

/** One leg in the shape the registry's create functions take. */
type TriggerTuple = ReturnType<typeof toTriggerTuple>;

/** Shapes one leg into the registry's `PendingOrderWithTrigger` tuple. */
function toTriggerTuple(leg: PerpStopOrderLeg, owner: Address) {
  return {
    order: { isBid: leg.isBid, owner, userData: 0n, quantity: leg.quantity },
    orderType: leg.stopOrderType,
    triggerPrice: leg.triggerPrice,
    triggerOperator: leg.triggerOperator,
    limitPrice: leg.limitPrice ?? 0n,
    builder: leg.builder ?? Writer.ZERO_ADDRESS,
    builderFeeBpsTimes1k: leg.builderFeeBpsTimes1k ?? 0n,
  };
}

/** Shared per-leg validation — the checks the registry would revert on anyway. */
function validateLeg(leg: PerpStopOrderLeg, intent: PerpStopIntent, label: string): void {
  if (leg.triggerPrice <= 0n) throw new InvalidInputError(`${label}: triggerPrice must be > 0`);
  if (leg.quantity < 0n) throw new InvalidInputError(`${label}: quantity cannot be negative`);
  if (leg.quantity === 0n && intent === "opening") {
    // Zero means "the whole position", which an order meant to CREATE exposure has
    // none of. Caught here so it fails before the SOMI is spent.
    throw new InvalidInputError(`${label}: an opening stop needs a non-zero quantity`);
  }
  if (leg.stopOrderType === 0 && (leg.limitPrice ?? 0n) <= 0n) {
    throw new InvalidInputError(`${label}: a LIMIT stop needs limitPrice > 0`);
  }
  if (leg.stopOrderType === 1 && (leg.limitPrice ?? 0n) !== 0n) {
    throw new InvalidInputError(`${label}: a MARKET stop must not set limitPrice`);
  }
  if (leg.builder == null && (leg.builderFeeBpsTimes1k ?? 0n) > 0n) {
    throw new InvalidInputError(`${label}: builderFeeBpsTimes1k needs a builder`);
  }
}

/**
 *  One unpaired leg as a call — the intent split, which is a contract-level detail.
 *
 *  Reduce-only routes through the original entry point so an unchanged caller produces
 *  an unchanged transaction; `createTriggerOrder` is the only one that takes an intent.
 */
function singleLegCall(
  a: { registry: Address; leg: TriggerTuple; intent: PerpStopIntent; somi: bigint; gas: bigint },
): Writer.WriteCall {
  const call = { address: a.registry, abi: TradeAbi.perpStopRegistryWriteAbi, gas: a.gas, value: a.somi };
  if (a.intent === "reduceOnly") {
    return { ...call, functionName: "createPendingOrder", args: [a.leg] };
  }
  return { ...call, functionName: "createTriggerOrder", args: [a.leg, INTENT_INDEX.opening] };
}

/**
 *  Both legs as a one-cancels-other pair, at twice the SOMI — one payment funds one
 *  trigger.
 *
 *  The registry names its legs by operator, not by argument order, so they are routed
 *  here rather than trusting the caller to have passed GTE first.
 */
function linkedPairCall(
  a: { registry: Address; self: TriggerTuple; other: TriggerTuple; selfIsGte: boolean; somi: bigint; gas: bigint },
): Writer.WriteCall {
  const [gte, lte] = a.selfIsGte ? [a.self, a.other] : [a.other, a.self];
  return {
    address: a.registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "createLinkedPendingOrders",
    args: [gte, lte],
    gas: a.gas,
    value: a.somi * 2n,
  };
}

/**
 *  Validate a placement and shape it into the ONE registry call it becomes.
 *
 *  Split out of {@link placePerpStopOrder} so the sending verb and
 *  {@link buildPlacePerpStopOrder} encode from one definition — a build-only verb
 *  whose bytes can drift from what actually gets sent is worse than no build verb,
 *  because the drift is invisible until a UserOp reverts.
 */
function stopPlacementCall(
  w: WriterCtx,
  p: PlacePerpStopOrderParams,
  a: { intent: PerpStopIntent; somi: bigint; gas: bigint },
): Writer.WriteCall {
  validateLeg(p, a.intent, "stop order");
  const self = toTriggerTuple(p, w.fromAddress);
  if (p.pair == null) {
    return singleLegCall({ registry: p.registry, leg: self, intent: a.intent, somi: a.somi, gas: a.gas });
  }
  if (a.intent === "opening") {
    throw new InvalidInputError("a linked pair must be reduce-only on both legs");
  }
  validateLeg(p.pair, "reduceOnly", "paired leg");
  if (p.triggerOperator === p.pair.triggerOperator) {
    throw new InvalidInputError("a linked pair needs opposite trigger operators (one GTE, one LTE)");
  }
  if (p.isBid !== p.pair.isBid) {
    throw new InvalidInputError("a linked pair must be the same side — both legs reduce one position");
  }
  return linkedPairCall({
    registry: p.registry,
    self,
    other: toTriggerTuple(p.pair, w.fromAddress),
    selfIsGte: p.triggerOperator === 0,
    somi: a.somi,
    gas: a.gas,
  });
}

/**
 *  The one-time operator grant that lets the registry place on the owner's behalf.
 *
 *  Without it the trigger reverts and the prepaid SOMI is consumed having placed
 *  nothing — which is why both the sending verb and the build twin default to
 *  covering it.
 */
function operatorGrantCall(w: WriterCtx, p: PlacePerpStopOrderParams, gas: bigint): Writer.WriteCall {
  const operatorRegistry = p.operatorRegistry ?? w.addresses().operatorPermissionsRegistry;
  if (!operatorRegistry) {
    throw new NotConfiguredError("operatorRegistry or addresses.operatorPermissionsRegistry", "a perp stop order");
  }
  return {
    address: operatorRegistry,
    abi: TradeAbi.operatorRegistryWriteAbi,
    functionName: "setOperatorApprovalGlobal",
    args: [p.registry, [PLACE_ORDER_FOR_SELECTOR], true],
    gas,
  };
}

/**
 *  Registry order ids from a receipt's logs, in the registry's own (GTE, LTE) order.
 *
 *  The ids only surface through `PendingOrderCreated` — the create functions' return
 *  value is unreadable from a receipt — so this is the only way to learn what a
 *  placement created. `trader.placePerpStopOrder` calls it for you; it is exported for
 *  the build path, where the caller sends the transaction and so holds the only copy
 *  of the receipt.
 *
 *  Filters to `registry`'s own logs: another contract could emit a matching signature,
 *  and in a batched UserOp several contracts' logs share one receipt.
 *
 *  @param logs - The receipt's logs.
 *  @param registry - The PerpStopOrderRegistry the placement targeted.
 *  @returns The created ids, oldest first; empty if the receipt created none.
 *
 *  @example
 *  ```ts
 *  const { stopOrder } = await trader.buildPlacePerpStopOrder({
 *    registry, pool, isBid: false, quantity: 10_000_000n,
 *    triggerPrice: 90_000_000_000_000_000_000n, triggerOperator: 1, stopOrderType: 1,
 *    skipOperatorApproval: true,
 *  });
 *  const receipt = await myBatcher.send([stopOrder]);
 *  const [stopOrderId] = decodePerpStopOrderIds(receipt.logs, registry);
 *  ```
 */
export function decodePerpStopOrderIds(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  registry: Address,
): bigint[] {
  const created: bigint[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== registry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: TradeAbi.perpStopRegistryEventsAbi,
        data: log.data,
        topics: log.topics as [signature: Hex, ...args: Hex[]],
      });
      if (decoded.eventName === "PendingOrderCreated") created.push(decoded.args.orderId);
    } catch {
      // Not a registry event we model — skip.
    }
  }
  return created;
}

/**
 *  Place a perp take-profit / stop-loss, optionally as a linked pair, optionally
 *  opening.
 *
 *  The single create entry point. `intent` defaults to reduce-only, so a caller that
 *  passes neither `intent` nor `pair` gets exactly the order this SDK always
 *  described; the contract-level split between `createPendingOrder` and
 *  `createTriggerOrder` is an implementation detail resolved here.
 *
 *  Grants the registry's one-time operator approval first if the owner has not already
 *  (skip with `skipOperatorApproval`). That is not a convenience: without it the
 *  trigger reverts and the prepaid SOMI is consumed having placed nothing.
 */
export async function placePerpStopOrder(
  w: WriterCtx,
  p: PlacePerpStopOrderParams,
): Promise<PlacePerpStopOrderResult> {
  const intent = p.intent ?? "reduceOnly";
  const gas = p.gas ?? w.defaultGas;
  const somi = p.somiPayment ?? (await getPerpStopOrderSomiPayment(p.registry, w.publicClient));
  // Encoded (and validated) before the grant is sent, so bad input fails without
  // having moved anything on chain.
  const call = stopPlacementCall(w, p, { intent, somi, gas });

  if (p.skipOperatorApproval !== true) {
    const authorized = await w.publicClient.readContract({
      address: p.pool,
      abi: TradeAbi.operatorAuthorizationReadAbi,
      functionName: "isOperatorAuthorized",
      args: [w.fromAddress, p.registry, PLACE_ORDER_FOR_SELECTOR],
    });
    if (!authorized) await w.execute(operatorGrantCall(w, p, gas));
  }

  const result = await w.execute(call);
  // A pair emits two ids, in the registry's (GTE, LTE) order.
  const created = decodePerpStopOrderIds(result.receipt.logs, p.registry);

  if (p.pair == null) return { ...result, stopOrderId: created[0] };
  // Report the caller's own leg first, whichever operator it was.
  const selfIsGte = p.triggerOperator === 0;
  const [gteId, lteId] = created;
  const mine = selfIsGte ? gteId : lteId;
  const theirs = selfIsGte ? lteId : gteId;
  return { ...result, stopOrderId: mine, pairedStopOrderId: theirs };
}

/**
 *  Link two existing pending stops into a one-cancels-other pair.
 *
 *  Moves no SOMI. The pair constraints are the registry's and are enforced there:
 *  same owner, same side, opposite operators, straddling, both reduce-only.
 */
export async function linkPerpStopOrders(
  w: WriterCtx,
  p: LinkPerpStopOrdersParams,
): Promise<TxResult> {
  return w.execute({
    address: p.registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "linkPendingOrders",
    args: [BigInt(p.orderIdA), BigInt(p.orderIdB)],
    gas: p.gas ?? w.defaultGas,
  });
}

/**
 *  Cancel one pending perp stop and refund its SOMI.
 *
 *  If it is one leg of a linked pair, the OTHER leg stays armed and becomes unlinked —
 *  cancelling one order cancels one order. Use {@link cancelPerpStopOrders} to tear
 *  down both.
 */
export async function cancelPerpStopOrder(w: WriterCtx, p: CancelStopOrderParams): Promise<TxResult> {
  return w.execute(cancelOneCall(w, p));
}

/** Split out of {@link cancelPerpStopOrder} — see {@link stopPlacementCall}. */
function cancelOneCall(w: WriterCtx, p: CancelStopOrderParams): Writer.WriteCall {
  return {
    address: p.registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "cancelPendingOrder",
    args: [BigInt(p.orderId)],
    gas: p.gas ?? w.defaultGas,
  };
}

/**
 *  Cancel several pending perp stops in one transaction, refunded in a single
 *  transfer. The way to tear down a linked pair.
 *
 *  All-or-nothing: every id must be live and owned by the signer, so one stale id
 *  reverts the batch rather than silently skipping.
 */
export async function cancelPerpStopOrders(
  w: WriterCtx,
  p: CancelPerpStopOrdersParams,
): Promise<TxResult> {
  return w.execute(cancelManyCall(w, p));
}

/** Split out of {@link cancelPerpStopOrders} — see {@link stopPlacementCall}. */
function cancelManyCall(w: WriterCtx, p: CancelPerpStopOrdersParams): Writer.WriteCall {
  if (p.orderIds.length === 0) throw new InvalidInputError("orderIds must not be empty");
  return {
    address: p.registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "cancelPendingOrders",
    args: [p.orderIds.map((id) => BigInt(id))],
    gas: p.gas ?? w.defaultGas,
  };
}

// ---------------------------------------------------------------------------
// Build-only stop writes. Same inputs as the sending verbs, but they hand back
// the unsigned call instead of signing it — so a caller can put an order and its
// TP/SL into ONE transaction, which is the flow the sending verbs cannot express:
// sent separately, the order can fill and sit with no stop on it.
//
// Each shares its call construction with its sending twin above, so the calldata
// cannot drift from what `placePerpStopOrder` / `cancelPerpStopOrder(s)` send.
// ---------------------------------------------------------------------------

/**
 *  A perp stop placement expanded into the unsigned calls it actually takes.
 *
 *  Two or one, and the difference matters more here than for a token approval: the
 *  registry places on the owner's behalf, so without the operator grant the trigger
 *  reverts **and the prepaid SOMI is consumed having placed nothing**. Batch both.
 */
export interface UnsignedPerpStopOrder {
  /** The registry call that creates the stop — or, for a `pair`, both legs at once. */
  stopOrder: Writer.UnsignedCall;
  /**
   *  The one-time operator grant the trigger needs first; absent only when
   *  `skipOperatorApproval: true` was passed.
   */
  operatorApproval?: Writer.UnsignedCall;
}

/**
 *  Build a perp take-profit / stop-loss without sending it.
 *
 *  Takes exactly the parameters {@link placePerpStopOrder} takes and returns the
 *  unsigned calls instead of broadcasting them, so an order and the stop that
 *  protects it can go out as ONE transaction — an ERC-4337 UserOp, a Safe batch, a
 *  relayed multicall.
 *
 *  **Details**
 *
 *  `value` on the returned call carries the SOMI the trigger is prepaid with (twice
 *  it for a `pair` — one payment funds one trigger), and your batcher must forward it.
 *  Pass `somiPayment` to skip the registry read that resolves it.
 *
 *  **Gotchas**
 *
 *  - `operatorApproval` is returned whenever `skipOperatorApproval` is not `true`,
 *    **without** checking whether the grant is already in place — that check is an
 *    `eth_call`, which a build-only verb should not make. So it may be redundant,
 *    never short. Re-granting is a no-op on chain; pass `skipOperatorApproval: true`
 *    once you know the owner has it.
 *  - No ids come back: they only exist after the transaction you send. Recover them
 *    from your own receipt with {@link decodePerpStopOrderIds}.
 *  - Order matters. `operatorApproval` must execute before `stopOrder`.
 *
 *  @param p - The same inputs as {@link placePerpStopOrder}.
 *  @returns The stop-order call, and the operator grant unless skipped.
 *  @throws {@link InvalidInputError} on the same leg/pair violations the sending verb rejects.
 *  @throws {@link NotConfiguredError} when no operator registry is configured and the grant was not skipped.
 *
 *  @example
 *  A stop and its take-profit as ONE transaction, so neither leg can land alone.
 *  ```ts
 *  const { stopOrder, operatorApproval } = await trader.buildPlacePerpStopOrder({
 *    registry, pool, isBid: false, quantity: 10_000_000n,
 *    triggerPrice: 90_000_000_000_000_000_000n, triggerOperator: 1, stopOrderType: 1,
 *    pair: {
 *      isBid: false, quantity: 10_000_000n,
 *      triggerPrice: 120_000_000_000_000_000_000n, triggerOperator: 0, stopOrderType: 1,
 *    },
 *  });
 *  // The grant goes FIRST — without it the trigger reverts and the SOMI is spent anyway.
 *  const calls = operatorApproval ? [operatorApproval, stopOrder] : [stopOrder];
 *  const receipt = await myBatcher.send(calls);
 *  const [stopOrderId, pairedStopOrderId] = decodePerpStopOrderIds(receipt.logs, registry);
 *  ```
 */
export async function buildPlacePerpStopOrder(
  w: WriterCtx,
  p: PlacePerpStopOrderParams,
): Promise<UnsignedPerpStopOrder> {
  const intent = p.intent ?? "reduceOnly";
  const gas = p.gas ?? w.defaultGas;
  const somi = p.somiPayment ?? (await getPerpStopOrderSomiPayment(p.registry, w.publicClient));
  const stopOrder = Writer.toUnsigned(
    stopPlacementCall(w, p, { intent, somi, gas }),
    `Place ${p.pair != null ? "a linked TP/SL pair" : `a ${intent === "opening" ? "opening" : "reduce-only"} stop`} on perp registry ${p.registry}`,
  );
  if (p.skipOperatorApproval === true) return { stopOrder };
  return {
    stopOrder,
    operatorApproval: Writer.toUnsigned(
      operatorGrantCall(w, p, gas),
      `Approve perp stop registry ${p.registry} to place orders on pool ${p.pool}`,
    ),
  };
}

/**
 *  Build the cancel of one pending perp stop without sending it.
 *
 *  Same inputs and same single call as {@link cancelPerpStopOrder}; the SOMI refund
 *  is the registry's business either way. Cancelling one leg of a linked pair still
 *  leaves the other armed and unlinked — use {@link buildCancelPerpStopOrders} to
 *  tear down both in one call.
 *
 *  @param p - The same inputs as {@link cancelPerpStopOrder}.
 *  @returns The unsigned cancel call.
 *
 *  @example
 *  ```ts
 *  const cancel = trader.buildCancelPerpStopOrder({ registry, orderId: "42" });
 *  await myBatcher.send([cancel]);
 *  ```
 */
export function buildCancelPerpStopOrder(w: WriterCtx, p: CancelStopOrderParams): Writer.UnsignedCall {
  return Writer.toUnsigned(cancelOneCall(w, p), `Cancel perp stop order ${p.orderId} on registry ${p.registry}`);
}

/**
 *  Build the cancel of several pending perp stops without sending it.
 *
 *  All-or-nothing on chain, exactly as {@link cancelPerpStopOrders} is: every id must
 *  be live and owned by the signer, so one stale id reverts the whole call — and, in a
 *  batch, whatever you packed with it.
 *
 *  @param p - The same inputs as {@link cancelPerpStopOrders}.
 *  @returns The unsigned batch-cancel call.
 *  @throws {@link InvalidInputError} when `orderIds` is empty.
 *
 *  @example
 *  ```ts
 *  const cancelBoth = trader.buildCancelPerpStopOrders({ registry, orderIds: ["42", "43"] });
 *  await myBatcher.send([cancelBoth]);
 *  ```
 */
export function buildCancelPerpStopOrders(w: WriterCtx, p: CancelPerpStopOrdersParams): Writer.UnsignedCall {
  return Writer.toUnsigned(
    cancelManyCall(w, p),
    `Cancel ${p.orderIds.length} perp stop orders on registry ${p.registry}`,
  );
}

/**
 *  Claim the SOMI the registry owes the signer.
 *
 *  **When to use** — whenever {@link getUnclaimedPerpStopSomi} reports a non-zero
 *  balance. Two things credit it: a cancel whose direct SOMI refund FAILED (a contract
 *  owner with no payable receiver), and an operator winding the registry down, which
 *  credits every owner unconditionally — **EOAs included**. Do not skip the check on
 *  the assumption that an EOA is never owed anything.
 *
 *  **Details** — caller-scoped: it pays out the signer, never an arbitrary account.
 *  Read the balance first with {@link getUnclaimedPerpStopSomi}.
 *
 *  **Gotchas** — reverts `NothingToClaim` on a zero balance, so read first rather
 *  than claiming speculatively. The payout is a plain native transfer to the caller, so
 *  an owner that STILL cannot receive native reverts `WithdrawalFailed` and the balance
 *  stays put — this recovers funds for an owner whose receive capability changed, or
 *  for anyone credited by a registry wind-down, but it cannot rescue a permanently
 *  non-payable contract. Both errors decode by name — they are in the generated
 *  contract-error table — so a revert arrives as a named error rather than raw data.
 */
export async function claimPerpStopSomi(w: WriterCtx, p: ClaimPerpStopSomiParams): Promise<TxResult> {
  return w.execute({
    address: p.registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "claimSomi",
    args: [],
    gas: p.gas ?? w.defaultGas,
  });
}

/**
 *  SOMI the perp stop registry owes `account`, in wei.
 *
 *  **When to use** — before `trader.claimPerpStopSomi`, which reverts on a zero
 *  balance. Non-zero means the registry is holding SOMI for this account.
 *
 *  **Details** — an on-chain read, not indexed. Two things credit it: a cancel whose
 *  direct refund transfer failed (a contract owner with no payable receiver), and an
 *  operator winding the registry down, which credits every owner unconditionally.
 *  The second reaches **EOAs too**, so a non-zero balance is NOT diagnostic of a
 *  contract owner and an EOA is not safe to skip. The trigger path is the opposite:
 *  `somiPaid` is consumed on every fire and never refunded.
 */
export async function getUnclaimedPerpStopSomi(
  ref: { registry: Address; account: Address },
  client: PublicClient,
): Promise<bigint> {
  return client.readContract({
    address: ref.registry,
    abi: TradeAbi.perpStopRegistryWriteAbi,
    functionName: "unclaimedSomi",
    args: [ref.account],
  });
}
