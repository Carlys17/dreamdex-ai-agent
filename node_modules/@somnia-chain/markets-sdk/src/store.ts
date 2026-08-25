// Reactive in-memory store for the locally-materialized order-book state —
// spot AND binary markets, one store.
//
// Holds the entities the live tail keeps current (markets, fills, orders) in the
// same string-field shape the indexer's Hasura serves, so components consume live
// and snapshot rows interchangeably. Markets are the same discriminated
// `Market = SpotMarket | BinaryMarket` union the one-shot reads return. Exposes a
// `useSyncExternalStore`-friendly contract: a monotonic version, subscribe(), and
// `select()` which memoizes derived snapshots by version so getSnapshot returns a
// stable reference between mutations (required to avoid React render loops).
//
// This file is framework-agnostic (no React import). The reducer (reducer.ts) is
// the client mirror of the indexer's shared OrderBook core
// (indexer/src/handlers/orderbook.ts, dispatched per pool type by binary.ts /
// spot.ts) — keep the two in lockstep.

import type { Address } from "viem";
import type { BinaryMarket, Market } from "./markets.js";

/**
 *  Data-source mode of the live tail: `"init"` until the first watch has hydrated,
 *  `"tailing"` once the store is fed by the chain event stream.
 */
export type TailMode = "init" | "tailing";

// Naming: `Binary*` = binary-market-specific (YES/NO outcomes); unprefixed =
// shared by spot + binary. A binary market is a CLOB, but so is a spot market —
// so "Clob" was never the right discriminator. See markets.ts `Market`.

/** A side on a binary book: buy/sell the YES or NO outcome token. */
export type BinarySide = "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO";
/** How a binary fill settled: direct outcome trade, or a mint/burn of a YES+NO pair. */
export type BinaryFillKind = "DIRECT_YES" | "DIRECT_NO" | "MINT_A_PAIR" | "BURN_A_PAIR";
/**
 *  Order lifecycle — shared by spot and binary orders. Spot orders are born
 *  "Closed" and promoted to "Open" by OrderRested (mirror of the indexer).
 */
export type OrderStatus = "Open" | "Closed" | "Filled" | "Cancelled" | "Expired";
/**
 *  Binary-market lifecycle (mirror of the indexer's `ClobMarketStatus` enum).
 *  The first six mirror the on-chain `MarketStatus` enum; `"Finalized"` is an
 *  INDEXER-DERIVED terminal state (no on-chain enum member) set when the
 *  market's backing + resolution snapshot are swept to the BinarySettlement
 *  singleton — it supersedes Resolved/Voided once finalize lands, and
 *  redemptions are served by settlement thereafter.
 */
export type BinaryMarketStatus =
  | "Listed"
  | "Trading"
  | "Locked"
  | "Settling"
  | "Resolved"
  | "Voided"
  | "Finalized";

/**
 *  Index → status for the on-chain MarketStatus enum (StatusChanged events).
 *  Deliberately EXCLUDES "Finalized": no StatusChanged ever carries it — the
 *  reducer derives it from the module/settlement MarketFinalized events.
 */
export const BINARY_MARKET_STATUS: readonly BinaryMarketStatus[] = [
  "Listed",
  "Trading",
  "Locked",
  "Settling",
  "Resolved",
  "Voided",
];

/**
 *  Live-tail health snapshot — how current the store's `getLive*` reads are:
 *  block coverage (snapshot/last/head), socket state, and active watch count.
 */
export interface TailStatus {
  /** Current data-source mode ("init" until the first watch is hydrated). */
  mode: TailMode;
  /**
   *  Block the most recent indexer snapshot was consistent to (a watch's seam
   *  covers snapshotBlock+1..)
   */
  snapshotBlock: number;
  /** Highest block the local tail has materialized */
  lastBlock: number;
  /** Latest chain head observed over the WS */
  headBlock: number;
  /** Whether the chain WS subscriptions are currently delivering */
  wsConnected: boolean;
  /**
   *  Active market watches (pools currently subscribed, incl. an all-markets
   *  watch's set). 0 → the tail is idle and no socket is held for it.
   */
  watchCount: number;
}

