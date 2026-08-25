// Perp history — the indexed record of funding, margin and liquidation events.
//
// PERP-ONLY entities, each its own stream: funding payments (per position, per
// settlement), margin events (deposits/withdrawals), liquidations, and the
// funding-rate / open-interest time series a chart reads.

// ---------------------------------------------------------------- perp history
// The perp ACCOUNT plane the indexer records (A6/A7): funding payments, margin
// deposits/withdraws/locks, liquidations, and per-pool funding-rate + OI
// history. Current position/margin state is a CHAIN read (getPerpPosition /
// getMarginAccount / getAccountHealth) — these are the append-only history.

import * as IndexerRead from "../indexerRead.js";
import { graphql } from "../gql/gql.js";
// Type-only, for the TSDoc cross-references below — the module split moved PerpMarket
// into markets.ts, which silently broke links that resolved while both lived in query.ts.
import type { PerpMarket } from "../markets.js";
/**
 *  A signed funding payment (mirror of the indexer `FundingPayment` entity).
 *  `amount` is signed raw collateral (negative = paid, positive = received).
 */
export type FundingPayment = {
  /** Payment id (`${txHash}_${logIndex}`). */
  id: string;
  /** Account (lowercased). */
  account: string;
  /** Perp pool (lowercased); null when unlinked. */
  pool: string | null;
  /** Signed funding payment (raw collateral; positive = received, negative = paid). */
  amount: string;
  /** Timestamp (unix seconds) the funding settled. */
  timestamp: string;
  /** Tx hash the settlement landed in. */
  txHash: string;
};

/** A margin-account movement (mirror of the indexer `MarginEvent` entity). */
export type MarginEvent = {
  /** Event id (`${txHash}_${logIndex}`). */
  id: string;
  /** Account (lowercased). */
  account: string;
  /** Deposit | Withdraw | Locked | Unlocked | Credited. */
  kind: string;
  /**
   *  Perp pool the (un)lock targets (lowercased); null on Deposit/Withdraw/Credited,
   *  which are account-scoped. Was omitted from the query selection despite existing on
   *  the entity, so it read as always-null.
   */
  pool: string | null;
  /** Collateral moved (raw units). */
  amount: string;
  /** Who granted the credit (`Credited` only) — the voucher/credit rail. */
  granter: string | null;
  /** Timestamp (unix seconds) of the movement. */
  timestamp: string;
  /** Tx hash the movement landed in. */
  txHash: string;
};

/**
 *  A liquidation event (mirror of the indexer `LiquidationEvent` entity). All
 *  numeric fields are raw units; any may be null when the source event didn't
 *  carry it.
 */
