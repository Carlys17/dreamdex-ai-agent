import { type ResultOf } from "@graphql-typed-document-node/core";
import type { Address, Hex, PublicClient } from "viem";
import type { BinaryMarketStatus } from "./store.js";
/**
 *  The discriminator the whole market surface keys on — mirror of the indexer's
 *  `MarketType` enum. See the {@link Market} union.
 */
export type MarketType = "SPOT" | "PERP" | "BINARY";
/** Fields every market has, regardless of type. */
export type BaseMarket = {
    /** Primary key (lowercased): bytes32 marketId for binary, pool address for spot. */
    id: string;
    /** Discriminator — narrow on this (or the `is*Market` guards). */
    marketType: MarketType;
    /**
     *  The pool serving this market (lowercased; == id for SPOT/PERP). For binary,
     *  a TIME-VARYING binding — see the recycle caveat on {@link BinaryMarket.nonce}.
     */
    poolAddress: Address;
    /** Last fill price (raw). For binary, ≈ YES probability × 10^decimals. Null until first fill. */
    lastPrice: string | null;
    /** Timestamp (unix seconds) of the last fill; null until first fill. */
    lastTradeAt: string | null;
    /** Cumulative base/outcome-token volume (raw, decimal string). */
    cumulativeBaseVolume: string;
    /** Cumulative quote/collateral volume (raw, decimal string). */
    cumulativeQuoteVolume: string;
    /** Lifetime fill count (decimal string). */
    tradeCount: string;
    /** Base-token decimals (binary: outcome tokens mirror the collateral's decimals). */
    baseDecimals: number;
    /**
     *  Quote-token decimals (binary: the collateral's — per-venue, e.g. 6dp
     *  TestUSDC vs 18dp USDso). Format prices/amounts with this.
     */
    quoteDecimals: number;
    /** Timestamp (unix seconds) the market was created/indexed. */
    createdAtTimestamp: string;
};
/** A spot (base/quote) order-book market. */
export type SpotMarket = BaseMarket & {
    /** Discriminator (narrowed). */
    marketType: "SPOT";
    /** Base ERC-20 address (lowercased). */
    baseToken: Address;
    /** Quote ERC-20 address (lowercased). */
    quoteToken: Address;
    /** Base token symbol (e.g. "SOMI"); null when the token exposes none. */
    baseSymbol: string | null;
    /** Quote token symbol (e.g. "USDso"); null when the token exposes none. */
    quoteSymbol: string | null;
    /** True when the base is the chain's native token (wrapped for the book). */
    baseIsNative: boolean;
    /** Price increment, raw quote units per whole base (decimal string). */
    tickSize: string;
    /** Quantity increment, raw base units (decimal string). */
    lotSize: string;
    /** Minimum order quantity, raw base units (decimal string). */
    minQuantity: string;
    /** EMA-smoothed mark price (raw quote per whole base); null until first set. */
    markPrice: string | null;
    /** Unsmoothed book midpoint feeding the mark-price EMA; null until first set. */
    rawMidpoint: string | null;
    /** Timestamp (unix seconds) the mark price last advanced; null until first set. */
    markPriceUpdatedAt: string | null;
    /** Per-pool SpotStopOrderRegistry (lowercased); null on pools without one. */
    stopRegistry: Address | null;
};
/**
 *  A perpetual-futures order-book market. Rides the same OrderBook core as
 *  spot (base/quote book, raw quote units per whole base), with a synthetic
 *  base: positions + collateral live cross-margin in the MarginBank, and the
 *  pool tracks funding against an oracle index price.
 */