/**
 *  The live market shape IS the read-surface market union — spot and binary rows
 *  materialize into the exact shape `client.listMarkets` serves.
 */
export type LiveMarket = Market;

/** One executed fill (mirror of indexer Fill, plus the resolved pool address). */
/**
 *  A funding settlement observed by the live tail, shaped to splice onto the indexed
 *  `FundingRateUpdate` series.
 *
 *  Deliberately NOT the full indexed row. The tail sees only what `FundingUpdated`
 *  carries, and two of the indexed fields are DERIVED from state the tail does not have:
 *  `intervalsAccrued` needs `n` from the funding-parameters epoch series, and the covered
 *  span needs the settlement anchor. Rather than guess them, they are absent here and
 *  arrive with the indexed row a moment later.
 */
export interface LiveFundingUpdate {
  /** `${pool}_${blockNumber}_${logIndex}` — matches the indexer FundingRateUpdate id. */
  id: string;
  /** Perp pool (lowercased). */
  pool: string;
  /** Per-CALCULATION-WINDOW rate, 1e18-scaled, signed. Normalize with `fundingWindowSec`. */
  fundingRate: string;
  /** Cumulative index AFTER this settlement (1e18 x quote per whole base, signed). */
  cumulativeFundingPerUnit: string;
  indexPrice: string;
  /** Null when the event's 0 sentinel fired for a stale mark feed. */
  markPrice: string | null;
  /** UNCLAMPED interval span, as emitted. Accrual is capped at n = window / interval. */
  intervalsSettled: string;
  /** Params as last known for the market; null before the first indexed funding row. */
  fundingWindowSec: number | null;
  fundingIntervalSec: number | null;
  timestamp: string;
  blockNumber: string;
  /** Log index within the block — with blockNumber, the settlement's position in the series. */
  logIndex: number;
}

export interface LiveFill {
  /** `${blockNumber}_${logIndex}` — matches the indexer Fill id */
  id: string;
  /** Id of the market the fill executed in (Hasura FK naming; joins {@link LiveMarket}). */
  market_id: string;
  /** lowercased pool address (the log source) */
  pool: Address;
  /**
   *  Taker info is unresolved at OrderFilled emission time (the taker's
   *  OrderPlaced fires AFTER the fill in the same tx). Resolved via the
   *  takerOrder_id foreign key — enrichFill back-joins to LiveOrder.
   */
  taker: Address | undefined;
  /**
   *  Maker's address. Undefined until the maker's resting order is known — set when it
   *  was witnessed live, else back-joined from the order row via `makerOrder_id`.
   */
  maker: Address | undefined;
  /**
   *  Taker's outcome side. Undefined on spot fills, and on binary fills until the
   *  taker order is joined (see `taker`).
   */
  takerSide: BinarySide | undefined;
  /**
   *  Maker's outcome side. Undefined on spot fills, and until the maker order is
   *  joined (see `maker`).
   */
  makerSide: BinarySide | undefined;
  /**
   *  How the fill settled (see {@link BinaryFillKind}). Undefined on spot fills, and
   *  on binary fills until BOTH sides are joined (classification needs both).
   */
  kind: BinaryFillKind | undefined;
  /**
   *  True when the taker bought the base/YES (the maker was the ask) — the
   *  tape's aggressor direction, valid on every market kind. Seeded from the
   *  indexer row on snapshot fills; on live fills derived at OrderFilled from
   *  the maker's resting side (undefined only when the maker order was never
   *  witnessed, until enrichFill joins the taker's OrderPlaced).
   */
  takerIsBid: boolean | undefined;
  /** Foreign keys to LiveOrder rows for join-side recovery. */
  takerOrder_id: string;
  /** Maker-side counterpart of `takerOrder_id` (a {@link LiveOrder} key). */
  makerOrder_id: string;
  /** Raw quote/collateral units per whole base/outcome token. */
  fillPrice: string;
  /**
   *  Base/outcome tokens exchanged — raw units scaled by the market's `baseDecimals`
   *  (decimal string).
   */
  quantity: string;
  /** quote value = quantity * fillPrice / 10^baseDecimals */
  quoteQuantity: string;
  /** Taker order's unfilled size after this fill — raw base/outcome units (decimal string). */
  takerRemainingQuantity: string;
  /** Maker order's unfilled size after this fill — raw base/outcome units (decimal string). */
  makerRemainingQuantity: string;
  /** Block timestamp of the fill — unix seconds (decimal string). */
  timestamp: string;
  /** Block the fill landed in. */
  blockNumber: number;
  /** Log index within the block — with `blockNumber`, the fill's tape position. */
  logIndex: number;
  /** Transaction that produced the fill. */
  txHash: string;
}

