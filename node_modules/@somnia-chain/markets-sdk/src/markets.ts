// Markets — the shared market surface across every kind.
//
// ONE `Market` entity serves spot, perp and binary; `marketType` discriminates it
// and the `is*Market` guards narrow it. That is why this is a shared concept
// rather than three: a list is a filter over one table, not three code paths. The
// kind-specific MECHANICS (settlement, stops, margin) live in binary/, spot/ and
// perp/ — what lives here is identity, discovery and the row parser everything
// else builds on.
//
// `toMarket` + MARKET_FIELDS are the selection-set/parse pair; snapshot.ts uses
// them directly to hydrate the live store.

import * as IndexerRead from "./indexerRead.js";
import { graphql } from "./gql/gql.js";
import { type ResultOf } from "@graphql-typed-document-node/core";
import type { Address, Hex, PublicClient } from "viem";
import * as ReadsAbi from "./readsAbi.js";
import * as ModuleAbi from "./moduleAbi.js";
import * as Store from "./store.js";
import * as Ids from "./ids.js";
import * as Interval from "./interval.js";
import * as Balances from "./balances.js";
import { InvalidInputError } from "./errors.js";
import { InvariantError, unreachable } from "./raise.js";
import type { BinaryMarketStatus } from "./store.js";
import type { Market_Bool_Exp, Market_Order_By } from "./gql/graphql.js";

/**
 *  The discriminator the whole market surface keys on — mirror of the indexer's
 *  `MarketType` enum. See the {@link Market} union.
 */
export type MarketType = "SPOT" | "PERP" | "BINARY";

// ============================================================================
// The market surface. The indexer serves every market — spot, perp and binary —
// from one `Market` entity discriminated by `marketType`. We expose it as a real
// discriminated union (`SpotMarket | PerpMarket | BinaryMarket`), so
// `if (m.marketType === "BINARY")` (or the `isBinaryMarket`/`isSpotMarket`/
// `isPerpMarket` guards) narrows to exactly the fields that exist on that
// variant — no nullable-everything bag to thread.
//
// `marketType` is the single discriminator the whole stack keys on, so a new
// order-book product becomes another union member here plus an indexer adapter
// — not a parallel read/UI fork.
// ============================================================================

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
export function isBinaryMarket(m: Market): m is BinaryMarket {
  return m.marketType === "BINARY";
}

/** Narrow a {@link Market} to its spot variant. */
export function isSpotMarket(m: Market): m is SpotMarket {
  return m.marketType === "SPOT";
}

/** Narrow a {@link Market} to its perp variant. */
export function isPerpMarket(m: Market): m is PerpMarket {
  return m.marketType === "PERP";
}

// The unified indexer stores binary status as `clobStatus`; alias it back to
// `status` so the BinaryMarket variant reads naturally. The flat row the indexer
// returns carries every column (the other variant's are null) — `toMarket` picks
// only the fields that belong on each variant so the union members stay clean.
//
// One fragment, spread by every market query, so the selection exists ONCE: a
// field the indexer renamed or retyped fails `pnpm codegen` here rather than in
// nine separate template strings.
// prettier-ignore
export const MarketFields = graphql(`
  fragment MarketFields on Market {
    id
    marketType
    poolAddress
    lastPrice
    lastTradeAt
    cumulativeBaseVolume
    cumulativeQuoteVolume
    tradeCount
    baseDecimals
    quoteDecimals
    createdAtTimestamp
    baseToken
    quoteToken
    baseSymbol
    quoteSymbol
    baseIsNative
    tickSize
    lotSize
    minQuantity
    markPrice
    rawMidpoint
    markPriceUpdatedAt
    stopRegistry
    marginBank
    initialMarginBps
    fundingRate
    cumulativeFundingPerUnit
    indexPrice
    fundingUpdatedAt
    fundingWindowSec
    fundingIntervalSec
    openInterest
    openInterestUpdatedAt
    marketId
    marketAddress
    yesTokenId
    noTokenId
    collateral
    asset
    question
    oracleQuestion
    oracleQuestionId
    status: clobStatus
    strike
    tradingStart
    expiry
    winningOutcome
    payoutNumerators
    payoutDenominator
    resolvedAtBlock
    resolvedAtTimestamp
    createdByTx
    creator
    voided
    backing
    nonce
    finalized
    netBacking
    context
    intervalSec
    operatorId
    venueId
  }
`);

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
export const MARKET_FIELDS = MarketFields.toString().replace(
  /^\s*fragment MarketFields on Market \{|\}\s*$/g,
  "",
);

