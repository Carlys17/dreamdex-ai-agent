// Portfolio analytics — the equity curve / PnL / MWRR / volume metrics plane
// a portfolio page renders, computed purely from indexed activity + candle
// marks. Upstreamed from the DreamDex gateway's GET /v0/portfolio when the
// app moved onto the SDK as its sole data source.
//
// House split: a PURE kernel over typed flow events (this file) + exchange
// wiring that assembles the events from indexer reads. The kernel is
// deliberately event-shaped rather than fill-shaped so the perp account
// plane (funding payments, margin moves) can join the same fold later as new
// event kinds — an equity curve folded from fills alone stops being true the
// day funding exists.
//
// Accounting: weighted-average cost per market. Realized PnL accrues on
// sells (proceeds − avg cost of the size sold); unrealized marks the open
// quantity to the nearest candle close at-or-before each sample. "Deposited"
// capital follows the gateway's definition — the carried-in position's value
// at the window start, plus window buys, minus window sell proceeds — i.e.
// trade flows, not wallet transfers.

/** Time window for the metrics. */
export type PortfolioTimeframe = "24h" | "7d" | "30d" | "all";

/** One portfolio-affecting event, human USD-quote units. */
export interface PortfolioFlowEvent {
  /** Event kind — trades today; funding/margin joins the fold for perps. */
  kind: "trade";
  /** Event time (ms). */
  timestamp: number;
  /** The market the event belongs to (any stable key; symbol works). */
  market: string;
  /** Trade direction from the account's perspective. */
  side: "buy" | "sell";
  /** Base size exchanged, human units (positive). */
  baseAmount: number;
  /** Quote value exchanged, human USD units (positive). */
  quoteAmount: number;
}

/** A market's mark-price series: [timestampMs, price][], oldest first. */
export type MarkSeries = ReadonlyArray<readonly [number, number]>;

/** Mark sources per market key, plus a fallback price for quiet markets. */
export interface MarkSources {
  /** Candle-close series per market (oldest first). */
  series: ReadonlyMap<string, MarkSeries>;
  /** Last known price per market, used when a series has no sample yet. */
  lastPrice: ReadonlyMap<string, number>;
}

/** One sample of the equity (cumulative window PnL) series. */
export interface EquityPoint {
  /** Sample time (ms). */
  t: number;
  /** Cumulative realized + unrealized PnL since the window start, USD. */
  valueUsd: number;
}

/** One PnL bucket: the PnL attributed to (prevSample, t]. */
export interface PnlBucket {
  /** Bucket end time (ms). */
  t: number;
  /** Signed PnL attributed to the bucket, USD. */
  pnlUsd: number;
}

/** The computed metrics plane — mirrors what a portfolio page renders. */
export interface PortfolioAnalytics {
  timeframe: PortfolioTimeframe;
  /** Upper bound of the series (ms). */
  asOf: number;
  /** Cumulative window PnL over time, oldest first; first point is 0. */
  equity: EquityPoint[];
  pnl: {
    /** Signed total PnL over the timeframe, USD (== last equity point). */
    totalUsd: number;
    buckets: PnlBucket[];
  };
  mwrr: {
    /**
     *  Period money-weighted return as a fraction; null when the capital base
     *  is ~0 or negative (a net seller has no base to weight a return by).
     */
    return: number | null;
    /** Signed money gained over the period, USD. */
    gainUsd: number;
    /**
     *  Net capital deployed into trades over the window: carried-in position
     *  value + buys − sell proceeds. Signed.
     */
    depositedUsd: number;
  };
  volume: {
    /** Trading volume over the timeframe, USD. */
    periodUsd: number;
    /** Volume across every supplied event, USD. */
    lifetimeUsd: number;
    /** Volume since `sessionSince`, when supplied. */
    sessionUsd?: number;
  };
  feesSaved: {
    /** The comparison taker rate (bps) the savings are computed against. */
    cexRateBps: number;
    /** Volume × rate over the timeframe, USD. */
    periodUsd: number;
    /** Volume × rate across every supplied event, USD. */
    lifetimeUsd: number;
  };
}