/** A resting/closed order (mirror of indexer Order). */
export interface LiveOrder {
  /** `${pool}_${orderId}` */
  id: string;
  /**
   *  Id of the market the order was placed in. Pools are RECYCLED across markets
   *  (never concurrently), so book reads filter on this, not the pool alone.
   */
  market_id: string;
  /** Lowercased pool address hosting the order's book. */
  pool: Address;
  /** On-chain order id, unique per pool (decimal string). */
  orderId: string;
  /** Order owner's address (as emitted — compare case-insensitively). */
  owner: Address;
  /** Binary outcome side. Undefined on spot orders (spot has no YES/NO). */
  side: BinarySide | undefined;
  /**
   *  Which side of the book's NATIVE terms the order rests on: true = bid.
   *  Native terms are YES terms for binary, quote-per-base for spot.
   */
  isBid: boolean;
  /**
   *  Opaque caller bookkeeping from OrderPlaced, carried verbatim (uint256 decimal
   *  string) — never decoded; v2 takes the side from `BinaryOrderPlaced.kind` instead.
   */
  userData: string;
  /**
   *  Limit price in the book's native terms — raw quote/collateral units per whole
   *  base/outcome token (decimal string).
   */
  price: string;
  /** Original size at placement — raw base/outcome units (decimal string). */
  fullQuantity: string;
  /** Unfilled size still resting — raw base/outcome units (decimal string). */
  quantityRemaining: string;
  /** Cumulative size filled so far — raw base/outcome units (decimal string). */
  filledQuantity: string;
  /**
   *  Order expiry as a uint64 nanosecond timestamp (decimal string). GTC orders
   *  carry type(uint64).max, so they never expire; the matcher rejects a 0/past
   *  expiry at placement, so a resting order always has a real future ns value.
   */
  expireTimestampNs: string;
  /** Lifecycle state (see {@link OrderStatus}). */
  status: OrderStatus;
  /**
   *  True once OrderRested landed — the order is ON the book. Only rested open
   *  orders count toward the materialized book levels.
   */
  rested: boolean;
  /** Placement block timestamp — unix seconds (decimal string). */
  createdAt: string;
  /** Transaction that placed the order. */
  txHash: string;
}

/** One aggregated price level of a resting book (raw units). */
export interface BookLevel {
  /**
   *  Level price — raw quote/collateral units per whole base/outcome token, in the
   *  book's native terms (YES terms for binary, quote-per-base for spot).
   */
  price: bigint;
  /** Total resting size at this price — raw base/outcome units. */
  quantity: bigint;
}

/**
 *  Fallback outcome-token / collateral decimals (tUSDC 6dp demo stack). Real
 *  math uses the per-market baseDecimals/quoteDecimals off the Market row.
 */
export const DECIMALS = 6;

/** Recent fills retained per pool (bounds memory; older ones age out). */
const MAX_FILLS_PER_POOL = 400;