// ---------------------------------------------------------------- wire → 0x types
// Hasura serves every address and hash as plain `String`, so the row type is
// `string` and the public types are viem's `Address` / `Hex` (viem is the platform
// here — see CONVENTIONS.md). These two functions are that narrowing, named so the
// claim is greppable instead of scattered as inline `as Address` casts.
//
// They do NOT validate, deliberately. The shape gate lives at the point where a
// malformed address could actually ENTER — `indexer/scripts/gen-config.mjs`, which
// hard-fails codegen on the generated pool/token metadata (the only addresses not
// already ABI-decoded from an event, hence the only ones a human can typo). Re-
// testing a regex per field per row here would cost ~8 checks × 500 rows a page to
// re-confirm what viem's decoder established upstream, and would turn a
// cosmetically-odd address into a silently vanished market.
//
// Lowercase is load-bearing, not cosmetic: the indexer lowercases on write and
// `store.ts` keys `poolToMarket` / `addressToMarket` on it. viem's `getAddress`
// would return EIP-55 CHECKSUMMED values and break those lookups — which is why
// `Address` (a template-literal type that lowercase satisfies) is the right tool
// and `getAddress` is not.
export const asAddress = (s: string): Address => s as Address;
export const asHex = (s: string): Hex => s as Hex;

/**
 *  Lowercase a `0x` value WITHOUT widening it back to `string`.
 *
 *  `Address` and `Hex` are template-literal types, so `.toLowerCase()` — which
 *  returns `string` — loses the type even though lowercasing a `0x${string}` can
 *  only ever produce another `0x${string}`. Used by the live-tail reducer, whose
 *  event args arrive already typed by viem's decoder and only need normalizing to
 *  the lowercase form the indexer and `store.ts`'s lookup maps use.
 */
export const lower0x = <T extends `0x${string}`>(s: T): T => s.toLowerCase() as T;

/** Nullable passthrough of {@link asAddress} — for columns that are legitimately null. */
const asAddressOrNull = (s: string | null | undefined): Address | null => (s == null ? null : asAddress(s));

