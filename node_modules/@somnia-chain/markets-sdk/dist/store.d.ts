import type { Address } from "viem";
import type { BinaryMarket, Market } from "./markets.js";
/**
 *  Data-source mode of the live tail: `"init"` until the first watch has hydrated,
 *  `"tailing"` once the store is fed by the chain event stream.
 */
export type TailMode = "init" | "tailing";
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
export type BinaryMarketStatus = "Listed" | "Trading" | "Locked" | "Settling" | "Resolved" | "Voided" | "Finalized";
/**
 *  Index → status for the on-chain MarketStatus enum (StatusChanged events).
 *  Deliberately EXCLUDES "Finalized": no StatusChanged ever carries it — the
 *  reducer derives it from the module/settlement MarketFinalized events.
 */
export declare const BINARY_MARKET_STATUS: readonly BinaryMarketStatus[];
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
export declare const DECIMALS = 6;
/**
 *  Index → BinarySide for the on-chain `OrderKind` enum carried by the
 *  `BinaryOrderPlaced` event (settlement-extraction v2): 0 BUY_YES, 1 SELL_YES,
 *  2 BUY_NO, 3 SELL_NO. This is the ONLY authoritative side-attribution source —
 *  v2 no longer encodes the side in `userData` (now opaque MM bookkeeping).
 */
export declare const ORDER_KIND_SIDE: readonly BinarySide[];
/**
 *  Map an on-chain `OrderKind` index (from `BinaryOrderPlaced.kind`) to a
 *  {@link BinarySide}. Replaces the v1 `(isBid, userData)` decode — the pool now
 *  states the kind explicitly, so the SDK/indexer join the `BinaryOrderPlaced`
 *  event (by orderId) instead of inferring the side from userData.
 */
export declare function sideOfKind(kind: number | bigint): BinarySide;
/**
 *  Classify a binary fill from its two sides: opposite trades on ONE outcome are
 *  direct (`DIRECT_YES`/`DIRECT_NO`); two buys mint a YES+NO pair from collateral,
 *  two sells burn one back. Mirror of the indexer's `fillKind`
 *  (BinaryPool._isPair matrix — keep in lockstep).
 *  @param takerSide - The taker's {@link BinarySide}.
 *  @param makerSide - The maker's {@link BinarySide}.
 */
export declare function fillKind(takerSide: BinarySide, makerSide: BinarySide): BinaryFillKind;
export declare function orderKey(pool: Address, orderId: bigint | string): string;
export declare function fillKey(blockNumber: number | bigint, logIndex: number): string;
/**
 *  True once wall-clock `nowNs` has passed a resting order's `expireTimestampNs`
 *  — the client-side mirror of OrderBook.getBookLevels' `now > expiry` skip.
 *  On-chain expiry is lazy (an expired maker keeps resting with no OrderExpired
 *  event), so an event-sourced book must apply this cutoff itself. `0` is treated
 *  as "no expiry" defensively — it can never be a resting value (the matcher
 *  rejects a 0/past expiry at placement); GTC carries type(uint64).max.
 */
export declare function isExpired(expireTimestampNs: string, nowNs: bigint): boolean;
export declare class MaterializerStore {
    readonly markets: Map<string, Market>;
    readonly fills: Map<string, LiveFill>;
    readonly orders: Map<string, LiveOrder>;
    /**
     *  `${blockNumber}_${logIndex}` -> funding update, appended by the live tail.
     *
     *  Separate from `markets` because a funding CHART needs the series, not just the
     *  latest value the market row carries. Keyed on (block, logIndex) rather than
     *  appended to a list so a reorg replay overwrites instead of duplicating — the same
     *  dedup the tail already applies to fills and orders.
     */
    readonly fundingUpdates: Map<string, LiveFundingUpdate>;
    /**
     *  pool (lowercase) -> market id — the pool's CURRENT market binding, so the
     *  reducer can route a pool log to its market. Settlement-extraction v2: this
     *  binding is TIME-VARYING (a recycled pool serves successive markets, never
     *  concurrently) — `MarketCreated` opens/re-points it, `PoolReleased` closes it.
     */
    readonly poolToMarket: Map<string, string>;
    /** BinaryMarket address (lowercase) -> market id (binary markets only) */
    readonly addressToMarket: Map<string, string>;
    /**
     *  orderKey -> BinarySide recorded from `BinaryOrderPlaced` before/after its
     *  paired base `OrderPlaced` lands (intra-tx order not guaranteed). The v2 side
     *  source — consumed (deleted) once the order row carries the side.
     */
    readonly pendingKinds: Map<string, BinarySide>;
    status: TailStatus;
    private version;
    private listeners;
    private cache;
    getVersion(): number;
    subscribe: (listener: () => void) => (() => void);
    /** Bump version and notify subscribers. Call once per processed block / status change. */
    commit(): void;
    setStatus(patch: Partial<TailStatus>): void;
    /** Memoized derived snapshot — stable reference while version is unchanged. */
    select<T>(key: string, compute: () => T): T;
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
    mergeSnapshot(input: {
        markets: LiveMarket[];
        fills: LiveFill[];
        orders: LiveOrder[];
    }): void;
    /**
     *  Drop one pool's fills + orders + funding rows (a watch was released). The market row
     *  is kept — it's a few hundred bytes of metadata and keeps `getLiveMarkets` stable for
     *  list views.
     */
    purgePool(pool: string): void;
    /** Register a market + its reverse lookups. */
    indexMarket(m: LiveMarket): void;
    /** Keep only the most recent MAX_FILLS_PER_POOL fills and MAX_FUNDING_PER_POOL funding rows per pool. */
    prunePerPool(): void;
    /**
     *  Resolve a fill's maker/taker owner + side from the order join. Live fills
     *  carry these as undefined (taker isn't known at OrderFilled time; maker is
     *  only filled when its resting order was witnessed live), so we back-join to
     *  the order book — populated from the snapshot's open-orders + live events.
     */
    private enrichFill;
    recentFills(pool: string, limit: number): LiveFill[];
    userFills(pool: string | null, user: string, limit: number): LiveFill[];
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
    fundingUpdatesFor(pool: string, limit?: number): LiveFundingUpdate[];
    /** All known markets (memoized — stable reference between mutations). */
    allMarkets(): LiveMarket[];
    marketByPool(pool: string): LiveMarket | null;
    /** Only binary markets have a BinaryMarket contract address. */
    marketByAddress(addr: string): BinaryMarket | null;
    userOrders(pool: string, user: string, limit: number): LiveOrder[];
    /**
     *  The locally-materialized RESTING book for a pool, aggregated by price level
     *  — the zero-round-trip mirror of the on-chain `getBookLevels`. Prices are in
     *  the book's native terms (YES terms for binary, quote-per-base for spot).
     *  Only orders witnessed as rested and still open count, matching the chain.
     */
    bookLevels(pool: string, depth: number): {
        bids: BookLevel[];
        asks: BookLevel[];
    };
    /**
     *  Resting book for a market resolved by its `marketId` (recycle-safe). A
     *  BinaryPool is reused across markets, so this resolves the market's pool and
     *  GUARDS that the pool's CURRENT binding is still this market — if `marketId`
     *  is stale (the pool moved on to a newer market), returns `null` so a stale
     *  page renders nothing rather than the successor market's liquidity.
     */
    bookLevelsByMarket(marketId: string, depth: number): {
        bids: BookLevel[];
        asks: BookLevel[];
    } | null;
    getStatus(): TailStatus;
}