/**
 *  Recent funding updates retained per pool.
 *
 *  Higher than the fills cap because the series is the point: 500 covers ~41h at the 300s
 *  testnet cadence, which is more than any chart window the tail is asked to extend, and a
 *  funding row is small. It exists at all because `fundingUpdatesFor` scans and sorts the
 *  whole map on every recompute — unbounded growth costs CPU on each tail event, not just
 *  memory.
 */
const MAX_FUNDING_PER_POOL = 500;

/**
 *  Index → BinarySide for the on-chain `OrderKind` enum carried by the
 *  `BinaryOrderPlaced` event (settlement-extraction v2): 0 BUY_YES, 1 SELL_YES,
 *  2 BUY_NO, 3 SELL_NO. This is the ONLY authoritative side-attribution source —
 *  v2 no longer encodes the side in `userData` (now opaque MM bookkeeping).
 */
export const ORDER_KIND_SIDE: readonly BinarySide[] = ["BUY_YES", "SELL_YES", "BUY_NO", "SELL_NO"];

/**
 *  Map an on-chain `OrderKind` index (from `BinaryOrderPlaced.kind`) to a
 *  {@link BinarySide}. Replaces the v1 `(isBid, userData)` decode — the pool now
 *  states the kind explicitly, so the SDK/indexer join the `BinaryOrderPlaced`
 *  event (by orderId) instead of inferring the side from userData.
 */
export function sideOfKind(kind: number | bigint): BinarySide {
  return ORDER_KIND_SIDE[Number(kind)] ?? "BUY_YES";
}

/**
 *  Classify a binary fill from its two sides: opposite trades on ONE outcome are
 *  direct (`DIRECT_YES`/`DIRECT_NO`); two buys mint a YES+NO pair from collateral,
 *  two sells burn one back. Mirror of the indexer's `fillKind`
 *  (BinaryPool._isPair matrix — keep in lockstep).
 *  @param takerSide - The taker's {@link BinarySide}.
 *  @param makerSide - The maker's {@link BinarySide}.
 */
export function fillKind(takerSide: BinarySide, makerSide: BinarySide): BinaryFillKind {
  if (
    (takerSide === "BUY_YES" && makerSide === "SELL_YES") ||
    (takerSide === "SELL_YES" && makerSide === "BUY_YES")
  )
    return "DIRECT_YES";
  if (
    (takerSide === "BUY_NO" && makerSide === "SELL_NO") ||
    (takerSide === "SELL_NO" && makerSide === "BUY_NO")
  )
    return "DIRECT_NO";
  if (
    (takerSide === "BUY_YES" && makerSide === "BUY_NO") ||
    (takerSide === "BUY_NO" && makerSide === "BUY_YES")
  )
    return "MINT_A_PAIR";
  if (
    (takerSide === "SELL_YES" && makerSide === "SELL_NO") ||
    (takerSide === "SELL_NO" && makerSide === "SELL_YES")
  )
    return "BURN_A_PAIR";
  return "DIRECT_YES"; // defensive — should never hit
}

export function orderKey(pool: Address, orderId: bigint | string): string {
  return `${pool.toLowerCase()}_${orderId}`;
}

export function fillKey(blockNumber: number | bigint, logIndex: number): string {
  return `${blockNumber}_${logIndex}`;
}

/**
 *  True once wall-clock `nowNs` has passed a resting order's `expireTimestampNs`
 *  — the client-side mirror of OrderBook.getBookLevels' `now > expiry` skip.
 *  On-chain expiry is lazy (an expired maker keeps resting with no OrderExpired
 *  event), so an event-sourced book must apply this cutoff itself. `0` is treated
 *  as "no expiry" defensively — it can never be a resting value (the matcher
 *  rejects a 0/past expiry at placement); GTC carries type(uint64).max.
 */
export function isExpired(expireTimestampNs: string, nowNs: bigint): boolean {
  const exp = BigInt(expireTimestampNs);
  return exp !== 0n && nowNs > exp;
}