export type PerpMarket = BaseMarket & {
    /** Discriminator (narrowed). */
    marketType: "PERP";
    /** Wrapper token standing in for the synthetic base (e.g. WBTC). */
    baseToken: Address;
    /** The MarginBank collateral token (e.g. USDso). */
    quoteToken: Address;
    /** Synthetic-base symbol (e.g. "WBTC"); null when the wrapper exposes none. */
    baseSymbol: string | null;
    /** Collateral token symbol (e.g. "USDso"); null when the token exposes none. */
    quoteSymbol: string | null;
    /**
     *  Always false — the perp base is synthetic, never native. Kept so spot-shaped
     *  base/quote code paths can treat SPOT and PERP uniformly.
     */
    baseIsNative: boolean;
    /** Price increment, raw quote units per whole base (decimal string). */
    tickSize: string;
    /** Quantity increment, raw base units (decimal string). */
    lotSize: string;
    /** Minimum order quantity, raw base units (decimal string). */
    minQuantity: string;
    /** Cross-margin MarginBank holding collateral + positions (lowercased). */
    marginBank: Address;
    /** Initial margin requirement in bps (500 = 5% = 20x max leverage). */
    initialMarginBps: number;
    /**
     *  Per-pool PerpStopOrderRegistry (lowercased); null on pools without one.
     *
     *  The registry is per-pool and every stop-order write takes it as an explicit
     *  `registry` argument ({@link Trader.placePerpStopOrder},
     *  {@link Trader.cancelPerpStopOrder}, {@link Trader.cancelPerpStopOrders}), so
     *  this is where that address comes from — same as `stopRegistry` on a
     *  {@link SpotMarket}. Null means the pool has no registry deployed, and TP/SL is
     *  unavailable on it rather than merely unfound.
     */
    stopRegistry: Address | null;
    /**
     *  Mark price sampled at FUNDING cadence (raw quote per whole base).
     *
     *  Shares the column with the spot mark price but is a different quantity, and the
     *  difference matters:
     *
     *  - It advances only when funding settles — every ~300s on testnet, expected ~3600s on
     *    mainnet — not per trade. For a live mark, read the chain
     *    (`getPerpState().markPrice`, which also reports `markPriceOk`).
     *  - It is null whenever the contract emitted its 0 sentinel for a stale/reverting mark
     *    feed. A stale feed leaves the PREVIOUS value in place rather than zeroing it, so a
     *    non-null value here is not by itself evidence of freshness — compare
     *    `markPriceUpdatedAt` against the settlement cadence.
     *  - It is NOT what drives funding. The premium is the order-book MIDPOINT versus the
     *    index, not mark versus index, and the two routinely disagree in sign. Read
     *    `getPerpState().emaPremium` for the quantity funding actually uses.
     */
    markPrice: string | null;
    /** When `markPrice` last advanced (unix seconds); null until the first settlement. */
    markPriceUpdatedAt: string | null;
    /**
     *  Funding rate for the last settlement window (1e18-scaled fraction, signed).
     *  Null until the first FundingUpdated is indexed.
     */
    fundingRate: string | null;
    /** Cumulative funding per base unit since inception (1e18-scaled, signed). */
    cumulativeFundingPerUnit: string | null;
    /** Oracle index price at the last funding update (raw quote per whole base). */
    indexPrice: string | null;
    /** Timestamp (unix seconds) of the last FundingUpdated; null until the first. */
    fundingUpdatedAt: string | null;
    /**
     *  The rate's DENOMINATOR in seconds (`fundingCalculationWindowSec`), 28800 on every
     *  live pool. `fundingRate` above is per THIS window — not per settlement interval and
     *  not annualized. Pass it to {@link normalizeFundingRate} and friends; a hardcoded
     *  denominator produces a plausible-looking wrong chart rather than an error.
     */
    fundingWindowSec: number | null;
    /**
     *  Settlement cadence in seconds. 300 on testnet, expected 3600 on mainnet, so
     *  `fundingWindowSec / fundingIntervalSec` is 96 vs 8 — the same rate value means a
     *  12x different per-interval accrual between them.
     */
    fundingIntervalSec: number | null;
    /**
     *  TOTAL open interest in base units.
     *
     *  Replaces `longOpenInterest` / `shortOpenInterest`. The contract keeps ONE counter
     *  because the short side is provably equal in a matched CLOB, and the removed pair was
     *  null on every row anyway — the subscription feeding it was dead.
     */
    openInterest: string | null;
    /** Timestamp (unix seconds) of the last OpenInterestUpdated; null until the first. */
    openInterestUpdatedAt: string | null;
};
/** A binary (YES/NO outcome) order-book market — the binary CLOB. */
export type BinaryMarket = BaseMarket & {
    /** Discriminator (narrowed). */
    marketType: "BINARY";
    /** bytes32 marketId (== id). */
    marketId: Hex;
    /** The BinaryMarket clone contract's address (lowercased). */
    marketAddress: Address;
    /**
     *  This market's YES/NO position ids on the ERC-6909 outcome-token singleton,
     *  as decimal strings (the indexer stores uint256 ids as strings).
     */
    yesTokenId: string;
    /** The NO position id — see {@link BinaryMarket.yesTokenId}. */
    noTokenId: string;
    /** Collateral ERC-20 backing the market (lowercased; per-venue). */
    collateral: Address;
    /** Underlying asset symbol (e.g. "BTC"). */
    asset: string;
    /** Display question text. May differ from {@link BinaryMarket.oracleQuestion}. */
    question: string;
    /**
     *  Lifecycle status (aliased from the indexer's `clobStatus`). Derived from
     *  lifecycle EVENTS only — the timestamp-implicit Listed→Trading→Settling
     *  transitions emit none, so derive the live trading state from
     *  `tradingStart`/`expiry` between events rather than trusting this alone.
     */
    status: BinaryMarketStatus;
    /**
     *  The canonical oracle question string (as registered on-chain); may differ
     *  from the display `question`. Null on markets indexed before this field.
     */
    oracleQuestion: string | null;
    /**
     *  Oracle question id the market binds to (uint256 as a decimal string, from
     *  `BinaryMarketsModule.MarketCreated`). `null` when discovered via the
     *  realtime tail or indexed before this field (filled on the next snapshot).
     */
    oracleQuestionId?: string | null;
    /** Strike the question resolves against (raw, in the oracle's price scale). */
    strike: string;
    /** Timestamp (unix seconds) trading opens. */
    tradingStart: string;
    /** Timestamp (unix seconds) trading ends and the outcome is decided. */
    expiry: string;
    /**
     *  Winning outcome (0 = YES, 1 = NO) — DERIVED by the indexer from a one-hot
     *  payout vector (Oracle v2 resolves with vectors; a one-hot vector has a
     *  unique winner). Null until Resolved and on non-one-hot (void/partial)
     *  vectors — the binary-compat field, kept alongside the vector below.
     */
    winningOutcome: number | null;
    /**
     *  Per-outcome payout numerators the market settled to (Oracle v2 vector
     *  resolution; uint256s as decimal strings — one-hot on a win, uniform on a
     *  void; raw Σ == payoutDenominator). Null until Resolved / on markets
     *  indexed before the vector fields existed.
     */
    payoutNumerators?: string[] | null;
    /**
     *  Denominator the numerators are scaled against (`PAYOUT_VECTOR_DENOMINATOR`
     *  = 10_000_000; decimal string). Null until Resolved.
     */
    payoutDenominator?: string | null;
    /** Block the market resolved at; null until Resolved. */
    resolvedAtBlock: string | null;
    /** Timestamp (unix seconds) the market resolved at; null until Resolved. */
    resolvedAtTimestamp: string | null;
    /** Tx hash the market was created in; null on markets indexed before this field. */
    createdByTx: Hex | null;
    /**
     *  Wallet that invoked createMarket (lowercased, from
     *  `BinaryMarketsModule.MarketCreated`). `null` when discovered via the
     *  realtime tail or indexed before this field (filled on the next snapshot).
     */
    creator?: Address | null;
    /** True once the market voided (uniform payout vector; complete sets redeem at par). */
    voided: boolean;
    /**
     *  Collateral backing complete sets on the LIVE pool (raw). Reads 0 once
     *  finalized — prefer {@link BinaryMarket.netBacking} after finalize.
     */
    backing: string;
    /**
     *  The pool's market nonce this market is bound to (settlement-extraction v2).
     *  A pool serves successive markets; `(poolAddress, nonce)` disambiguates them
     *  and encodes the outcome ids. `null` on markets indexed before v2 / discovered
     *  via a live event that doesn't carry it (filled on the next snapshot).
     *
     *  RECYCLE CAVEAT: `poolAddress` is a TIME-VARYING 1:1 binding — the same pool
     *  address serves different markets over time (never concurrently). Always key
     *  a market by `marketId`, never by `poolAddress` alone; use `nonce` to tell
     *  which of a pool's markets a given outcome id belongs to.
     */
    nonce?: string | null;
    /**
     *  Whether this market's backing has been finalized onto the BinarySettlement
     *  singleton (settlement-extraction v2). True once `finalizeMarket` swept the
     *  pool's backing over; redemption is served by settlement thereafter. `null`
     *  when unknown (pre-v2 / not yet snapshotted).
     */
    finalized?: boolean | null;
    /**
     *  The NET collateral backing recorded on the settlement singleton after
     *  finalize (post fee-skim on resolution; gross on void), decimal string. This
     *  is the authoritative post-finalize backing: `BinaryMarket.backing()` reads 0
     *  once finalized, so redemption UIs should prefer `netBacking` when set. `null`
     *  until finalize / on pre-v2 markets.
     */
    netBacking?: string | null;
    /**
     *  Opaque creator-supplied metadata bytes (hex, 0x-prefixed; '0x' when empty).
     *  The chain attaches no semantics — off-chain data only. Set once at creation.
     *  `null` on non-binary markets / markets indexed before this field existed.
     */
    context?: Hex | null;
    /**
     *  Series cadence in seconds (900=15m, 3600=1h, 14400=4h, 86400=24h). DERIVED
     *  by the indexer from the market's own window (`expiry − tradingStart`) — a
     *  series' FIRST market is a bootstrap partial whose window is shorter than the
     *  steady-state cadence. `null` on SPOT / PERP.
     */
    intervalSec?: string | null;
    /**
     *  Human timeframe label for this series — `"15m"` / `"1h"` / `"4h"` / `"24h"`
     *  — DERIVED by the SDK from {@link BinaryMarket.intervalSec} (falling back to
     *  `expiry − tradingStart`) and snapped to the nearest natural unit to shed
     *  off-by-one-second noise. Served ready-to-render so consumers stop
     *  re-deriving it; see {@link marketIntervalLabel}. `null` on SPOT / PERP or
     *  when no cadence is determinable.
     */
    interval?: string | null;
    /**
     *  Origin operator id the market was created under (from
     *  `BinaryMarketsModule.MarketCreated`). `null` when discovered via the
     *  realtime tail (filled on the next snapshot).
     */
    operatorId?: number | null;
    /**
     *  Origin venue id within the operator, contract-generated opaque bytes32 hex.
     *  `null` when discovered via the realtime tail (filled on the next snapshot —
     *  the live `MarketCreator.MarketCreated` event doesn't carry it).
     */
    venueId?: Hex | null;
};
/** A market of any type, discriminated by `marketType`. */
export type Market = SpotMarket | PerpMarket | BinaryMarket;
/** Narrow a {@link Market} to its binary variant. */
export declare function isBinaryMarket(m: Market): m is BinaryMarket;
/** Narrow a {@link Market} to its spot variant. */
export declare function isSpotMarket(m: Market): m is SpotMarket;
/** Narrow a {@link Market} to its perp variant. */
export declare function isPerpMarket(m: Market): m is PerpMarket;
export declare const MarketFields: import("./gql/graphql.js").TypedDocumentString<import("./gql/graphql.js").MarketFieldsFragment, unknown>;
/**
 *  The flat row {@link MarketFields} actually returns — DERIVED from the schema,
 *  so every field name, alias, and wire type here is the indexer's, not a
 *  hand-written guess. Superseded the hand-maintained `RawMarketRow`.
 */
