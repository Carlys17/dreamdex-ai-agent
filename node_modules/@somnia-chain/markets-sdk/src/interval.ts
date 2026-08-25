// Series-cadence helpers. A binary up/down market belongs to a rolling series
// with a fixed cadence — 15m, 1h, 4h, 24h. The indexer already DERIVES that
// cadence in seconds (`intervalSec = expiry − tradingStart`) and stores it on
// the Market entity; these are the SDK-canonical helpers for resolving it and
// turning it into the compact human label a trade row / market row displays.
//
// This lives here (not in the explorer) so every consumer — the explorer, other
// UIs, bots — reads ONE `intervalSec → "15m"` mapping instead of each
// re-deriving `expiry − tradingStart` and hand-rolling the format. The label is
// also stamped onto every {@link BinaryMarket} the SDK returns (as
// `BinaryMarket.interval`), onto trade-history rows (`FillRow.market` /
// `PortfolioTrade.market`), and onto a wallet's ACTIVE positions + open orders
// (`PortfolioPosition.market` / `PortfolioOrder.market`) so a positions row can
// show its contract duration — so most callers never touch these directly.

/**
 *  The minimal market shape needed to resolve a cadence — a structural subset of
 *  {@link BinaryMarket}, so these helpers stay dependency-free (no import cycle
 *  with the concept modules) and accept either the indexed row or a hand-built object.
 *  Fields accept the indexer's decimal strings OR plain numbers.
 */
export type IntervalSource = {
  /** Series cadence in seconds, as the indexer derived it (may be null on a
   *  row that predates the field, or on SPOT/PERP). */
  intervalSec?: string | number | null;
  /** Unix seconds trading opened. */
  tradingStart?: string | number | null;
  /** Unix seconds trading ends / the outcome is decided. */
  expiry?: string | number | null;
};

/**
 *  Resolve a binary market's series cadence in SECONDS: prefer the
 *  indexer-derived `intervalSec`, else fall back to `expiry − tradingStart`.
 *  Returns `null` when neither yields a positive number (SPOT/PERP rows, or a
 *  market missing both signals).
 */
export function resolveIntervalSec(m: IntervalSource): number | null {
  const iv = m.intervalSec != null ? Number(m.intervalSec) : NaN;
  if (Number.isFinite(iv) && iv > 0) return iv;
  if (m.tradingStart != null && m.expiry != null) {
    const window = Number(m.expiry) - Number(m.tradingStart);
    if (Number.isFinite(window) && window > 0) return window;
  }
  return null;
}

/**
 *  Snap a raw cadence (seconds) to its nearest natural unit — minute (< 1h),
 *  hour (< 1d), else day — but ONLY when the raw value sits within
 *  `toleranceSec` of that unit, i.e. it is genuine off-by-a-second jitter
 *  (899 → 900, 3601 → 3600, 86399 → 86400). A value further than the tolerance
 *  from any unit is a real partial / non-standard window and is returned
 *  UNCHANGED, never bucketed up: `840 → 840` ("14m"), `870 → 870` ("14m30s" is
 *  not clean, so → "870s"), `5400 → 5400` ("90m"), `86100 → 86100` (23h55m,
 *  NOT "24h"). Because a series-registered market carries an EXACT on-chain
 *  `intervalSec`, the snap is a no-op on real cadences; the tolerance only
 *  matters on the `expiry − tradingStart` fallback path. Non-positive → 0.
 */
export function snapIntervalSec(sec: number, toleranceSec = 2): number {
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  if (sec < 60) return Math.max(1, Math.round(sec));
  const unit = sec < 3600 ? 60 : sec < 86400 ? 3600 : 86400;
  const snapped = Math.round(sec / unit) * unit;
  return Math.abs(snapped - sec) <= toleranceSec ? snapped : Math.round(sec);
}

/**
 *  Compact human label for a cadence in SECONDS, in the largest unit up to hours
 *  that divides it cleanly: `600 → "10m"`, `900 → "15m"`, `3600 → "1h"`,
 *  `14400 → "4h"`, `86400 → "24h"`, `172800 → "48h"`, `90 → "90s"`. Returns
 *  `null` on non-finite/non-positive input (callers pick their own placeholder).
 *  Does NOT snap — pass a snapped value, or use {@link marketIntervalLabel}, to
 *  first shed off-by-one-second noise.
 */
export function formatIntervalLabel(sec: number): string | null {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

/**
 *  The served timeframe label for a binary market: resolve the cadence
 *  ({@link resolveIntervalSec}), snap off sub-unit noise ({@link snapIntervalSec}),
 *  then label it ({@link formatIntervalLabel}) — so a steady-state market reads
 *  as `"15m"` / `"1h"` / `"4h"` / `"24h"` (a series' bootstrap partial keeps its
 *  own short window). Returns `null` when the market has no determinable cadence
 *  (SPOT/PERP). This is what the SDK stamps onto `BinaryMarket.interval` and
 *  trade-history rows.
 */
export function marketIntervalLabel(m: IntervalSource): string | null {
  const sec = resolveIntervalSec(m);
  return sec != null ? formatIntervalLabel(snapIntervalSec(sec)) : null;
}