export class MaterializerStore {
  readonly markets = new Map<string, LiveMarket>();
  readonly fills = new Map<string, LiveFill>();
  readonly orders = new Map<string, LiveOrder>();
  /**
   *  `${blockNumber}_${logIndex}` -> funding update, appended by the live tail.
   *
   *  Separate from `markets` because a funding CHART needs the series, not just the
   *  latest value the market row carries. Keyed on (block, logIndex) rather than
   *  appended to a list so a reorg replay overwrites instead of duplicating — the same
   *  dedup the tail already applies to fills and orders.
   */
  readonly fundingUpdates = new Map<string, LiveFundingUpdate>();
  /**
   *  pool (lowercase) -> market id — the pool's CURRENT market binding, so the
   *  reducer can route a pool log to its market. Settlement-extraction v2: this
   *  binding is TIME-VARYING (a recycled pool serves successive markets, never
   *  concurrently) — `MarketCreated` opens/re-points it, `PoolReleased` closes it.
   */
  readonly poolToMarket = new Map<string, string>();
  /** BinaryMarket address (lowercase) -> market id (binary markets only) */
  readonly addressToMarket = new Map<string, string>();
  /**
   *  orderKey -> BinarySide recorded from `BinaryOrderPlaced` before/after its
   *  paired base `OrderPlaced` lands (intra-tx order not guaranteed). The v2 side
   *  source — consumed (deleted) once the order row carries the side.
   */
  readonly pendingKinds = new Map<string, BinarySide>();

  status: TailStatus = {
    mode: "init",
    snapshotBlock: 0,
    lastBlock: 0,
    headBlock: 0,
    wsConnected: false,
    watchCount: 0,
  };

  private version = 0;
  private listeners = new Set<() => void>();
  private cache = new Map<string, { v: number; val: unknown }>();