export type RawMarketRow = ResultOf<typeof MarketFields>;
/**
 *  {@link MarketFields} as raw GraphQL text, for the ONE query that cannot be a
 *  typed document yet: `snapshot.ts`'s `MarketsSnapshot` assembles its variable
 *  declarations and `where` clauses by string interpolation, and `graphql()`
 *  overloads key on the literal source string. Interpolating this keeps that
 *  query's selection in lockstep with the typed one (a field added here reaches
 *  both) even though its RESULT there is still hand-typed.
 *
 *  Not a permanent arrangement — `snapshot.ts` migrates with its own slice, where
 *  the dynamic text collapses into `Market_bool_exp` variables (an empty `{}`
 *  bool_exp is unconstrained, so the scoped/unscoped branch needs no string
 *  surgery). Until then this is the seam, and it is deliberately the *text*, not
 *  a second copy of the field list.
 */
export declare const MARKET_FIELDS: string;
export declare const asAddress: (s: string) => Address;
export declare const asHex: (s: string) => Hex;
/**
 *  Lowercase a `0x` value WITHOUT widening it back to `string`.
 *
 *  `Address` and `Hex` are template-literal types, so `.toLowerCase()` — which
 *  returns `string` — loses the type even though lowercasing a `0x${string}` can
 *  only ever produce another `0x${string}`. Used by the live-tail reducer, whose
 *  event args arrive already typed by viem's decoder and only need normalizing to
 *  the lowercase form the indexer and `store.ts`'s lookup maps use.
 */