export type LiquidationEvent = {
  /** Event id (`${txHash}_${logIndex}`). */
  id: string;
  /** Liquidated account (lowercased). */
  account: string;
  /** Perp pool (lowercased); null on account-scoped rows. */
  pool: string | null;
  /**
   *  WHICH stage of the liquidation/deleveraging waterfall this row is. **Read this
   *  first** — the rows are stages of one mechanism, not repetitions of one event, and
   *  without it an ADL leg is indistinguishable from a liquidation:
   *
   *    AccountLiquidated         account-level summary (positionsProcessed, stageReached)
   *    PositionLiquidated        per-position liquidation (size, price)
   *    PositionSkipped           below min quantity, left in place (size)
   *    PositionTakenOver         stage-4 backstop takeover (counterparty = bidder, price)
   *    AutoDeleveraged           ADL leg (counterparty absorbed it; price = bankruptcy price)
   *    PositionTransferred       stage-4 transfer (counterparty, size)
   *    CloseOutMarginSettled     stage-4 close-out margin flow (counterparty)
   *    BadDebtAbsorbed           the fund PAID (insuranceCovered, deficit, counterparty = fund)
   *    ResidualBadDebt           uncovered, INSOLVENT hole after the waterfall (badDebt)
   *    AdlPriceCapacityExhausted terminal: hole exceeds aggregate position capacity (badDebt)
   *    ResidualBackedByOpenPnl   hole fully backed by the account's OWN open PnL (deficit, equity)
   *    CoverageDeclined          coverage the equity cap DEFERRED (coverageDeclined)
   *    AdlSessionDiscarded       ADL session abandoned; amount is on the same-tx BadDebtAbsorbed row
   *    AdlCapacityShortfall      ADL could not source enough capacity (size)
   */
  kind: string;
  /**
   *  Signed size for the leg, where the event carries one (raw base units).
   *
   *  Signed, not absolute: `PositionLiquidated` emits a signed `sizeDelta`, and the sign
   *  is the side being closed.
   */
  size: string | null;
  /**
   *  Price for the leg (raw quote per whole base) — mark price, takeover price, or ADL
   *  bankruptcy price depending on `kind`.
   */
  price: string | null;
  /**
   *  The other side of the leg: the ADL counterparty who absorbed it, the takeover
   *  bidder, the transfer/close-out peer, or — on `BadDebtAbsorbed` — the Insurance Fund
   *  that covered the debt. Null on rows with no counterparty.
   */
  counterparty: string | null;
  /** Penalty charged (raw collateral; reserved — not carried by current events). */
  penalty: string | null;
  /**
   *  The LEVEL of the account's uncovered, genuinely insolvent realized hole after this
   *  `liquidate()` call — `ResidualBadDebt`, or `AdlPriceCapacityExhausted` for the
   *  terminal price-capacity case (raw collateral).
   *
   *  **A level, not a flow — never SUM this across rows.** The underlying `residual` is a
   *  post-call state sample, so a later call on the same account re-reports the same
   *  (possibly changed) hole, and a stage-5 residual can co-fire with a terminal ADL one
   *  in a single call: two samples of one hole at two stages.
   *
   *  Sound aggregates: the **latest row per account** is that account's currently known
   *  uncovered hole (an upper bound — a deposit can repay it with no row here, see
   *  {@link MarginEvent}), and the **sum of those latest rows across accounts** is
   *  point-in-time system bad debt.
   *
   *  Deliberately narrow: what the fund actually paid is {@link LiquidationEvent.insuranceCovered},
   *  a gross pre-coverage hole is {@link LiquidationEvent.deficit}, and a deferred coverage
   *  decision is {@link LiquidationEvent.coverageDeclined}. Collateral that merely MOVED
   *  between accounts is in `collateralAmount`.
   */
  badDebt: string | null;
  /**
   *  Wei the Insurance Fund ACTUALLY moved — `BadDebtAbsorbed` only (raw collateral).
   *
   *  A **flow**, and the only summable amount here: rows are disjoint payments, so a SUM
   *  over any slice is exact fund outflow. A `insuranceCovered` below the same row's
   *  `deficit` does NOT mean the fund was underfunded — part of a hole is unattributable
   *  (a pre-existing balance, or funding owed), and that remainder surfaces as a
   *  `ResidualBadDebt` row instead.
   *
   *  `AdlSessionDiscarded` deliberately leaves this null: its absorption is the same
   *  `absorbBadDebt` call that emits `BadDebtAbsorbed` in the same transaction, so
   *  counting both would double the outflow. Join on `txHash`.
   */
  insuranceCovered: string | null;
  /**
   *  The GROSS realized hole a stage reported, before coverage (raw collateral) —
   *  `BadDebtAbsorbed` (the full negative balance) and `ResidualBackedByOpenPnl` (a hole
   *  the account's own open profit fully backs, so it is NOT bad debt; read `equity`
   *  alongside it, and note it becomes bad debt if the position reverses).
   *
   *  **A level, and overlapping per-stage views of one hole — never SUM, and never add to
   *  `badDebt`.** When `BadDebtAbsorbed` and `ResidualBadDebt` both fire in one call the
   *  balance moved only by what the fund paid, so `badDebt == deficit - insuranceCovered`
   *  for that call: a useful cross-row audit check, and the direct proof that summing the
   *  gross figure with the residual double-counts.
   */
  deficit: string | null;
  /**
   *  Attributable coverage the stage-5 equity cap did NOT pay — `CoverageDeclined` only
   *  (raw collateral).
   *
   *  A **flow** and summable as "total coverage deferred", but NOT a loss: the fund
   *  underwrites insolvency and the account was not insolvent by that much at that
   *  moment. If the backing later evaporates the hole returns as a pre-existing negative
   *  balance, which is unattributable by definition, so it is written off rather than
   *  re-declined (accepted policy, OQ-13).
   */
  coverageDeclined: string | null;
  /**
   *  Collateral that MOVED rather than was lost — `PositionTransferred` (collateral
   *  following the position) and `CloseOutMarginSettled`. Kept separate from `badDebt` so
   *  neither aggregate contaminates the other.
   */
  collateralAmount: string | null;
  /** Account equity where the event reports it (`ResidualBackedByOpenPnl`; signed). */
  equity: string | null;
  /** Positions processed (`AccountLiquidated` only). */
  positionsProcessed: string | null;
  /** Highest waterfall stage reached (`AccountLiquidated` only). */
  stageReached: number | null;
  /** Margin status before / after (`AccountLiquidated` only). */
  marginStatusBefore: number | null;
  marginStatusAfter: number | null;
  /** Timestamp (unix seconds) of the row. */
  timestamp: string;
  blockNumber: string;
  /** Tx hash the row landed in. Stages of one liquidation share it. */
  txHash: string;
};

