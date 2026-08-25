// Price-feed GraphQL reads (HTTP) + the shared row parsers.
//
// The price-feed indexer is read-only and auth-free. ONE endpoint serves every
// asset; every Feed/PricePoint/Candle row carries a denormalized `symbol`
// (`BTC/USDC`), `base` (`BTC`), and `quote` (`USDC`), so an asset is selected by
// filter — single (`base: {_eq}`), a batch (`base: {_in: [...]}`), or all (omit
// the filter). This mirrors how CEX ticker endpoints and Pyth's `ids[]` batch work.
//
// The feed indexes MORE THAN ONE quote per base (`BTC/USDC` and `BTC/USDT`), so
// `base` alone is not a unique feed key. Every read below takes an optional
// `quote` that adds a `{quote: {_eq}}` clause; when set (the norm), a base
// resolves to exactly one feed. Without it a multi-quote base double-counts —
// merged candle buckets share a `bucketStart` (fatal to strict-ascending charts),
// `Feed[0]` is arbitrary. The quote comes from config (see resolvePriceFeed).
//
// These are the one-shot HTTP reads (snapshot, history, candles, feed info, batch
// prices, feed catalog); the live subscription (tail) reuses the SUBSCRIPTION_*
// query strings + the same parsers so live and snapshot rows land in the store
// identically.
//
// Errors PROPAGATE: a failed request throws — an empty result always means "no
// rows", never "request failed".

import type { LivePrice, PriceCandle, PriceCandleResolution, PriceFeedInfo, PricePoint } from "./types.js";
import * as Types from "./types.js";
import * as GraphqlBoundary from "../graphqlBoundary.js";

const GQL_TIMEOUT_MS = 30_000;

/**
 *  Price-feed reads go through the shared indexer boundary. The `price-feed`
 *  label distinguishes them from main-indexer failures in a caller's logs —
 *  they are separate deployments and can fail independently.
 */
async function gql<T>(url: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return GraphqlBoundary.postGraphql<T>(url, query, variables, {
    timeoutMs: GQL_TIMEOUT_MS,
    label: `price-feed ${GraphqlBoundary.operationNameOf(query)}`,
  });
}

// ---- raw wire shapes (every price is a 1e18 string; every timestamp unix-s string) ----

interface RawFeed {
  symbol: string | null;
  base: string | null;
  quote: string | null;
  decimals: number | null;
  description: string | null;
  latestSpot: string | null;
  latestMark: string | null;
  latestBlockNumber: string | null;
  latestBlockTimestamp: string | null;
  // Freshness surface. `numeric` on the wire, so these arrive as STRINGS of
  // unix MILLIseconds (not seconds like the block timestamps above).
  latestUpdatedAtMs: string | null;
  latestSourceUpdatedAtMs: string | null;
  latestResynced: boolean | null;
}

interface RawPricePoint {
  id: string;
  base: string;
  requestId: string;
  spot: string;
  mark: string;
  blockNumber: string;
  blockTimestamp: string;
  txHash: string;
}

interface RawCandle {
  resolution: PriceCandleResolution;
  bucketStart: string;
  open: string;
  high: string;
  low: string;
  close: string;
  markClose: string;
  count: string | number;
}

// ---- selection sets (shared with the subscription queries) ----
//
// The feed exposes the spot index (`spot` / `latestSpot`) and its EMA-smoothed
// perpetual mark (`mark` / `latestMark` / candle `markClose`). The SDK maps these
// onto its stable `price` / `ema` / `emaClose` fields (see the parsers): `price` =
// spot, `ema` = the mark. There is no per-tick request id (batched agent request).

const FEED_FIELDS = `symbol base quote decimals description latestSpot latestMark latestBlockNumber latestBlockTimestamp latestUpdatedAtMs latestSourceUpdatedAtMs latestResynced`;
const POINT_FIELDS = `id base requestId spot mark blockNumber blockTimestamp txHash`;
const CANDLE_FIELDS = `resolution bucketStart open high low close markClose count`;