export declare const lower0x: <T extends `0x${string}`>(s: T) => T;
/**
 *  Stamp the discriminated {@link Market} type onto a flat indexer row.
 *
 *  Builds one of three plain objects — {@link BinaryMarket}, {@link SpotMarket},
 *  or {@link PerpMarket} — picking only that variant's fields. Shared identity /
 *  volume / decimals land on every variant; type-specific columns do not cross
 *  the boundary (a binary row never carries `baseToken`, a spot row never
 *  carries `yesTokenId`).
 *
 *  Field names and wire types are schema-derived and compiler-checked. What
 *  remains is the ONE thing GraphQL cannot express: that `marketType` CORRELATES
 *  with which nullable columns are actually populated. The schema must declare
 *  every type-specific column nullable — a column has to be null for the other
 *  market types — so required fields are taken with `?? unreachable(...)`: an
 *  assertion the indexer's handlers uphold, not a proof. Binary also stamps the
 *  derived timeframe label (`interval`) — see {@link marketIntervalLabel}.
 *
 *  **Gotchas**
 *
 *  Throws {@link InvariantError} on a row whose own columns are not populated —
 *  an indexer/schema regression, never caller input. For LIST reads that is the
 *  wrong blast radius (one bad row would blank the page), so those map through
 *  {@link toMarkets}, which drops the offender instead. Single-row reads let it
 *  throw: there is no partial answer to degrade to.
 */
export declare function toMarket(r: RawMarketRow): Market;
/**
 *  {@link toMarket} across a list, DROPPING any row whose own columns are not
 *  populated instead of failing the whole read.
 *
 *  **When to use**
 *
 *  Every list read. `rows.map(toMarket)` is the shape to avoid: `toMarket` throws
 *  {@link InvariantError} on a malformed row, so one bad row out of 500 would
 *  reject the entire page rather than serve 499. A list has a sane partial answer
 *  and a single-row read does not — so `getMarket` and friends still let it throw.
 *
 *  **Gotchas**
 *
 *  A drop is SILENT: the SDK owns no log channel at this layer (`config.debug` is
 *  per-client and these are free functions), and the alternative — a bare
 *  `console.warn` from inside a library — is worse. The signal that something is
 *  wrong is a short count, plus `marketRowContract.ts` failing to compile once the
 *  schema drift reaches CI. Callers that must distinguish "no markets" from
 *  "markets the SDK could not parse" should compare against the row count.
 */