/**
 *  A funding-rate history point (mirror of the indexer `FundingRateUpdate`
 *  entity) — the append-only counterpart to the market row's overwrite-only
 *  funding fields.
 */
export type FundingRateUpdate = {
  /** Update id (`${pool}_${block}_${logIndex}`). */
  id: string;
  /** Perp pool (lowercased). */
  pool: string;
  /**
   *  Rate applied to THIS settlement, per CALCULATION WINDOW, 1e18-scaled, signed.
   *  Normalize with `fundingWindowSec` on this same row — see
   *  {@link normalizeFundingRate}.
   */
  fundingRate: string;
  /**
   *  Cumulative funding index AFTER this settlement (1e18 x quote units per whole base,
   *  signed, NOT monotonic). The ground truth for accrual: realized funding over any
   *  range is exactly `(end - start) / 1e18` raw quote units per whole base, with no
   *  interpolation and no gap reasoning. See {@link realizedFundingPerBase}.
   */
  cumulativeFundingPerUnit: string;
  /** Oracle index price at the update (raw quote per whole base, 18dp). */
  indexPrice: string;
  /**
   *  Best-effort mark-price cross-check. NULL when the contract emitted its 0 sentinel
   *  for a stale/reverting mark feed — never a price of zero. Unrelated to the premium
   *  driving the rate, which is book-MIDPOINT vs index.
   */
  markPrice: string | null;
  /** Intervals spanned, UNCLAMPED, as emitted. Can exceed n after an outage. */
  intervalsSettled: string;
  /**
   *  What actually accrued: `min(intervalsSettled, n)`. The excess is forgiven by the
   *  contract's catch-up cap, and the forgiven intervals are the OLDEST ones.
   */
  intervalsAccrued: string;
  /** The rate's denominator in seconds, in force at this emit. Makes the row self-normalizing. */
  fundingWindowSec: number;
  /** Settlement cadence in seconds, in force at this emit. */
  fundingIntervalSec: number;
  /**
   *  Wall-clock span this settlement's accrual covers — the last `intervalsAccrued`
   *  intervals ending at the settlement anchor. It reaches BACKWARDS from the emit, up
   *  to a full window, which is why a funding chart must distribute a row across the
   *  buckets its span overlaps rather than credit it to the bucket containing it.
   */
  spanStart: string;
  spanEnd: string;
  /**
   *  True when the settlement anchor had to be re-derived because the chain advanced it
   *  with NO event — the stale-oracle-with-zero-open-interest branch, where funding is
   *  permanently forgiven at zero and nothing is logged. A run of these means some
   *  funding time is covered by no row at all.
   */
  anchorResynced: boolean;
  /** Timestamp (unix seconds) of the update. */
  timestamp: string;
  blockNumber: string;
  txHash: string;
};

/**
 *  A funding-rate rollup bucket (mirror of the indexer `FundingRateCandle`) — for
 *  charting ranges the raw series is too dense for.
 *
 *  Each bucket is built by distributing every settlement across the buckets its covered
 *  span overlaps, weighted by seconds and normalized to a fixed per-8h axis. That is not
 *  an implementation detail: crediting a lazily-settled emit to the bucket containing its
 *  log renders an 8x phantom spike on the testnet cadence and 3x on the expected mainnet
 *  one, while the buckets the funding actually applied to render as paused.
 */