/** WHERE fragment + operation-var suffix for a base (+ optional quote) filter.
 *  `quote` is passed as a GraphQL variable ($quote), never interpolated. */
function baseQuoteFilter(quote: string | undefined): { where: string; varDecl: string } {
  return quote
    ? { where: "base: {_eq: $base}, quote: {_eq: $quote}", varDecl: ", $quote: String!" }
    : { where: "base: {_eq: $base}", varDecl: "" };
}

/** Live Feed subscription for one asset (the catalog row = current price). Pass
 *  `quote` to pin a multi-quote base to one feed; the caller must supply `$quote`
 *  in the subscription variables when set. */
export function subscriptionFeed(quote?: string): string {
  const { where, varDecl } = baseQuoteFilter(quote);
  return `subscription LiveFeed($base: String!${varDecl}) { Feed(where: {${where}}) { ${FEED_FIELDS} } }`;
}
/** Live tick tape for one asset — Hasura re-pushes the latest `$limit` on every
 *  new tick. Pass `quote` to pin a multi-quote base to one feed. */
export function subscriptionTicks(quote?: string): string {
  const { where, varDecl } = baseQuoteFilter(quote);
  return `subscription LiveTicks($base: String!, $limit: Int!${varDecl}) { PricePoint(where: {${where}}, order_by: {blockTimestamp: desc}, limit: $limit) { ${POINT_FIELDS} } }`;
}

// ---- parsers (1e18 → human number + exact raw string; unix-s string → number) ----

/**
 *  Divide a 1e18-scaled integer string by 10^decimals for a human number.
 *  Display-grade (IEEE double); the raw string is kept alongside for exact math.
 */
function toHumanPrice(raw: string | null, decimals: number): number {
  if (raw === null) return 0;
  return Number(raw) / 10 ** decimals;
}

function toSec(s: string | null): number {
  return s === null ? 0 : Number(s);
}

/** Unix-MILLIsecond `numeric` string → number, or null when absent. Distinct from
 *  {@link toSec}: null stays null rather than collapsing to 0, because 0 is a
 *  real (if absurd) instant and "unknown age" must not read as "1970". */