export declare function toMarkets(rows: readonly RawMarketRow[]): Market[];
/**
 *  Filters shared by the binary-market list queries (`listBinaryMarkets`,
 *  `listLiveBinaryMarkets`, `listPastBinaryMarkets`). Every field is optional;
 *  an omitted field does NOT constrain the query. Applied server-side (Hasura
 *  `where`), so `venueId` / `intervalSec` hit their indexes.
 */
export type BinaryMarketFilter = {
    /** Origin operator id (from `BinaryMarketsModule.MarketCreated`). */
    operatorId?: number;
    /** Origin venue id within the operator (contract-generated bytes32 hex). */
    venueId?: string;
    /** Underlying asset symbol, e.g. `"BTC"` | `"ETH"`. */
    asset?: string;
    /** Series cadence in seconds: `900` (15m) | `3600` (1h) | `14400` (4h) | `86400` (24h). */
    intervalSec?: number;
    /**
     *  Lifecycle status — `"Trading"` is active; `"Locked"` / `"Settling"` /
     *  `"Resolved"` / `"Voided"` are the not-active states.
     */
    status?: BinaryMarketStatus;
    /**
     *  Free-text needle matched (case-insensitive) against the asset symbol and
     *  the question text. Server-side (`_ilike`), AND-combined with the other
     *  facets so it narrows within them.
     */
    search?: string;
    /**
     *  Wallet that invoked createMarket (from `BinaryMarketsModule.MarketCreated`).
     *  Case-insensitive (lowercased server-side).
     */
    creator?: string;
    /**
     *  Server-side sort (Hasura `order_by`). `"newest"` → createdAtTimestamp desc;
     *  `"closingSoon"` → expiry asc; `"volume"` → cumulativeQuoteVolume desc;
     *  `"tradeCount"` → tradeCount desc. Omitted → each list keeps its own default
     *  (`listBinaryMarkets` newest-first; `listLiveBinaryMarkets` closingSoon).
     */
    orderBy?: BinaryMarketOrderBy;
};
/** Sort keys for the binary-market list queries — see {@link BinaryMarketFilter.orderBy}. */
export type BinaryMarketOrderBy = "newest" | "closingSoon" | "volume" | "tradeCount";
/**
 *  List markets of either type (or filter to one), newest first, as the
 *  discriminated {@link Market} union. For binary-only callers that want a
 *  pre-narrowed {@link BinaryMarket}[], {@link listBinaryMarkets} is the same
 *  query with the filter and narrowing baked in.
 *  @param opts.marketType Restrict to one kind (`"BINARY"` | `"SPOT"` | `"PERP"`).
 *  @param opts.limit Max rows (default 50).
 */
export declare function listMarkets(opts: {
    marketType?: MarketType;
    limit?: number;
    offset?: number;
} | undefined, indexerUrl: string): Promise<Market[]>;
/**
 *  Registry sweep for the unified tier: every non-binary market plus the
 *  binary series that are still live (not finalized), paged until exhausted.
 *
 *  **Gotchas**
 *
 *  Finalized series accumulate without bound and would swamp the symbol registry
 *  with thousands of dead markets, so they are excluded — resolve those by pool
 *  via the raw-tier lookups instead.
 */
export declare function listRegistryMarkets(indexerUrl: string): Promise<Market[]>;
/**
 *  Server-side COUNT of markets, optionally of one type (Hasura `Market_aggregate`)
 *  — so a spot/perp list paginates against a real total without fetching rows.
 *  Privileged `_aggregate` role (server-only), like {@link countBinaryMarkets}.
 */
export declare function countMarkets(opts: {
    marketType?: MarketType;
} | undefined, indexerUrl: string, headers?: Record<string, string>): Promise<number>;
/**
 *  Fetch one market of either type by primary key, as the {@link Market} union
 *  (null if absent). {@link getBinaryMarket} is the binary-narrowed counterpart.
 */
export declare function getMarket(id: string, indexerUrl: string): Promise<Market | null>;
/**
 *  Fetch one market by its on-chain BinaryMarket ADDRESS (not the bytes32 marketId
 *  primary key). The market PK is `marketId`, so a caller that only holds the
 *  address (e.g. an explorer route keyed on the market clone address) must resolve
 *  through this. Newest first so a recycled/rebound address returns its current
 *  market. Null if the indexer has no row yet.
 */