/** Window lengths per timeframe (ms); "all" spans every event. */
const TIMEFRAME_MS: Record<Exclude<PortfolioTimeframe, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** Equity-series bucket per timeframe (ms). */
const BUCKET_MS: Record<PortfolioTimeframe, number> = {
  "24h": 60 * 60 * 1000,
  "7d": 4 * 60 * 60 * 1000,
  "30d": 24 * 60 * 60 * 1000,
  all: 24 * 60 * 60 * 1000,
};

/**
 *  Default comparison taker rate for the fees-saved metric, bps. 10 bps ≈ the
 *  common CEX taker tier the gateway compared against.
 */
export const DEFAULT_CEX_RATE_BPS = 10;

/**
 *  A capital base below this (USD) yields `return: null`. Covers both ~0 (a
 *  ratio against it is ±∞ noise) and negative bases (a net seller over the
 *  window — dividing by a negative base would flip the sign of the return).
 */
const MIN_CAPITAL_BASE_USD = 0.01;

interface MarketBook {
  qty: number;
  cost: number;
}

/** Nearest mark at-or-before `t`, else the series' first sample, else fallback. */
function markAt(series: MarkSeries | undefined, t: number, fallback: number): number {
  if (!series || series.length === 0) return fallback;
  let best: number | undefined;
  for (const [ts, price] of series) {
    if (ts > t) break;
    best = price;
  }
  return best ?? series[0]?.[1] ?? fallback;
}

/** Options for {@link computePortfolioAnalytics}. */
export interface PortfolioAnalyticsOptions {
  timeframe: PortfolioTimeframe;
  /** Upper bound of the series (ms) — the caller's clock. */
  asOf: number;
  /** Marks for unrealized valuation. */
  marks: MarkSources;
  /** Session start (ms) for `volume.sessionUsd`. */
  sessionSince?: number;
  /** Comparison taker rate, bps. @defaultValue {@link DEFAULT_CEX_RATE_BPS} */
  cexRateBps?: number;
}

/**
 *  Fold portfolio flow events into the metrics plane. PURE — every input is
 *  explicit, so it runs identically in apps, bots, and tests. `events` may
 *  arrive in any order; they are sorted oldest-first internally. Events
 *  before the window establish the carried-in cost basis; events inside it
 *  drive the equity curve.
 */