function toMsOrNull(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Asset key for a row: the denormalized `base`, uppercased (falls back to a hint). */
function assetOf(base: string | null | undefined, hint?: string): string {
  return (base ?? hint ?? "").toUpperCase();
}

export function parseFeed(feed: RawFeed | undefined, assetHint?: string): PriceFeedInfo {
  const asset = assetOf(feed?.base, assetHint);
  const decimals = feed?.decimals ?? Types.PRICE_FEED_DECIMALS;
  const hasLatest = !!feed && feed.latestSpot !== null;
  const latest: LivePrice | null = hasLatest
    ? {
        asset,
        price: toHumanPrice(feed.latestSpot, decimals),
        ema: toHumanPrice(feed.latestMark, decimals),
        blockNumber: toSec(feed.latestBlockNumber),
        blockTimestamp: toSec(feed.latestBlockTimestamp),
        decimals,
        raw: { price: feed.latestSpot ?? "0", ema: feed.latestMark ?? "0" },
      }
    : null;
  return {
    asset,
    decimals,
    symbol: feed?.symbol ?? null,
    base: feed?.base ?? null,
    quote: feed?.quote ?? null,
    description: feed?.description ?? null,
    updatedAtMs: toMsOrNull(feed?.latestUpdatedAtMs),
    sourceUpdatedAtMs: toMsOrNull(feed?.latestSourceUpdatedAtMs),
    resynced: feed?.latestResynced ?? null,
    latest,
  };
}

export function parsePoint(p: RawPricePoint, decimals: number, assetHint?: string): PricePoint {
  return {
    id: p.id,
    asset: assetOf(p.base, assetHint),
    price: toHumanPrice(p.spot, decimals),
    ema: toHumanPrice(p.mark, decimals),
    requestId: p.requestId,
    blockNumber: Number(p.blockNumber),
    blockTimestamp: Number(p.blockTimestamp),
    txHash: p.txHash,
    raw: { price: p.spot, ema: p.mark },
  };
}

function parseCandle(asset: string, c: RawCandle, decimals: number): PriceCandle {
  return {
    asset,
    resolution: c.resolution,
    bucketStart: Number(c.bucketStart),
    open: toHumanPrice(c.open, decimals),
    high: toHumanPrice(c.high, decimals),
    low: toHumanPrice(c.low, decimals),
    close: toHumanPrice(c.close, decimals),
    emaClose: toHumanPrice(c.markClose, decimals),
    count: Number(c.count),
  };
}

// ---- one-shot reads ----

interface SnapshotResponse {
  Feed: RawFeed[];
  PricePoint: RawPricePoint[];
}

/**
 *  Hydrate one asset: its metadata + current price + the recent tick tape, in one
 *  request. Used to get a fresh watch "roughly up to speed" before the live
 *  subscription takes over.
 */
export async function loadPriceSnapshot(
  url: string,
  asset: string,
  ticks: number,
  quote?: string,
): Promise<{ info: PriceFeedInfo; points: PricePoint[] }> {
  const { where, varDecl } = baseQuoteFilter(quote);
  const data = await gql<SnapshotResponse>(
    url,
    `query PriceSnapshot($base: String!, $limit: Int!${varDecl}) {
      Feed(where: {${where}}) { ${FEED_FIELDS} }
      PricePoint(where: {${where}}, order_by: {blockTimestamp: desc}, limit: $limit) { ${POINT_FIELDS} }
    }`,
    { base: asset.toUpperCase(), limit: ticks, ...(quote ? { quote } : {}) },
  );
  const info = parseFeed(data.Feed[0], asset);
  const points = data.PricePoint.map((p) => parsePoint(p, info.decimals, asset));
  return { info, points };
}

/** Feed metadata + current price for one asset (one request). */
export async function getPriceFeedInfo(url: string, asset: string, quote?: string): Promise<PriceFeedInfo> {
  const { where, varDecl } = baseQuoteFilter(quote);
  const data = await gql<{ Feed: RawFeed[] }>(
    url,
    `query PriceFeed($base: String!${varDecl}) { Feed(where: {${where}}) { ${FEED_FIELDS} } }`,
    { base: asset.toUpperCase(), ...(quote ? { quote } : {}) },
  );
  return parseFeed(data.Feed[0], asset);
}

/**
 *  The feed catalog — metadata + current price for every tracked asset, or a
 *  filtered subset (one request). Omit `assets` for all; pass a list for a batch.
 *  An explicit empty list returns no rows (not all) — a batch of zero is zero.
 */
export async function listFeeds(url: string, assets?: string[], quote?: string): Promise<PriceFeedInfo[]> {
  if (assets && assets.length === 0) return [];
  const filtered = assets !== undefined;
  // Compose the operation vars + where conditions from the two optional filters.
  const varDecls = [filtered ? "$bases: [String!]!" : null, quote ? "$quote: String!" : null]
    .filter(Boolean)
    .join(", ");
  const conds = [filtered ? "base: {_in: $bases}" : null, quote ? "quote: {_eq: $quote}" : null]
    .filter(Boolean)
    .join(", ");
  const whereClause = conds ? `where: {${conds}}, ` : "";
  const data = await gql<{ Feed: RawFeed[] }>(
    url,
    `query PriceFeeds${varDecls ? `(${varDecls})` : ""} { Feed(${whereClause}order_by: {base: asc}) { ${FEED_FIELDS} } }`,
    { ...(filtered ? { bases: assets.map((a) => a.toUpperCase()) } : {}), ...(quote ? { quote } : {}) },
  );
  return data.Feed.map((f) => parseFeed(f));
}

/**
 *  Current price for a batch of assets (or all when `assets` is omitted), newest
 *  snapshot per asset — the multi-asset "price wall". Skips assets with no
 *  observations yet.
 */
export async function getLivePrices(url: string, assets?: string[], quote?: string): Promise<LivePrice[]> {
  const feeds = await listFeeds(url, assets, quote);
  return feeds.map((f) => f.latest).filter((p): p is LivePrice => p !== null);
}

/**
 *  Historic ticks for one asset, newest first. Window with `from`/`to` (unix
 *  seconds, chain time); page with `limit`.
 */
export async function getPriceHistory(
  url: string,
  asset: string,
  opts?: { limit?: number; from?: number; to?: number },
  quote?: string,
): Promise<PricePoint[]> {
  // asset + quote → GraphQL variables (never interpolated); from/to are
  // Math.floor'd integers, so plain-number interpolation is injection-safe.
  const clauses: string[] = ["{base: {_eq: $base}}"];
  if (quote) clauses.push("{quote: {_eq: $quote}}");
  if (opts?.from !== undefined) clauses.push(`{blockTimestamp: {_gte: "${Math.floor(opts.from)}"}}`);
  if (opts?.to !== undefined) clauses.push(`{blockTimestamp: {_lte: "${Math.floor(opts.to)}"}}`);
  const data = await gql<{ PricePoint: RawPricePoint[] }>(
    url,
    `query PriceHistory($base: String!, $limit: Int!${quote ? ", $quote: String!" : ""}) {
      PricePoint(where: {_and: [${clauses.join(", ")}]}, order_by: {blockTimestamp: desc}, limit: $limit) { ${POINT_FIELDS} }
    }`,
    { base: asset.toUpperCase(), limit: opts?.limit ?? 500, ...(quote ? { quote } : {}) },
  );
  // decimals is fixed at the oracle's scale (18); no Feed round-trip needed.
  return data.PricePoint.map((p) => parsePoint(p, Types.PRICE_FEED_DECIMALS, asset));
}

/**
 *  OHLC candles for one asset + resolution — the MOST RECENT `limit` (or the
 *  `from`/`to` window when given, unix seconds), returned OLDEST first so it's
 *  chart-ready. Like a klines API: omitting the window yields the latest candles,
 *  not the first ever.
 */
export async function getPriceCandles(
  url: string,
  asset: string,
  resolution: PriceCandleResolution,
  opts?: { limit?: number; from?: number; to?: number },
  quote?: string,
): Promise<PriceCandle[]> {
  // asset + quote → GraphQL variables; resolution is a typed enum literal
  // (M1|H1|D1), from/to are Math.floor'd integers — all injection-safe.
  const clauses: string[] = ["{base: {_eq: $base}}", `{resolution: {_eq: ${resolution}}}`];
  if (quote) clauses.push("{quote: {_eq: $quote}}");
  if (opts?.from !== undefined) clauses.push(`{bucketStart: {_gte: "${Math.floor(opts.from)}"}}`);
  if (opts?.to !== undefined) clauses.push(`{bucketStart: {_lte: "${Math.floor(opts.to)}"}}`);
  // Fetch newest-first so `limit` keeps the MOST RECENT candles (the feed now
  // holds days of history — asc + limit would pin the chart to the oldest ones),
  // then reverse to oldest→newest for charting.
  const data = await gql<{ Candle: RawCandle[] }>(
    url,
    `query PriceCandles($base: String!, $limit: Int!${quote ? ", $quote: String!" : ""}) {
      Candle(where: {_and: [${clauses.join(", ")}]}, order_by: {bucketStart: desc}, limit: $limit) { ${CANDLE_FIELDS} }
    }`,
    { base: asset.toUpperCase(), limit: opts?.limit ?? 500, ...(quote ? { quote } : {}) },
  );
  return data.Candle.reverse().map((c) => parseCandle(asset.toUpperCase(), c, Types.PRICE_FEED_DECIMALS));
}