export declare function getMarketByAddress(marketAddress: string, indexerUrl: string): Promise<Market | null>;
/** Binary-narrowed {@link getMarketByAddress}. */
export declare function getBinaryMarketByAddress(marketAddress: string, indexerUrl: string): Promise<BinaryMarket | null>;
/**
 *  List binary markets, newest first, pre-narrowed to
 *  {@link BinaryMarket}[]. Call with no argument for all binary markets, or pass
 *  a {@link BinaryMarketFilter} (+ `limit`) to narrow by venue / asset / cadence
 *  / status — e.g. `{ venueId: "0x…" }`. Note "binary", not "clob": spot markets are
 *  order books (CLOBs) too.
 *
 *  Each row carries `poolAddress` + `nonce` (settlement-extraction v2). RECYCLE
 *  CAVEAT: `poolAddress` is a TIME-VARYING binding — the same pool serves
 *  successive markets (never concurrently), so several rows can share a pool.
 *  Key markets by `marketId`; `(poolAddress, nonce)` identifies a market's slice
 *  of a pool's history and encodes its outcome ids.
 */
export declare function listBinaryMarkets(opts: (BinaryMarketFilter & {
    limit?: number;
}) | undefined, indexerUrl: string): Promise<BinaryMarket[]>;
/**
 *  Distinct (operatorId, venueId) pairs present across binary markets — the
 *  cheap server-side source for a venue filter's options (via Hasura
 *  `distinct_on`), so a UI never has to fetch every market just to learn which
 *  venues exist. Markets with a null attribution are excluded.
 */
export declare function listBinaryVenueIds(indexerUrl: string): Promise<{
    operatorId: number;
    venueId: string;
}[]>;
/**
 *  Distinct asset symbols present across binary markets — the cheap
 *  server-side source for an asset filter's options (Hasura `distinct_on`), so
 *  a UI never fetches every market to learn which assets exist.
 */
export declare function listBinaryAssets(indexerUrl: string): Promise<string[]>;
/**
 *  Server-side COUNT of binary markets matching a filter, split by lifecycle
 *  phase (`"live"` = `expiry > now`, `"past"` = `expiry <= now`). Uses Hasura
 *  `Market_aggregate` so a total never requires fetching rows — the browser
 *  learns "1,240 live" in O(1), not by loading 1,240 markets.
 */
export declare function countBinaryMarkets(opts: BinaryMarketFilter & {
    phase: "live" | "past";
    nowSec?: number;
}, indexerUrl: string, headers?: Record<string, string>): Promise<number>;
/**
 *  Fetch one binary market by primary key (lowercased bytes32 marketId),
 *  narrowed to {@link BinaryMarket} (null if absent or not binary).
 */
export declare function getBinaryMarket(id: string, indexerUrl: string): Promise<BinaryMarket | null>;
/**
 *  The origin attribution + fee config frozen into a market at creation,
 *  mirrored from `BinaryMarketsModule.MarketCreated` / `MarketFeeConfig` into the
 *  indexer's `MarketVenue` entity. Rates are standard basis points (1 = 0.01%,
 *  100 = 1%, 10_000 = 100%). Fee fields are null for markets indexed before the
 *  fee plumbing existed.
 */
export type MarketFees = {
    /** Origin operator id the market was created under. */
    operatorId: number;
    /** Origin venue id within the operator (bytes32 hex). */
    venueId: string;
    /** Fee recipient frozen at creation (lowercased); null on pre-plumbing markets. */
    feeRecipient: string | null;
    /** Maker fee rate (bps, decimal string); null on pre-plumbing markets. */
    makerFeeBps: string | null;
    /** Taker fee rate (bps, decimal string); null on pre-plumbing markets. */
    takerFeeBps: string | null;
    /** Cap on the per-order builder fee (bps, decimal string); null pre-plumbing. */
    maxBuilderFeeBps: string | null;
    /** Routing fee rate (bps, decimal string); null on pre-plumbing markets. */
    routingFeeBps: string | null;
    /** Settlement fee skimmed from the winning payout at redeem (bps). */
    settlementFeeBps: string | null;
    /** Realized settlement fee collected on winning redemptions so far (raw collateral). */
    settlementFeesCollected: string | null;
};
/**
 *  Fetch the fee config frozen into a market (null when the market has no venue
 *  attribution — e.g. spot/perp, or pre-plumbing binary markets).
 */
export declare function getMarketFees(marketId: string, indexerUrl: string): Promise<MarketFees | null>;
/** Filters for {@link SomniaMarketsClient.listSpotMarkets}. All optional; applied server-side. */
export type SpotMarketFilter = {
    /** Base token symbol, e.g. `"SOMI"` | `"WBTC"`. */
    baseSymbol?: string;
    /** Quote token symbol, e.g. `"USDso"`. */
    quoteSymbol?: string;
};
/**
 *  List spot markets, newest first, pre-narrowed to {@link SpotMarket}[]. Pass a
 *  {@link SpotMarketFilter} (+ `limit`) to narrow by base/quote symbol.
 */