export type FundingRateCandle = {
  /** Bucket id (`${pool}_${intervalSeconds}_${bucketStart}`). */
  id: string;
  pool: string;
  /** 3600 | 14400 | 86400. */
  intervalSeconds: number;
  /** Bucket start (unix seconds). */
  bucketStart: string;
  /**
   *  Seconds-weighted mean rate, already on a per-8h basis, and zero-filled: seconds no
   *  settlement covered pull the mean toward zero rather than being dropped. So a
   *  partially covered bucket reads BELOW the rate that was in force — read `coverage` to
   *  tell that apart from a genuinely small rate.
   */
  avgFundingRate8h: string;
  /**
   *  Extremes over CONTRIBUTING settlements only — undiluted by coverage and NOT
   *  zero-filled, so they can legitimately sit outside `avgFundingRate8h` on a thinly
   *  covered bucket. Null when no settlement's span reached this bucket.
   */
  minFundingRate8h: string | null;
  maxFundingRate8h: string | null;
  /**
   *  Covered seconds / bucket seconds, 1e18-scaled — a true ratio in [0, 1]. This is what
   *  a chart should hatch or grey on: a bucket at `avgFundingRate8h: 0` with low coverage
   *  is a PAUSE, not a measurement of zero funding.
   */
  coverage: string;
  /**
   *  Cumulative funding index at this bucket's wall-clock START and END, attributed by
   *  covered seconds — the same basis as `avgFundingRate8h`.
   *
   *  Two exact properties follow, and both are what this pair is for:
   *
   *  - **Sparse buckets telescope.** `cumulativeFundingEnd` equals the next existing
   *    bucket's `cumulativeFundingStart`, even across a gap no settlement covered — the
   *    index is flat over uncovered time, so there is nothing to attribute.
   *  - **Range sums are exact.** `sum(end - start)` over any set of buckets is the funding
   *    that accrued over them; see {@link realizedFundingPerBase}.
   *
   *  These are ATTRIBUTION values, not chain samples. A catch-up settlement's whole span is
   *  spread across the buckets it covered rather than booked at its log, so an interior
   *  edge deliberately will NOT equal any `FundingRateUpdate.cumulativeFundingPerUnit`.
   *  Use {@link SomniaMarketsClient.listFundingRateHistory | client.listFundingRateHistory} when you want the sampled series itself.
   */
  cumulativeFundingStart: string;
  cumulativeFundingEnd: string;
  /** Params at the bucket's last settlement; `paramsChangedInBucket` flags a mid-bucket change. */
  fundingWindowSec: number;
  fundingIntervalSec: number;
  paramsChangedInBucket: boolean;
  indexPriceEnd: string | null;
  openInterestEnd: string | null;
  /** How many settlements contributed to this bucket. */
  updateCount: number;
};

/**
 *  A realized perp fee, rebate, or builder credit (mirror of the indexer
 *  `PerpFeeRecord` entity).
 *
 *  The perps fee rail, which is NOT the binary/spot one — {@link SomniaMarketsClient.listBuilderFees | client.listBuilderFees} and
 *  friends read `BuilderFeeRecord` / `ProtocolFeeRecord`, written by the market modules.
 *  These rows come off `MarginBank`, and `kind` says which rail within it.
 */
export type PerpFeeRecord = {
  /** Record id (`${txHash}_${logIndex}`). */
  id: string;
  /** Account charged or credited (lowercased). */
  account: string;
  /** Perp pool (lowercased); null on account-scoped rows. */
  pool: string | null;
  /** Amount moved (raw collateral, unsigned — read `isRebate` for the direction). */
  amount: string;
  /** True on `Rebate` (a credit TO the account); false on `Fee` / `BuilderFee` (a debit). */
  isRebate: boolean;
  /**
   *  Which rail:
   *
   *    Fee            taker/maker fee charged on a fill
   *    Rebate         maker rebate paid back
   *    BuilderFee     routing credit to a builder — the perps builder rail, previously
   *                   unindexed while the spot and binary ones were not
   *    LiquidationFee stage-3 health-preserving liquidation fee, routed WHOLLY to an
   *                   Insurance Fund tier (see `tier` / `fillNotional`)
   *
   *  No `LiquidationFee` rows exist yet: the event is in the protocol ABI but not in the
   *  deployed implementation, and the subscription is staged ahead of the upgrade that
   *  brings it.
   */
  kind: string;
  /**
   *  Portion of this fee routed to the Insurance Fund; null on `Rebate` / `BuilderFee`.
   *
   *  A component OF `amount`, never an addition to it — summing both double-counts. On
   *  `Fee` it is a split of a larger fee; on `LiquidationFee` it equals `amount`, because
   *  that fee goes wholly to a tier. Written on both so `SUM(insurancePortion)` is the
   *  fund's fee inflow without special-casing the kind.
   */
  insurancePortion: string | null;
  /** Insurance Fund tier credited (`LiquidationFee` only; `"0"` = general/unallocated). */
  tier: string | null;
  /**
   *  The liquidation IOC's quote fill notional, which the fee's rate cap applied to
   *  (`LiquidationFee` only) — so the effective rate is reconstructible per row without
   *  tracking the penalty-bps admin parameter.
   */
  fillNotional: string | null;
  /** Builder credited (`BuilderFee` only; lowercased). */
  builder: string | null;
  /** Timestamp (unix seconds). */
  timestamp: string;
  /** Tx hash the fee landed in. */
  txHash: string;
};