  getVersion(): number {
    return this.version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Bump version and notify subscribers. Call once per processed block / status change. */
  commit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  setStatus(patch: Partial<TailStatus>): void {
    this.status = { ...this.status, ...patch };
    this.commit();
  }

  /** Memoized derived snapshot — stable reference while version is unchanged. */
  select<T>(key: string, compute: () => T): T {
    const hit = this.cache.get(key);
    if (hit && hit.v === this.version) return hit.val as T;
    const val = compute();
    this.cache.set(key, { v: this.version, val });
    return val;
  }

  /**
   * Merge a snapshot's rows into the store (upsert by key; does not commit).
   *
   *  Watches are per-scope, so hydration must NOT clear other scopes' state —
   *  watching market B leaves market A's rows untouched. A row the store
   *  already holds is overwritten by the incoming snapshot row (the indexer is
   *  at least as current for anything at/below the seam block), EXCEPT that a
   *  locally-witnessed OPEN order missing from the snapshot is kept: the live
   *  reducer put it there from a real on-chain OrderPlaced the indexer just
   *  hasn't surfaced yet (e.g. an order placed seconds ago), and blanking it
   *  would flicker it out of "open orders". Events past the seam are replayed
   *  by the watch's backfill either way.
   */
  mergeSnapshot(input: { markets: LiveMarket[]; fills: LiveFill[]; orders: LiveOrder[] }): void {
    for (const m of input.markets) this.indexMarket(m);
    for (const f of input.fills) this.fills.set(f.id, f);
    for (const o of input.orders) this.orders.set(orderKey(o.pool, o.orderId), o);
    this.prunePerPool();
  }

  /**
   *  Drop one pool's fills + orders + funding rows (a watch was released). The market row
   *  is kept — it's a few hundred bytes of metadata and keeps `getLiveMarkets` stable for
   *  list views.
   */
  purgePool(pool: string): void {
    const p = pool.toLowerCase();
    for (const [id, f] of this.fills) if (f.pool === p) this.fills.delete(id);
    for (const [id, o] of this.orders) if (o.pool === p) this.orders.delete(id);
    for (const [id, u] of this.fundingUpdates) if (u.pool === p) this.fundingUpdates.delete(id);
  }

  /** Register a market + its reverse lookups. */
  indexMarket(m: LiveMarket): void {
    this.markets.set(m.id, m);
    this.poolToMarket.set(m.poolAddress.toLowerCase(), m.id);
    if (m.marketType === "BINARY") this.addressToMarket.set(m.marketAddress.toLowerCase(), m.id);
  }

  /** Keep only the most recent MAX_FILLS_PER_POOL fills and MAX_FUNDING_PER_POOL funding rows per pool. */
  prunePerPool(): void {
    const byPool = new Map<string, LiveFill[]>();
    for (const f of this.fills.values()) {
      const arr = byPool.get(f.pool) ?? [];
      arr.push(f);
      byPool.set(f.pool, arr);
    }
    for (const arr of byPool.values()) {
      if (arr.length <= MAX_FILLS_PER_POOL) continue;
      arr.sort(cmpFillDesc);
      for (const f of arr.slice(MAX_FILLS_PER_POOL)) this.fills.delete(f.id);
    }

    // Same treatment for the funding series, which previously had no ceiling at all: a
    // long-lived session accumulated every settlement for its whole lifetime, and
    // `fundingUpdatesFor` re-scans and re-sorts the map on each commit, so the per-event
    // cost grew with it.
    const fundingByPool = new Map<string, LiveFundingUpdate[]>();
    for (const u of this.fundingUpdates.values()) {
      const arr = fundingByPool.get(u.pool) ?? [];
      arr.push(u);
      fundingByPool.set(u.pool, arr);
    }
    for (const arr of fundingByPool.values()) {
      if (arr.length <= MAX_FUNDING_PER_POOL) continue;
      arr.sort(cmpFundingDesc);
      for (const u of arr.slice(MAX_FUNDING_PER_POOL)) this.fundingUpdates.delete(u.id);
    }
  }

  // ---- selectors (return Hasura-compatible row shapes) ----

  /**
   *  Resolve a fill's maker/taker owner + side from the order join. Live fills
   *  carry these as undefined (taker isn't known at OrderFilled time; maker is
   *  only filled when its resting order was witnessed live), so we back-join to
   *  the order book — populated from the snapshot's open-orders + live events.
   */
  private enrichFill(f: LiveFill): LiveFill {
    if (f.maker && f.makerSide && f.taker && f.takerSide && f.kind && f.takerIsBid !== undefined) return f;
    const mo = this.orders.get(f.makerOrder_id);
    const to = this.orders.get(f.takerOrder_id);
    if (!mo && !to) return f;
    const makerSide = f.makerSide ?? mo?.side;
    const takerSide = f.takerSide ?? to?.side;
    return {
      ...f,
      maker: f.maker ?? mo?.owner,
      makerSide,
      taker: f.taker ?? to?.owner,
      takerSide,
      // The taker's book direction — the tape's aggressor side on spot, where
      // there is no YES/NO takerSide to derive it from.
      takerIsBid: f.takerIsBid ?? to?.isBid,
      // Mirror the indexer's PendingTakerFill back-fill: classify the fill once
      // both binary sides are known (fillKind needs both). Spot fills have no
      // side → kind stays undefined. Without this, live fills carried
      // kind=undefined forever while snapshot fills had a real kind.
      kind: f.kind ?? (makerSide && takerSide ? fillKind(takerSide, makerSide) : undefined),
    };
  }

  recentFills(pool: string, limit: number): LiveFill[] {
    const p = pool.toLowerCase();
    return this.select(`fills:${p}:${limit}`, () =>
      [...this.fills.values()]
        .filter((f) => f.pool === p)
        .sort(cmpFillDesc)
        .slice(0, limit)
        .map((f) => this.enrichFill(f)),
    );
  }

  userFills(pool: string | null, user: string, limit: number): LiveFill[] {
    const u = user.toLowerCase();
    const p = pool?.toLowerCase() ?? null;
    return this.select(`ufills:${p ?? "*"}:${u}:${limit}`, () =>
      [...this.fills.values()]
        .filter(
          (f) =>
            (p === null || f.pool === p) &&
            // Maker is denormalized; taker is usually unresolved on the fill, so
            // also match via the takerOrder → order owner join.
            (f.maker?.toLowerCase() === u ||
              f.taker?.toLowerCase() === u ||
              this.orders.get(f.takerOrder_id)?.owner.toLowerCase() === u),
        )
        .sort(cmpFillDesc)
        .slice(0, limit)
        .map((f) => this.enrichFill(f)),
    );
  }

  /**
   *  Funding settlements the tail has seen for a pool, OLDEST FIRST (chart order).
   *
   *  The tail's counterpart to the indexed `FundingRateUpdate` series: splice these onto
   *  the tail of a one-shot query to extend a chart past the snapshot block, rather than
   *  only overwriting the market row's latest value.
   *
   *  Oldest-first here, unlike `recentFills` — a funding chart consumes a series in time
   *  order, whereas a trade tape wants newest-first.
   *
   *  Two rows on this list carry less than their indexed equivalents, and deliberately:
   *  `intervalsAccrued` needs `n` from the parameter-epoch series and the covered span
   *  needs the settlement anchor, neither of which the tail has. They arrive with the
   *  indexed row a moment later rather than being guessed at here.
   */
  fundingUpdatesFor(pool: string, limit = 500): LiveFundingUpdate[] {
    const p = pool.toLowerCase();
    return this.select(`funding:${p}:${limit}`, () =>
      [...this.fundingUpdates.values()]
        .filter((f) => f.pool === p)
        // Sort by (block, logIndex) NUMERICALLY, not by timestamp and not by id string.
        //
        // Not timestamp: several settlements can share a block timestamp, leaving the order
        // undefined. Not the id: it ends with an unpadded logIndex, so `localeCompare` puts
        // `..._10` before `..._2` and silently scrambles a same-block run — which is why
        // logIndex is carried as a number rather than parsed back out of the id.
        .sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? a.logIndex - b.logIndex
            : Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)),
        )
        .slice(-limit),
    );
  }

  /** All known markets (memoized — stable reference between mutations). */
  allMarkets(): LiveMarket[] {
    return this.select("markets:all", () => [...this.markets.values()]);
  }

  marketByPool(pool: string): LiveMarket | null {
    const id = this.poolToMarket.get(pool.toLowerCase());
    return this.select(`mpool:${pool.toLowerCase()}`, () => (id ? this.markets.get(id) ?? null : null));
  }

  /** Only binary markets have a BinaryMarket contract address. */
  marketByAddress(addr: string): BinaryMarket | null {
    const id = this.addressToMarket.get(addr.toLowerCase());
    return this.select(`maddr:${addr.toLowerCase()}`, () => {
      const m = id ? this.markets.get(id) : undefined;
      return m && m.marketType === "BINARY" ? m : null;
    });
  }

  userOrders(pool: string, user: string, limit: number): LiveOrder[] {
    const p = pool.toLowerCase();
    const u = user.toLowerCase();
    return this.select(`uorders:${p}:${u}:${limit}`, () =>
      [...this.orders.values()]
        .filter((o) => o.pool === p && o.owner.toLowerCase() === u)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
        .slice(0, limit),
    );
  }

  /**
   *  The locally-materialized RESTING book for a pool, aggregated by price level
   *  — the zero-round-trip mirror of the on-chain `getBookLevels`. Prices are in
   *  the book's native terms (YES terms for binary, quote-per-base for spot).
   *  Only orders witnessed as rested and still open count, matching the chain.
   */
  bookLevels(pool: string, depth: number): { bids: BookLevel[]; asks: BookLevel[] } {
    const p = pool.toLowerCase();
    // The pool's CURRENT market binding. A BinaryPool is RECYCLED across markets
    // (settlement-extraction v2: one pool serves successive markets, never
    // concurrently). Orders are stamped with `market_id` at placement, so we can
    // require the order's market to equal the pool's current market STRUCTURALLY
    // — rather than relying on the (robust but implicit) fact that a prior
    // market's orders are all past-expiry by the time the pool recycles. If the
    // pool has no current binding (released, not yet re-created), there is no
    // live book → return empty.
    const currentMarketId = this.marketByPool(p)?.id;
    return this.select(`book:${p}:${depth}`, () => {
      if (currentMarketId == null) return { bids: [], asks: [] };
      // Mirror the on-chain getBookLevels view, which skips any resting order
      // with `now > expireTimestampNs`. On-chain expiry is LAZY — the matching
      // engine walks past an expired maker without evicting it or emitting
      // OrderExpired (anti-griefing, F-2026-16202) — so an event-sourced book
      // never receives a removal event and must apply the wall-clock cutoff
      // itself, or it shows dead liquidity. `now` is read fresh here; this
      // select() is keyed on the store version, which onHead bumps every block,
      // so the book re-derives (and expired levels drop) at block cadence.
      const nowNs = BigInt(Math.floor(Date.now() / 1000)) * 1_000_000_000n;
      const bids = new Map<string, bigint>();
      const asks = new Map<string, bigint>();
      for (const o of this.orders.values()) {
        if (o.pool !== p || o.market_id !== currentMarketId || o.status !== "Open" || !o.rested) continue;
        if (isExpired(o.expireTimestampNs, nowNs)) continue;
        const qty = BigInt(o.quantityRemaining);
        if (qty <= 0n) continue;
        const side = o.isBid ? bids : asks;
        side.set(o.price, (side.get(o.price) ?? 0n) + qty);
      }
      const toLevels = (m: Map<string, bigint>, bestFirst: (a: bigint, b: bigint) => number): BookLevel[] =>
        [...m.entries()]
          .map(([price, quantity]) => ({ price: BigInt(price), quantity }))
          .sort((a, b) => bestFirst(a.price, b.price))
          .slice(0, depth);
      return {
        bids: toLevels(bids, (a, b) => (a === b ? 0 : a > b ? -1 : 1)), // highest first
        asks: toLevels(asks, (a, b) => (a === b ? 0 : a < b ? -1 : 1)), // lowest first
      };
    });
  }

  /**
   *  Resting book for a market resolved by its `marketId` (recycle-safe). A
   *  BinaryPool is reused across markets, so this resolves the market's pool and
   *  GUARDS that the pool's CURRENT binding is still this market — if `marketId`
   *  is stale (the pool moved on to a newer market), returns `null` so a stale
   *  page renders nothing rather than the successor market's liquidity.
   */
  bookLevelsByMarket(marketId: string, depth: number): { bids: BookLevel[]; asks: BookLevel[] } | null {
    const id = marketId.toLowerCase();
    const pool = this.markets.get(id)?.poolAddress?.toLowerCase();
    if (!pool || this.poolToMarket.get(pool) !== id) return null;
    return this.bookLevels(pool, depth);
  }

  getStatus(): TailStatus {
    return this.select("status", () => this.status);
  }
}

/** Newest-first: by timestamp, then logIndex (matches the indexer's tape ordering). */
function cmpFillDesc(a: LiveFill, b: LiveFill): number {
  const dt = Number(b.timestamp) - Number(a.timestamp);
  return dt !== 0 ? dt : b.logIndex - a.logIndex;
}

/**
 *  Newest-first by (block, logIndex) — the reverse of what `fundingUpdatesFor` serves, and
 *  keyed the same way for the same reason: several settlements can share a block timestamp,
 *  so ordering on the timestamp leaves a same-block run undefined. Used only to decide
 *  which rows the per-pool cap drops.
 */
function cmpFundingDesc(a: LiveFundingUpdate, b: LiveFundingUpdate): number {
  if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
  return Number(BigInt(b.blockNumber) - BigInt(a.blockNumber));
}