export declare function listSpotMarkets(opts: (SpotMarketFilter & {
    limit?: number;
}) | undefined, indexerUrl: string): Promise<SpotMarket[]>;
/**
 *  One spot market by pool address, or null (also null if the id resolves to
 *  another market kind).
 */
export declare function getSpotMarket(id: string, indexerUrl: string): Promise<SpotMarket | null>;
/**
 *  One entry in a market's lifecycle audit trail (from the indexer's
 *  MarketStatusUpdate entity).
 */
export type MarketStatusUpdate = {
    /** Status before the transition. */
    oldStatus: BinaryMarketStatus;
    /** Status after the transition. */
    newStatus: BinaryMarketStatus;
    /** Block the transition landed in (decimal string). */
    blockNumber: string;
    /** Timestamp (unix seconds) of the transition. */
    timestamp: string;
    /** Tx hash the transition landed in. */
    txHash: string;
};
/**
 *  The status-transition history for a market (e.g. Trading → Locked → Settling
 *  → Resolved), oldest-first — the resolution/lock timeline for a market page.
 */
export declare function getMarketStatusHistory(marketId: string, indexerUrl: string): Promise<MarketStatusUpdate[]>;
/** Filters for {@link SomniaMarketsClient.listPerpMarkets}. All optional; applied server-side. */
export type PerpMarketFilter = {
    /** Synthetic-base token symbol, e.g. `"WBTC"`. */
    baseSymbol?: string;
    /** Collateral (quote) token symbol, e.g. `"USDso"`. */
    quoteSymbol?: string;
};
/**
 *  List perp markets, newest first, pre-narrowed to {@link PerpMarket}[].
 *  @param opts - {@link PerpMarketFilter} plus `limit` (max rows, default 50).
 */
export declare function listPerpMarkets(opts: (PerpMarketFilter & {
    limit?: number;
}) | undefined, indexerUrl: string): Promise<PerpMarket[]>;
/**
 *  Fetch one perp market by primary key (lowercased pool address), narrowed to
 *  {@link PerpMarket} (null if absent or not a perp).
 */
export declare function getPerpMarket(id: string, indexerUrl: string): Promise<PerpMarket | null>;
/**
 *  Filters for `listLiveBinaryMarkets`. Every field is optional; an omitted
 *  field does NOT constrain the query. Applied server-side (Hasura `where`), so
 *  `venueId` / `intervalSec` hit their indexes.
 */
export type LiveBinaryMarketsFilter = BinaryMarketFilter & {
    /**
     *  Page size (default 50). Live is unbounded at scale (thousands of venues ×
     *  cadences), so it is ALWAYS paginated — never fetch the whole live set.
     */
    limit?: number;
    /** Row offset for cursoring the live board (default 0). */
    offset?: number;
    /** Override "now" (unix seconds); defaults to `Date.now()`. Mostly for tests. */
    nowSec?: number;
};
/**
 *  Paginated list of CURRENTLY LIVE binary markets (`expiry > now`), soonest-to-
 *  expire first. `limit` + `offset` cursor the live board exactly like
 *  {@link listPastBinaryMarkets} does the historical tail — the caller fetches
 *  page 1 server-side and more pages on demand. Pass a
 *  {@link LiveBinaryMarketsFilter} to narrow by operator / venue / asset /
 *  cadence / status / search.
 */
export declare function listLiveBinaryMarkets(filter: LiveBinaryMarketsFilter | undefined, indexerUrl: string): Promise<BinaryMarket[]>;
/**
 *  Options for `listPastBinaryMarkets` — the {@link BinaryMarketFilter}
 *  plus pagination + a `now` override.
 */
export type PastBinaryMarketsOptions = BinaryMarketFilter & {
    /** Page size (default 50). */
    limit?: number;
    /** Row offset for cursoring the historical tail (default 0). */
    offset?: number;
    /** Override "now" (unix seconds); defaults to `Date.now()`. */
    nowSec?: number;
};
/**
 *  Paginated list of PAST binary markets (`expiry <= now`), most-recently-
 *  expired first. `limit` + `offset` cursor the historical tail — the caller
 *  typically fetches page 1 on initial render (server-side) and additional
 *  pages client-side on user demand. Live markets are excluded; use
 *  {@link listLiveBinaryMarkets} for those. Accepts the same
 *  {@link BinaryMarketFilter} (venue / asset / cadence / status).
 */
export declare function listPastBinaryMarkets(opts: PastBinaryMarketsOptions | undefined, indexerUrl: string): Promise<BinaryMarket[]>;
/**
 *  Batch-fetch the OPENING price (the reference-question oracle answer) for many
 *  binary markets in ONE pair of round-trips — for list views that want to show
 *  each up/down market's opening price without an N+1 fan-out. Returns a map of
 *  lowercased marketId → raw `numericValue` (or `null` when the reference has no
 *  answer yet / the market has no reference question). Format with the market's
 *  oracle price scale (see the explorer's `fmtOraclePrice`).
 */