export function computePortfolioAnalytics(
  events: readonly PortfolioFlowEvent[],
  opts: PortfolioAnalyticsOptions,
): PortfolioAnalytics {
  const { timeframe, asOf, marks } = opts;
  const cexRateBps = opts.cexRateBps ?? DEFAULT_CEX_RATE_BPS;
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const windowStart =
    timeframe === "all"
      ? (sorted[0]?.timestamp ?? asOf)
      : asOf - TIMEFRAME_MS[timeframe];
  const bucketMs = BUCKET_MS[timeframe];

  // Per-market running avg-cost book. Applying an event mutates it and
  // returns the realized PnL the event produced.
  const books = new Map<string, MarketBook>();
  const book = (market: string): MarketBook => {
    let b = books.get(market);
    if (!b) {
      b = { qty: 0, cost: 0 };
      books.set(market, b);
    }
    return b;
  };
  const applyTrade = (e: PortfolioFlowEvent): number => {
    const b = book(e.market);
    if (e.side === "buy") {
      b.qty += e.baseAmount;
      b.cost += e.quoteAmount;
      return 0;
    }
    const avg = b.qty > 0 ? b.cost / b.qty : 0;
    const sold = Math.min(e.baseAmount, b.qty);
    const costOut = avg * sold;
    b.qty -= sold;
    b.cost -= costOut;
    // Proceeds are attributed pro-rata when the sell exceeds the tracked
    // position (tokens acquired outside the book): only the matched slice
    // realizes PnL.
    const matchedProceeds = e.baseAmount > 0 ? (e.quoteAmount * sold) / e.baseAmount : 0;
    return matchedProceeds - costOut;
  };

  /** Σ open-position value minus cost basis, marked at `t`. */
  const unrealizedAt = (t: number): number => {
    let total = 0;
    for (const [market, b] of books) {
      if (b.qty <= 0) continue;
      const mark = markAt(marks.series.get(market), t, marks.lastPrice.get(market) ?? 0);
      total += b.qty * mark - b.cost;
    }
    return total;
  };

  // Phase 1 — pre-window events establish the carried-in basis.
  let i = 0;
  while (i < sorted.length && (sorted[i] as PortfolioFlowEvent).timestamp < windowStart) {
    applyTrade(sorted[i] as PortfolioFlowEvent);
    i += 1;
  }

  let carriedInValue = 0;
  for (const [market, b] of books) {
    if (b.qty > 0) {
      carriedInValue +=
        b.qty * markAt(marks.series.get(market), windowStart, marks.lastPrice.get(market) ?? 0);
    }
  }
  const unrealizedAtStart = unrealizedAt(windowStart);

  // Phase 2 — walk the window bucket by bucket, applying events as their
  // bucket arrives and sampling cumulative PnL at each boundary.
  const equity: EquityPoint[] = [{ t: windowStart, valueUsd: 0 }];
  let cumRealized = 0;
  let buysUsd = 0;
  let sellProceedsUsd = 0;
  let periodVolume = 0;

  for (let t = windowStart + bucketMs; ; t += bucketMs) {
    const sampleT = Math.min(t, asOf);
    while (i < sorted.length && (sorted[i] as PortfolioFlowEvent).timestamp <= sampleT) {
      const e = sorted[i] as PortfolioFlowEvent;
      cumRealized += applyTrade(e);
      periodVolume += e.quoteAmount;
      if (e.side === "buy") buysUsd += e.quoteAmount;
      else sellProceedsUsd += e.quoteAmount;
      i += 1;
    }
    equity.push({
      t: sampleT,
      valueUsd: cumRealized + unrealizedAt(sampleT) - unrealizedAtStart,
    });
    if (sampleT >= asOf) break;
  }

  const buckets: PnlBucket[] = [];
  for (let k = 1; k < equity.length; k += 1) {
    const prev = equity[k - 1] as EquityPoint;
    const cur = equity[k] as EquityPoint;
    buckets.push({ t: cur.t, pnlUsd: cur.valueUsd - prev.valueUsd });
  }

  const totalUsd = (equity[equity.length - 1] as EquityPoint).valueUsd;
  const depositedUsd = carriedInValue + buysUsd - sellProceedsUsd;

  let lifetimeVolume = 0;
  let sessionVolume = 0;
  for (const e of sorted) {
    lifetimeVolume += e.quoteAmount;
    if (opts.sessionSince !== undefined && e.timestamp >= opts.sessionSince) {
      sessionVolume += e.quoteAmount;
    }
  }

  const rate = cexRateBps / 10_000;
  return {
    timeframe,
    asOf,
    equity,
    pnl: { totalUsd, buckets },
    mwrr: {
      return: depositedUsd < MIN_CAPITAL_BASE_USD ? null : totalUsd / depositedUsd,
      gainUsd: totalUsd,
      depositedUsd,
    },
    volume: {
      periodUsd: periodVolume,
      lifetimeUsd: lifetimeVolume,
      ...(opts.sessionSince !== undefined ? { sessionUsd: sessionVolume } : {}),
    },
    feesSaved: {
      cexRateBps,
      periodUsd: periodVolume * rate,
      lifetimeUsd: lifetimeVolume * rate,
    },
  };
}