/** Nullable passthrough of {@link asHex}. */
const asHexOrNull = (s: string | null | undefined): Hex | null => (s == null ? null : asHex(s));

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
export function toMarket(r: RawMarketRow): Market {
  const base = {
    id: r.id,
    poolAddress: asAddress(r.poolAddress),
    lastPrice: r.lastPrice,
    lastTradeAt: r.lastTradeAt,
    cumulativeBaseVolume: r.cumulativeBaseVolume,
    cumulativeQuoteVolume: r.cumulativeQuoteVolume,
    tradeCount: r.tradeCount,
    baseDecimals: r.baseDecimals,
    quoteDecimals: r.quoteDecimals,
    createdAtTimestamp: r.createdAtTimestamp,
  };

  switch (r.marketType) {
    case "BINARY":
      return {
        ...base,
        marketType: "BINARY",
        marketId: asHex(r.marketId ?? unreachable("BINARY row missing marketId")),
        marketAddress: asAddress(r.marketAddress ?? unreachable("BINARY row missing marketAddress")),
        yesTokenId: r.yesTokenId ?? unreachable("BINARY row missing yesTokenId"),
        noTokenId: r.noTokenId ?? unreachable("BINARY row missing noTokenId"),
        collateral: asAddress(r.collateral ?? unreachable("BINARY row missing collateral")),
        asset: r.asset ?? unreachable("BINARY row missing asset"),
        question: r.question ?? unreachable("BINARY row missing question"),
        status: r.status ?? unreachable("BINARY row missing status"),
        oracleQuestion: r.oracleQuestion,
        oracleQuestionId: r.oracleQuestionId,
        strike: r.strike ?? unreachable("BINARY row missing strike"),
        tradingStart: r.tradingStart ?? unreachable("BINARY row missing tradingStart"),
        expiry: r.expiry ?? unreachable("BINARY row missing expiry"),
        winningOutcome: r.winningOutcome,
        payoutNumerators: r.payoutNumerators,
        payoutDenominator: r.payoutDenominator,
        resolvedAtBlock: r.resolvedAtBlock,
        resolvedAtTimestamp: r.resolvedAtTimestamp,
        createdByTx: asHexOrNull(r.createdByTx),
        creator: asAddressOrNull(r.creator),
        voided: r.voided,
        backing: r.backing,
        nonce: r.nonce,
        finalized: r.finalized,
        netBacking: r.netBacking,
        context: asHexOrNull(r.context),
        intervalSec: r.intervalSec,
        // Stamp the derived timeframe label so every list/point read serves
        // `interval` ("15m"/"1h"/"4h") ready-to-render — the single place the
        // `intervalSec → label` mapping lives (see interval.ts).
        interval: Interval.marketIntervalLabel(r),
        operatorId: r.operatorId,
        venueId: asHexOrNull(r.venueId),
      } satisfies BinaryMarket;

    case "SPOT":
      return {
        ...base,
        marketType: "SPOT",
        baseToken: asAddress(r.baseToken ?? unreachable("SPOT row missing baseToken")),
        quoteToken: asAddress(r.quoteToken ?? unreachable("SPOT row missing quoteToken")),
        baseSymbol: r.baseSymbol,
        quoteSymbol: r.quoteSymbol,
        baseIsNative: r.baseIsNative ?? unreachable("SPOT row missing baseIsNative"),
        tickSize: r.tickSize ?? unreachable("SPOT row missing tickSize"),
        lotSize: r.lotSize ?? unreachable("SPOT row missing lotSize"),
        minQuantity: r.minQuantity ?? unreachable("SPOT row missing minQuantity"),
        markPrice: r.markPrice,
        rawMidpoint: r.rawMidpoint,
        markPriceUpdatedAt: r.markPriceUpdatedAt,
        stopRegistry: asAddressOrNull(r.stopRegistry),
      } satisfies SpotMarket;

    case "PERP":
      return {
        ...base,
        marketType: "PERP",
        baseToken: asAddress(r.baseToken ?? unreachable("PERP row missing baseToken")),
        quoteToken: asAddress(r.quoteToken ?? unreachable("PERP row missing quoteToken")),
        baseSymbol: r.baseSymbol,
        quoteSymbol: r.quoteSymbol,
        baseIsNative: r.baseIsNative ?? unreachable("PERP row missing baseIsNative"),
        tickSize: r.tickSize ?? unreachable("PERP row missing tickSize"),
        lotSize: r.lotSize ?? unreachable("PERP row missing lotSize"),
        minQuantity: r.minQuantity ?? unreachable("PERP row missing minQuantity"),
        marginBank: asAddress(r.marginBank ?? unreachable("PERP row missing marginBank")),
        initialMarginBps: r.initialMarginBps ?? unreachable("PERP row missing initialMarginBps"),
        stopRegistry: asAddressOrNull(r.stopRegistry),
        markPrice: r.markPrice,
        markPriceUpdatedAt: r.markPriceUpdatedAt,
        fundingRate: r.fundingRate,
        cumulativeFundingPerUnit: r.cumulativeFundingPerUnit,
        indexPrice: r.indexPrice,
        fundingUpdatedAt: r.fundingUpdatedAt,
        fundingWindowSec: r.fundingWindowSec,
        fundingIntervalSec: r.fundingIntervalSec,
        openInterest: r.openInterest,
        openInterestUpdatedAt: r.openInterestUpdatedAt,
      } satisfies PerpMarket;

    default:
      return unreachable(`unknown marketType ${String(r.marketType)}`);
  }
}

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
export function toMarkets(rows: readonly RawMarketRow[]): Market[] {
  const out: Market[] = [];
  for (const r of rows) {
    try {
      out.push(toMarket(r));
    } catch (e) {
      // Only OUR invariant — a genuinely unexpected error (OOM, a bug in the
      // mapping itself) must not be swallowed as "one skippable row".
      if (!(e instanceof InvariantError)) throw e;
    }
  }
  return out;
}

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
export async function listMarkets(
  opts: { marketType?: MarketType; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<Market[]> {
  const where: Record<string, unknown> = {};
  if (opts.marketType) where.marketType = { _eq: opts.marketType };
  const data = await IndexerRead.gqlRequest(
    MarketsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return toMarkets(data.Market);
}

// prettier-ignore
const RegistryMarketsQuery = graphql(`
  query RegistryMarkets($where: Market_bool_exp!, $limit: Int, $offset: Int) {
    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {
      ...MarketFields
    }
  }
`);

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
export async function listRegistryMarkets(indexerUrl: string): Promise<Market[]> {
  // Typed against the generated input so a bogus column or comparison operator is a
  // compile error here, not a Hasura error at runtime.
  const where: Market_Bool_Exp = {
    _or: [{ marketType: { _neq: "BINARY" } }, { finalized: { _eq: false } }],
  };
  const out: Market[] = [];
  const PAGE = 500;
  for (let offset = 0; ; offset += PAGE) {
    const data = await IndexerRead.gqlRequest(RegistryMarketsQuery, { where, limit: PAGE, offset }, indexerUrl);
    out.push(...toMarkets(data.Market));
    if (data.Market.length < PAGE) break;
  }
  return out;
}

/**
 *  Server-side COUNT of markets, optionally of one type (Hasura `Market_aggregate`)
 *  — so a spot/perp list paginates against a real total without fetching rows.
 *  Privileged `_aggregate` role (server-only), like {@link countBinaryMarkets}.
 */
export async function countMarkets(
  opts: { marketType?: MarketType } = {},
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<number> {
  const where: Record<string, unknown> = {};
  if (opts.marketType) where.marketType = { _eq: opts.marketType };
  return IndexerRead.aggregateCount("Market", "Market_bool_exp", where, indexerUrl, headers);
}

/**
 *  Fetch one market of either type by primary key, as the {@link Market} union
 *  (null if absent). {@link getBinaryMarket} is the binary-narrowed counterpart.
 */
export async function getMarket(id: string, indexerUrl: string): Promise<Market | null> {
  const data = await IndexerRead.gqlRequest(MarketByPkQuery, { id }, indexerUrl);
  return data.Market_by_pk ? toMarket(data.Market_by_pk) : null;
}

/**
 *  Fetch one market by its on-chain BinaryMarket ADDRESS (not the bytes32 marketId
 *  primary key). The market PK is `marketId`, so a caller that only holds the
 *  address (e.g. an explorer route keyed on the market clone address) must resolve
 *  through this. Newest first so a recycled/rebound address returns its current
 *  market. Null if the indexer has no row yet.
 */
export async function getMarketByAddress(
  marketAddress: string,
  indexerUrl: string,
): Promise<Market | null> {
  const data = await IndexerRead.gqlRequest(
    MarketByAddressQuery,
    { a: marketAddress.toLowerCase() },
    indexerUrl,
  );
  return data.Market?.[0] ? toMarket(data.Market[0]) : null;
}

/** Binary-narrowed {@link getMarketByAddress}. */
export async function getBinaryMarketByAddress(
  marketAddress: string,
  indexerUrl: string,
): Promise<BinaryMarket | null> {
  const m = await getMarketByAddress(marketAddress, indexerUrl);
  return m && isBinaryMarket(m) ? m : null;
}

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
export async function listBinaryMarkets(
  opts: BinaryMarketFilter & { limit?: number } = {},
  indexerUrl: string,
): Promise<BinaryMarket[]> {
  const where = applyBinaryFilter({ marketType: { _eq: "BINARY" } }, opts);
  const orderBy = binaryOrderBy(opts.orderBy, { createdAtTimestamp: "desc" });
  const data = await IndexerRead.gqlRequest(
    BinaryMarketsQuery,
    { where, orderBy, limit: opts.limit ?? 50 },
    indexerUrl,
  );
  return toMarkets(data.Market).filter(isBinaryMarket);
}

/**
 *  Distinct (operatorId, venueId) pairs present across binary markets — the
 *  cheap server-side source for a venue filter's options (via Hasura
 *  `distinct_on`), so a UI never has to fetch every market just to learn which
 *  venues exist. Markets with a null attribution are excluded.
 */
export async function listBinaryVenueIds(
  indexerUrl: string,
): Promise<{ operatorId: number; venueId: string }[]> {
  // distinct_on the PAIR, not venueId alone: venue ids are operator-scoped, so
  // distinct on venueId alone could collapse an operator's venues. Hasura
  // requires the distinct_on columns to lead order_by.
  const data = await IndexerRead.gqlRequest(BinaryOriginPairsQuery,
    {},
    indexerUrl,
  );
  return data.Market.filter(
    (m): m is { operatorId: number; venueId: string } => m.venueId != null && m.operatorId != null,
  );
}

/**
 *  Distinct asset symbols present across binary markets — the cheap
 *  server-side source for an asset filter's options (Hasura `distinct_on`), so
 *  a UI never fetches every market to learn which assets exist.
 */
export async function listBinaryAssets(indexerUrl: string): Promise<string[]> {
  const data = await IndexerRead.gqlRequest(BinaryAssetsQuery,
    {},
    indexerUrl,
  );
  return data.Market.map((m) => m.asset).filter((a): a is string => a != null && a.length > 0);
}

/**
 *  Server-side COUNT of binary markets matching a filter, split by lifecycle
 *  phase (`"live"` = `expiry > now`, `"past"` = `expiry <= now`). Uses Hasura
 *  `Market_aggregate` so a total never requires fetching rows — the browser
 *  learns "1,240 live" in O(1), not by loading 1,240 markets.
 */
export async function countBinaryMarkets(
  opts: BinaryMarketFilter & { phase: "live" | "past"; nowSec?: number },
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<number> {
  // `expiry` is a `numeric` column, so its comparison takes a STRING (Hasura also
  // accepts a JSON number and coerces it, but the schema-derived type is the
  // contract — send what it declares).
  const now = String(opts.nowSec ?? Math.floor(Date.now() / 1000));
  const expiry = opts.phase === "live" ? { _gt: now } : { _lte: now };
  const where = applyBinaryFilter({ marketType: { _eq: "BINARY" }, expiry }, opts);
  return IndexerRead.aggregateCount("Market", "Market_bool_exp", where, indexerUrl, headers);
}

/**
 *  Fetch one binary market by primary key (lowercased bytes32 marketId),
 *  narrowed to {@link BinaryMarket} (null if absent or not binary).
 */
export async function getBinaryMarket(id: string, indexerUrl: string): Promise<BinaryMarket | null> {
  const m = await getMarket(id, indexerUrl);
  return m && isBinaryMarket(m) ? m : null;
}

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
export async function getMarketFees(marketId: string, indexerUrl: string): Promise<MarketFees | null> {
  const data = await IndexerRead.gqlRequest(MarketFeesQuery,
    { id: marketId.toLowerCase() },
    indexerUrl,
  );
  return data.MarketVenue_by_pk;
}

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
export async function listSpotMarkets(
  opts: SpotMarketFilter & { limit?: number } = {},
  indexerUrl: string,
): Promise<SpotMarket[]> {
  const where: Market_Bool_Exp = { marketType: { _eq: "SPOT" } };
  if (opts.baseSymbol != null) where.baseSymbol = { _eq: opts.baseSymbol };
  if (opts.quoteSymbol != null) where.quoteSymbol = { _eq: opts.quoteSymbol };
  const data = await IndexerRead.gqlRequest(
    SpotMarketsQuery,
    { where, limit: opts.limit ?? 50 },
    indexerUrl,
  );
  return toMarkets(data.Market).filter(isSpotMarket);
}

/**
 *  One spot market by pool address, or null (also null if the id resolves to
 *  another market kind).
 */
export async function getSpotMarket(id: string, indexerUrl: string): Promise<SpotMarket | null> {
  const m = await getMarket(id.toLowerCase(), indexerUrl);
  return m && isSpotMarket(m) ? m : null;
}

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
export async function getMarketStatusHistory(
  marketId: string,
  indexerUrl: string,
): Promise<MarketStatusUpdate[]> {
  const data = await IndexerRead.gqlRequest(MarketStatusHistoryQuery,
    { id: marketId.toLowerCase() },
    indexerUrl,
  );
  return data.MarketStatusUpdate;
}

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
export async function listPerpMarkets(
  opts: PerpMarketFilter & { limit?: number } = {},
  indexerUrl: string,
): Promise<PerpMarket[]> {
  const where: Market_Bool_Exp = { marketType: { _eq: "PERP" } };
  if (opts.baseSymbol != null) where.baseSymbol = { _eq: opts.baseSymbol };
  if (opts.quoteSymbol != null) where.quoteSymbol = { _eq: opts.quoteSymbol };
  const data = await IndexerRead.gqlRequest(
    PerpMarketsQuery,
    { where, limit: opts.limit ?? 50 },
    indexerUrl,
  );
  return toMarkets(data.Market).filter(isPerpMarket);
}

/**
 *  Fetch one perp market by primary key (lowercased pool address), narrowed to
 *  {@link PerpMarket} (null if absent or not a perp).
 */
export async function getPerpMarket(id: string, indexerUrl: string): Promise<PerpMarket | null> {
  const m = await getMarket(id.toLowerCase(), indexerUrl);
  return m && isPerpMarket(m) ? m : null;
}

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
export async function listLiveBinaryMarkets(
  filter: LiveBinaryMarketsFilter = {},
  indexerUrl: string,
): Promise<BinaryMarket[]> {
  // String, not number: `expiry` is a `numeric` column (see countBinaryMarkets).
  const now = String(filter.nowSec ?? Math.floor(Date.now() / 1000));
  const where = applyBinaryFilter({ marketType: { _eq: "BINARY" }, expiry: { _gt: now } }, filter);
  // Live keeps closingSoon (expiry asc) as its default; an explicit orderBy overrides.
  const orderBy = binaryOrderBy(filter.orderBy, { expiry: "asc" });
  const data = await IndexerRead.gqlRequest(
    LiveBinaryMarketsQuery,
    { where, orderBy, limit: filter.limit ?? 50, offset: filter.offset ?? 0 },
    indexerUrl,
  );
  return toMarkets(data.Market).filter(isBinaryMarket);
}

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
export async function listPastBinaryMarkets(
  opts: PastBinaryMarketsOptions = {},
  indexerUrl: string,
): Promise<BinaryMarket[]> {
  // String, not number: `expiry` is a `numeric` column (see countBinaryMarkets).
  const now = String(opts.nowSec ?? Math.floor(Date.now() / 1000));
  const where = applyBinaryFilter({ marketType: { _eq: "BINARY" }, expiry: { _lte: now } }, opts);
  const data = await IndexerRead.gqlRequest(
    PastBinaryMarketsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return toMarkets(data.Market).filter(isBinaryMarket);
}

/**
 *  Batch-fetch the OPENING price (the reference-question oracle answer) for many
 *  binary markets in ONE pair of round-trips — for list views that want to show
 *  each up/down market's opening price without an N+1 fan-out. Returns a map of
 *  lowercased marketId → raw `numericValue` (or `null` when the reference has no
 *  answer yet / the market has no reference question). Format with the market's
 *  oracle price scale (see the explorer's `fmtOraclePrice`).
 */
export async function getOpeningPrices(
  marketIds: string[],
  indexerUrl: string,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const ids = marketIds.map((m) => m.toLowerCase());
  if (ids.length === 0) return out;
  // market → its reference (opening-price) question id.
  const links = await IndexerRead.gqlRequest(OpeningRefsQuery,
    { ids },
    indexerUrl,
  );
  const marketToQid = new Map<string, string>();
  const qids = new Set<string>();
  for (const l of links.MarketReferenceLink) {
    marketToQid.set(l.market.toLowerCase(), String(l.referenceQuestionId));
    qids.add(String(l.referenceQuestionId));
  }
  if (qids.size === 0) return out;
  // reference question → numeric answer (OracleAnswer.id == oracleQuestionId).
  const answers = await IndexerRead.gqlRequest(OpeningAnswersQuery,
    { qids: [...qids] },
    indexerUrl,
  );
  const qToVal = new Map<string, string | null>();
  for (const a of answers.OracleAnswer) qToVal.set(String(a.id), a.numericValue);
  for (const [market, qid] of marketToQid) out[market] = qToVal.get(qid) ?? null;
  return out;
}

/**
 *  Map a {@link BinaryMarketOrderBy} to a Hasura `order_by` object, or fall back
 *  to `fallback` when unset. All keys are indexed Market columns.
 */
function binaryOrderBy(
  orderBy: BinaryMarketOrderBy | undefined,
  fallback: Market_Order_By,
): Market_Order_By {
  switch (orderBy) {
    case "newest":
      return { createdAtTimestamp: "desc" };
    case "closingSoon":
      return { expiry: "asc" };
    case "volume":
      return { cumulativeQuoteVolume: "desc" };
    case "tradeCount":
      return { tradeCount: "desc" };
    default:
      return fallback;
  }
}

/**
 *  Add the set fields of a {@link BinaryMarketFilter} to a Hasura `where` object.
 *  Only non-null fields are added — a bare `{_eq: undefined}` / `{_eq: null}`
 *  would collapse to "IS NULL" and silently drop rows.
 */
function applyBinaryFilter(where: Market_Bool_Exp, f: BinaryMarketFilter): Market_Bool_Exp {
  if (f.operatorId != null) where.operatorId = { _eq: f.operatorId };
  if (f.venueId != null) where.venueId = { _eq: f.venueId.toLowerCase() };
  if (f.asset != null) where.asset = { _eq: f.asset };
  if (f.intervalSec != null) where.intervalSec = { _eq: String(f.intervalSec) };
  if (f.status != null) where.clobStatus = { _eq: f.status };
  if (f.creator != null) where.creator = { _eq: f.creator.toLowerCase() };
  const needle = f.search?.trim();
  if (needle) {
    const pattern = `%${needle}%`;
    where._or = [{ asset: { _ilike: pattern } }, { question: { _ilike: pattern } }];
  }
  return where;
}

// prettier-ignore
const MarketsQuery = graphql(`
  query Markets($where: Market_bool_exp!, $limit: Int, $offset: Int) {
    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {
      ...MarketFields
    }
  }
`);

// prettier-ignore
const MarketByPkQuery = graphql(`
  query MarketByPk($id: String!) {
    Market_by_pk(id: $id) {
      ...MarketFields
    }
  }
`);

// prettier-ignore
const MarketByAddressQuery = graphql(`
  query MarketByAddress($a: String!) {
    Market(
      where: { marketAddress: { _eq: $a } }
      order_by: { createdAtTimestamp: desc }
      limit: 1
    ) {
      ...MarketFields
    }
  }
`);

// prettier-ignore
const BinaryMarketsQuery = graphql(`
  query BinaryMarkets($where: Market_bool_exp!, $orderBy: [Market_order_by!], $limit: Int) {
    Market(where: $where, order_by: $orderBy, limit: $limit) {
      ...MarketFields
    }
  }
`);

// prettier-ignore
const SpotMarketsQuery = graphql(`
  query SpotMarkets($where: Market_bool_exp!, $limit: Int) {
    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {
      ...MarketFields
    }
  }
`);

// prettier-ignore
const PerpMarketsQuery = graphql(`
  query PerpMarkets($where: Market_bool_exp!, $limit: Int) {
    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {
      ...MarketFields
    }
  }
`);

// prettier-ignore
const LiveBinaryMarketsQuery = graphql(`
  query LiveBinaryMarkets(
    $where: Market_bool_exp!
    $orderBy: [Market_order_by!]
    $limit: Int!
    $offset: Int!
  ) {
    Market(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {
      ...MarketFields
    }
  }
`);

// prettier-ignore
const PastBinaryMarketsQuery = graphql(`
  query PastBinaryMarkets($where: Market_bool_exp!, $limit: Int!, $offset: Int!) {
    Market(where: $where, order_by: { expiry: desc }, limit: $limit, offset: $offset) {
      ...MarketFields
    }
  }
`);

// ---------------------------------------------------------------------------
// Typed documents for the reads above. Hoisted here (rather than inline at each
// call site) to keep this file's reading order: functions first, GraphQL after.
// Result and variable types are derived from the committed schema snapshot.

// prettier-ignore
const BinaryOriginPairsQuery = graphql(`
  query BinaryOriginPairs {
         Market(
           distinct_on: [operatorId, venueId],
           where: {marketType: {_eq: "BINARY"}, operatorId: {_is_null: false}, venueId: {_is_null: false}},
           order_by: [{operatorId: asc}, {venueId: asc}]
         ) {
           operatorId
           venueId
         }
       }
`);

// prettier-ignore
const BinaryAssetsQuery = graphql(`
  query BinaryAssets {
         Market(distinct_on: asset, where: {marketType: {_eq: "BINARY"}, asset: {_is_null: false}}, order_by: {asset: asc}) {
           asset
         }
       }
`);

// prettier-ignore
const MarketFeesQuery = graphql(`
  query MarketFees($id: String!) {
         MarketVenue_by_pk(id: $id) {
           operatorId venueId feeRecipient
           makerFeeBps takerFeeBps maxBuilderFeeBps routingFeeBps settlementFeeBps settlementFeesCollected
         }
       }
`);

// prettier-ignore
const MarketStatusHistoryQuery = graphql(`
  query MarketStatusHistory($id: String!) {
         MarketStatusUpdate(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {
           oldStatus newStatus blockNumber timestamp txHash
         }
       }
`);

// prettier-ignore
const OpeningAnswersQuery = graphql(`
  query OpeningAnswers($qids: [String!]) {
         OracleAnswer(where: {id: {_in: $qids}}) { id numericValue }
       }
`);

// prettier-ignore
const OpeningRefsQuery = graphql(`
  query OpeningRefs($ids: [String!]) {
         MarketReferenceLink(where: {market_id: {_in: $ids}}) { market: market_id referenceQuestionId }
       }
`);

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
export async function getMarketOnchain(
  marketId: Hex,
  sources: MarketOnchainSources,
  client: PublicClient,
): Promise<MarketOnchain> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(marketId)) {
    throw new InvalidInputError(
      "getMarketOnchain now takes the bytes32 marketId " +
        "(0.13.0 breaking change) — got a non-32-byte value. Resolve the id via " +
        "listBinaryMarkets / the indexer instead of passing a contract address.",
    );
  }
  const pc = client;
  // 1. The module record: market/pool addresses, ids, collateral, window, nonce.
  const [rec, nonce] = await Promise.all([
    pc.readContract({
      address: sources.module,
      abi: ModuleAbi.binaryModuleReadAbi,
      functionName: "markets",
      args: [marketId],
    }),
    pc.readContract({
      address: sources.module,
      abi: ModuleAbi.binaryModuleReadAbi,
      functionName: "marketNonce",
      args: [marketId],
    }),
  ]);
  const collateral = rec[3];
  const marketAddress = rec[8];
  const pool = rec[9];
  const yesId = rec[10];
  const noId = rec[11];
  const expiry = rec[13];
  if (/^0x0{40}$/.test(marketAddress)) {
    throw new InvalidInputError(`unknown marketId ${marketId} on the module`);
  }
  // 2. The market contract's live lifecycle state.
  const m = { address: marketAddress, abi: ReadsAbi.binaryMarketReadAbi } as const;
  const [outcomeToken, status, poolBacking, payoutNumerators, isResolved, isVoided, decimals] =
    await Promise.all([
      pc.readContract({ ...m, functionName: "outcomeToken" }),
      pc.readContract({ ...m, functionName: "status" }),
      pc.readContract({ ...m, functionName: "backing" }),
      pc.readContract({ ...m, functionName: "payoutNumerators" }),
      pc.readContract({ ...m, functionName: "isResolved" }),
      pc.readContract({ ...m, functionName: "isVoided" }),
      Balances.cachedErc20Decimals(collateral, pc, Store.DECIMALS),
    ]);
  // Settlement v3 stores a payout VECTOR, not a single winner. Derive the winning
  // index as the argmax (a resolved binary win is [D,0] or [0,D]; a void is the
  // uniform [D/2,D/2] → argmax 0, disambiguated by `isVoided`). Empty vector
  // (unresolved) → 0. Always gate a UI on `isResolved`/`isVoided`, never this alone.
  const vec = (payoutNumerators as bigint[]) ?? [];
  let winningOutcome = 0;
  for (let i = 1; i < vec.length; i++) {
    if ((vec[i] ?? 0n) > (vec[winningOutcome] ?? 0n)) winningOutcome = i;
  }
  // 3. Post-finalize fallback: `market.backing()` reads 0 once the pool swept its
  // backing to settlement — the settlement record's NET backing is the live pot.
  let backing = poolBacking;
  let finalized = false;
  if (sources.settlement) {
    const record = (await pc.readContract({
      address: sources.settlement,
      abi: ReadsAbi.binarySettlementAbi,
      functionName: "getSettlement",
      args: [Ids.marketKey(yesId)],
    })) as { backing: bigint; finalized: boolean };
    if (record.finalized) {
      finalized = true;
      backing = record.backing;
    }
  }
  return {
    marketAddress,
    outcomeToken: outcomeToken,
    yesId,
    noId,
    pool,
    nonce,
    collateral,
    status: Number(status),
    backing,
    finalized,
    expiry,
    decimals,
    winningOutcome: Number(winningOutcome),
    isResolved: isResolved,
    isVoided: isVoided,
  };
}

/**
 *  A pool's creator — its first-deploy market creator, the only party that can
 *  reuse it (settlement-extraction v2 creator-scoped pool reuse). Zero address
 *  for a pool the module never deployed. Pure chain read (no signer) — the
 *  indexer-backed equivalent is `getPool(address)`'s `creator`.
 */
export async function getPoolCreator(
  pool: Address,
  module: Address,
  client: PublicClient,
): Promise<Address> {
  return client.readContract({
    address: module,
    abi: ModuleAbi.binaryModuleReadAbi,
    functionName: "poolCreator",
    args: [pool],
  });
}

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

export async function getContractMeta(
  address: Address,
  opts: { proxy?: boolean },
  client: PublicClient,
): Promise<ContractMeta> {
  const zero = "0x0000000000000000000000000000000000000000";
  const [owner, impl, balance] = await Promise.all([
    client.readContract({ address, abi: _ownableAbi, functionName: "owner" }).catch(
      () => null,
    ),
    opts.proxy
      ? client
          .getStorageAt({ address, slot: _EIP1967_IMPL_SLOT })
          .then((raw) => {
            if (!raw || raw.length < 42) return null;
            // The ANNOTATION is load-bearing: an uncontextualized template literal
            // infers as `string`, so without it this needs a cast. With it, tsc
            // CHECKS the literal against `0x${string}` instead of being told to
            // trust it — the `0x` prefix is right there in the expression.
            const addr: Address = `0x${raw.slice(-40)}`;
            return addr.toLowerCase() === zero ? null : addr;
          })
          .catch(() => null)
      : Promise.resolve(null),
    client.getBalance({ address }).catch(() => 0n),
  ]);
  return { owner, impl, balance };
}

// ----------------------------------------------------------------- contract diagnostics
// Ops-dashboard reads (the /system page): owner(), the EIP-1967 implementation
// slot (proxies), and native balance. Routed through the SDK's own client so the
// page never spins up a second viem transport of its own.

const _ownableAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

// keccak256("eip1967.proxy.implementation") - 1
const _EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