export declare function getOpeningPrices(marketIds: string[], indexerUrl: string): Promise<Record<string, string | null>>;
/**
 *  A BinaryMarket's wiring + live state, read straight from chain (works before
 *  the indexer has the market).
 */
export interface MarketOnchain {
    /** The BinaryMarket contract address (resolved from the module record). */
    marketAddress: Address;
    /** Protocol-level ERC-6909 outcome-token singleton (shared across all markets). */
    outcomeToken: Address;
    /** This market's YES position id on the singleton. */
    yesId: bigint;
    /** This market's NO position id on the singleton. */
    noId: bigint;
    /**
     *  The pool hosting (or that hosted) this market's CLOB. Settlement-extraction
     *  v2: a pool address is a TIME-VARYING binding — the same pool serves
     *  successive markets, so never key a market by pool address; `(pool, nonce)`
     *  identifies this market's slice of the pool's history.
     */
    pool: Address;
    /** The pool's market nonce for THIS market (part of the outcome-id encoding). */
    nonce: bigint;
    /** ERC-20 collateral token the market settles in (its `decimals` scale `backing`). */
    collateral: Address;
    /** MarketStatus enum: 0 Listed · 1 Trading · 2 Locked · 3 Settling · 4 Resolved · 5 Voided */
    status: number;
    /**
     *  Live collateral backing. While trading this is the pool's `setBacking` (via
     *  `market.backing()`); once the market is FINALIZED onto the settlement
     *  singleton the pool reads 0, so this falls back to the settlement record's
     *  remaining NET backing (post fee-skim, decremented by each redemption).
     */
    backing: bigint;
    /**
     *  True once the market's backing + resolution snapshot were swept to the
     *  BinarySettlement singleton (redemption is served there from then on).
     */
    finalized: boolean;
    /** Trading-close / settlement timestamp (seconds). */
    expiry: bigint;
    /** Collateral decimals (falls back to DECIMALS if the read reverts). */
    decimals: number;
    /**
     *  Winning outcome (0 = YES, 1 = NO). Only meaningful when `isResolved` — the
     *  contract returns 0 by default which would otherwise read as a YES win on
     *  a market that hasn't resolved yet.
     */
    winningOutcome: number;
    /** Oracle has resolved the market to a concrete winning outcome. */
    isResolved: boolean;
    /** Oracle has voided the market (no winner; both sides redeem 0.5:1). */
    isVoided: boolean;
}
/** Module/settlement wiring `getMarketOnchain` resolves the market through. */
export interface MarketOnchainSources {
    /** BinaryMarketsModule address (the on-chain market registry). */
    module: Address;
    /**
     *  BinarySettlement singleton — enables the post-finalize backing fallback.
     *  Omit on pre-v2 deploys; `finalized` then stays false and `backing` is the
     *  raw `market.backing()` value.
     */
    settlement?: Address;
}
/**
 * Read a market's wiring + live state by its bytes32 `marketId`.
 *
 * BREAKING (settlement-extraction v2, SDK 0.13.0): this took the BinaryMarket
 * contract ADDRESS before; it now takes the module `marketId` and resolves the
 * record through the BinaryMarketsModule. A pool (or its market contract
 * address) can no longer stand in for a market identity — pools are recycled
 * across successive markets — so every market-keyed read goes through
 * `marketId`. A 20-byte address is rejected loudly at runtime.
 */
export declare function getMarketOnchain(marketId: Hex, sources: MarketOnchainSources, client: PublicClient): Promise<MarketOnchain>;
/**
 *  A pool's creator — its first-deploy market creator, the only party that can
 *  reuse it (settlement-extraction v2 creator-scoped pool reuse). Zero address
 *  for a pool the module never deployed. Pure chain read (no signer) — the
 *  indexer-backed equivalent is `getPool(address)`'s `creator`.
 */
export declare function getPoolCreator(pool: Address, module: Address, client: PublicClient): Promise<Address>;
/**
 *  owner / implementation / native balance for a deployed contract — the
 *  diagnostics the /system dashboard shows. `owner` is null when the contract
 *  isn't Ownable; `impl` is read from the EIP-1967 slot only when `proxy` is
 *  true (null otherwise, or when the slot is empty). Each sub-read degrades to
 *  null/0 independently so one missing getter never fails the whole card.
 */
export interface ContractMeta {
    /** Ownable `owner()`, or null when the contract exposes no owner getter. */
    owner: Address | null;
    /**
     *  EIP-1967 implementation address — null unless read as a proxy with a
     *  non-empty slot.
     */
    impl: Address | null;
    /** Native (SOMI) balance, raw wei (18dp); 0n when the read fails. */
    balance: bigint;
}
export declare function getContractMeta(address: Address, opts: {
    proxy?: boolean;
}, client: PublicClient): Promise<ContractMeta>;