/**
 *  An open-interest snapshot (mirror of the indexer `OpenInterestSnapshot`
 *  entity).
 */
export type OpenInterestSnapshot = {
  /** Snapshot id (`${pool}_${block}_${logIndex}`). */
  id: string;
  /** Perp pool (lowercased). */
  pool: string;
  /**
   *  TOTAL open interest (raw base units) — one counter, not a long/short pair; see the
   *  `openInterest` field on {@link PerpMarket} for why.
   */
  openInterest: string;
  /** Timestamp (unix seconds) of the snapshot. */
  timestamp: string;
  /** Block the snapshot came from. */
  blockNumber: string;
};

/**
 *  An account's funding-payment history, newest first — optionally scoped to
 *  one pool, paginated.
 */
export async function getFundingPayments(
  account: string,
  opts: { pool?: string; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<FundingPayment[]> {
  const where: Record<string, unknown> = { account: { _eq: account.toLowerCase() } };
  if (opts.pool != null) where.pool = { _eq: opts.pool.toLowerCase() };
  const data = await IndexerRead.gqlRequest(FundingPaymentsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.FundingPayment;
}

/**
 *  An account's margin-account movement history (deposits/withdraws/locks),
 *  newest first — paginated.
 */
export async function getMarginEvents(
  account: string,
  opts: { limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<MarginEvent[]> {
  const data = await IndexerRead.gqlRequest(MarginEventsQuery,
    { account: account.toLowerCase(), limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.MarginEvent;
}

/**
 *  Liquidation events, newest first — filter by `account` and/or `pool`,
 *  paginate.
 */
export async function getLiquidations(
  opts: { account?: string; pool?: string; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<LiquidationEvent[]> {
  const where: Record<string, unknown> = {};
  if (opts.account != null) where.account = { _eq: opts.account.toLowerCase() };
  if (opts.pool != null) where.pool = { _eq: opts.pool.toLowerCase() };
  const data = await IndexerRead.gqlRequest(LiquidationsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.LiquidationEvent;
}

/**
 *  A perp pool's funding-rate history, newest first. The append-only counterpart to the
 *  overwrite-only `PerpMarket.fundingRate`.
 *
 *  Takes a `{ from, to }` WINDOW as well as a page, because a chart needs a time range
 *  rather than an offset: the settlement cadence is 300s on testnet (288 rows per pool
 *  per day), so paging blindly to reach a date is both slow and fragile.
 *
 *  Every row carries its own `fundingWindowSec`, so normalize per row rather than once
 *  for the series — see {@link normalizeFundingRate}. Rows are lagged samples at
 *  settlement times, and each covers the span `[spanStart, spanEnd)`, which reaches
 *  backwards from the emit; for anything longer than about a week prefer
 *  {@link SomniaMarketsClient.listFundingRateCandles | client.listFundingRateCandles}, which does that attribution for you.
 *
 *  **`order` decides which END of the window a page comes from, and it is not cosmetic.**
 *  The default `"desc"` returns the NEWEST `limit` rows, which is what a "latest funding"
 *  read wants. But it makes `from` a window bound rather than a cursor: paging forward
 *  with `from = last.timestamp + 1` under `"desc"` keeps re-reading the tail and never
 *  advances, because narrowing the window does not change which end you get. Pass
 *  `"asc"` to walk FORWARD from `from` — that is the mode a cursor needs.
 *
 *  @param pool - perp pool address
 *  @param opts - `from`/`to` are unix SECONDS, inclusive/exclusive respectively
 */
export async function listFundingRateHistory(
  pool: string,
  opts: {
    limit?: number;
    offset?: number;
    from?: number | bigint;
    to?: number | bigint;
    order?: "asc" | "desc";
  } = {},
  indexerUrl: string,
): Promise<FundingRateUpdate[]> {
  const timestamp: Record<string, string> = {};
  if (opts.from != null) timestamp._gte = opts.from.toString();
  if (opts.to != null) timestamp._lt = opts.to.toString();
  const where: Record<string, unknown> = { pool: { _eq: pool.toLowerCase() } };
  if (Object.keys(timestamp).length > 0) where.timestamp = timestamp;
  const data = await IndexerRead.gqlRequest(FundingRateHistoryQuery,
    {
      where,
      orderBy: [{ timestamp: opts.order ?? "desc" }],
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
    },
    indexerUrl,
  );
  return data.FundingRateUpdate;
}

/**
 *  A perp pool's funding-rate ROLLUPS at one resolution, newest first.
 *
 *  Use this for any range the raw series is too dense for — 30 days at the testnet
 *  cadence is ~8,600 raw rows per pool. Resolutions are 3600 / 14400 / 86400 only;
 *  anything at or below the settlement cadence would multiply rows without adding
 *  information.
 *
 *  Two things a consumer must honour, both of which are properties of lazy settlement
 *  rather than of this API:
 *
 *  - **Buckets can be ABSENT.** A window touched by no settlement's span produces no row,
 *    because nothing triggered a write. Zero-fill missing grid slots as
 *    `{ avgFundingRate8h: 0, coverage: 0 }` — and never carry the previous rate forward,
 *    which would fabricate funding across an outage.
 *  - **Past buckets get REVISED.** A catch-up settlement reaches backwards and updates
 *    buckets that already existed. Any chart already has to tolerate this for the
 *    in-progress bucket.
 *
 *  **Paging is newest-first, and a full page means there is probably more.** The default
 *  `limit` is 500 while 30 days of hourly buckets is 720, so a month-long window silently
 *  returns its newest 500. Treat `rows.length === limit` as "truncated" and page with
 *  `offset`, or narrow the window. {@link densifyFundingBuckets} will not zero-fill older
 *  than the oldest row it is given, precisely so a truncated page cannot be rendered as a
 *  funding pause.
 *
 *  @param pool - perp pool address
 *  @param intervalSeconds - 3600 | 14400 | 86400
 *  @param opts - `from`/`to` are unix SECONDS, matched against `bucketStart`
 */
export async function listFundingRateCandles(
  pool: string,
  intervalSeconds: number,
  opts: { limit?: number; offset?: number; from?: number | bigint; to?: number | bigint } = {},
  indexerUrl: string,
): Promise<FundingRateCandle[]> {
  const bucketStart: Record<string, string> = {};
  if (opts.from != null) bucketStart._gte = opts.from.toString();
  if (opts.to != null) bucketStart._lt = opts.to.toString();
  const where: Record<string, unknown> = {
    pool: { _eq: pool.toLowerCase() },
    intervalSeconds: { _eq: intervalSeconds },
  };
  if (Object.keys(bucketStart).length > 0) where.bucketStart = bucketStart;
  const data = await IndexerRead.gqlRequest(FundingRateCandlesQuery,
    { where, limit: opts.limit ?? 500, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.FundingRateCandle;
}

/**
 *  @deprecated Renamed to {@link SomniaMarketsClient.listFundingRateHistory | client.listFundingRateHistory}, per the `get*` = value-or-null
 *  and `list*` = array convention in CONVENTIONS.md. This alias keeps one release cycle
 *  of compatibility; it forwards verbatim and accepts the new `from`/`to` window too.
 */
export async function getFundingRateHistory(
  pool: string,
  opts: { limit?: number; offset?: number; from?: number | bigint; to?: number | bigint } = {},
  indexerUrl: string,
): Promise<FundingRateUpdate[]> {
  return listFundingRateHistory(pool, opts, indexerUrl);
}

/**
 *  Realized perp fees / rebates / builder credits, newest first — filter by `account`,
 *  `pool`, `builder` or `kind`, paginate.
 *
 *  The perps fee rail off `MarginBank`, distinct from the binary/spot `listBuilderFees` and
 *  `listProtocolFees` surfaces.
 *
 *  `insurancePortion` is a component OF `amount` rather than an addition to it, so a fee
 *  total is `SUM(amount)` and an insurance-fund inflow is `SUM(insurancePortion)` — adding
 *  the two double-counts. Directions are on `isRebate`: `amount` is unsigned, and a rebate
 *  is a credit.
 *
 *  @param opts - `kind` is `"Fee"` | `"Rebate"` | `"BuilderFee"`
 */
export async function listPerpFees(
  opts: { account?: string; pool?: string; builder?: string; kind?: string; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<PerpFeeRecord[]> {
  const where: Record<string, unknown> = {};
  if (opts.account != null) where.account = { _eq: opts.account.toLowerCase() };
  if (opts.pool != null) where.pool = { _eq: opts.pool.toLowerCase() };
  if (opts.builder != null) where.builder = { _eq: opts.builder.toLowerCase() };
  if (opts.kind != null) where.kind = { _eq: opts.kind };
  const data = await IndexerRead.gqlRequest(PerpFeesQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.PerpFeeRecord;
}

/** A perp pool's open-interest history, newest first — paginated. */
export async function getOpenInterestHistory(
  pool: string,
  opts: { limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<OpenInterestSnapshot[]> {
  const data = await IndexerRead.gqlRequest(OpenInterestHistoryQuery,
    { pool: pool.toLowerCase(), limit: opts.limit ?? 100, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.OpenInterestSnapshot;
}

// prettier-ignore
const FundingPaymentsQuery = graphql(`
  query FundingPayments($where: FundingPayment_bool_exp!, $limit: Int, $offset: Int) {
         FundingPayment(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
           id account pool amount timestamp txHash
         }
       }
`);

// prettier-ignore
const MarginEventsQuery = graphql(`
  query MarginEvents($account: String!, $limit: Int, $offset: Int) {
         MarginEvent(where: {account: {_eq: $account}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
           id account kind pool amount granter timestamp txHash
         }
       }
`);

// prettier-ignore
const LiquidationsQuery = graphql(`
  query Liquidations($where: LiquidationEvent_bool_exp!, $limit: Int, $offset: Int) {
         LiquidationEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
           id account pool kind size price counterparty penalty
           badDebt insuranceCovered deficit coverageDeclined collateralAmount equity
           positionsProcessed stageReached marginStatusBefore marginStatusAfter
           timestamp blockNumber txHash
         }
       }
`);

// prettier-ignore
const FundingRateHistoryQuery = graphql(`
  query FundingRateHistory($where: FundingRateUpdate_bool_exp!, $orderBy: [FundingRateUpdate_order_by!], $limit: Int, $offset: Int) {
         FundingRateUpdate(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {
           id pool fundingRate cumulativeFundingPerUnit indexPrice markPrice
           intervalsSettled intervalsAccrued fundingWindowSec fundingIntervalSec
           spanStart spanEnd anchorResynced timestamp blockNumber txHash
         }
       }
`);

// prettier-ignore
const FundingRateCandlesQuery = graphql(`
  query FundingRateCandles($where: FundingRateCandle_bool_exp!, $limit: Int, $offset: Int) {
         FundingRateCandle(where: $where, order_by: {bucketStart: desc}, limit: $limit, offset: $offset) {
           id pool intervalSeconds bucketStart
           avgFundingRate8h minFundingRate8h maxFundingRate8h coverage
           cumulativeFundingStart cumulativeFundingEnd
           fundingWindowSec fundingIntervalSec paramsChangedInBucket
           indexPriceEnd openInterestEnd updateCount
         }
       }
`);

// prettier-ignore
const PerpFeesQuery = graphql(`
  query PerpFees($where: PerpFeeRecord_bool_exp!, $limit: Int, $offset: Int) {
         PerpFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
           id account pool amount isRebate kind insurancePortion tier fillNotional builder timestamp txHash
         }
       }
`);

// prettier-ignore
const OpenInterestHistoryQuery = graphql(`
  query OpenInterestHistory($pool: String!, $limit: Int, $offset: Int) {
         OpenInterestSnapshot(where: {pool: {_eq: $pool}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
           id pool openInterest timestamp blockNumber
         }
       }
`);
