// Cache-key identity for the client's one-shot reads. Consumers that hold
// results in a query cache (TanStack Query, SWR, …) need one canonical key per
// read; hand-written string literals drift apart across files and split the
// cache silently. These factories are plain functions — no query library is
// imported or required — returning readonly, JSON-serializable arrays with the
// invariants a cache needs:
//
//   - equal logical inputs give deep-equal keys (`{}` and `{ limit: undefined }`
//     are the same input; addresses/ids are case-folded),
//   - an input that changes the read's result changes the key,
//   - every element survives `JSON.stringify` unchanged (no `undefined`, no
//     `bigint`).
//
// The first element scopes all keys away from an app's own; invalidate
// everything SDK-shaped with a `["somnia-markets"]` prefix match.
//
// One module rather than a key per concept module: a cache key's one hard
// invariant — no two reads share a key — is only auditable (and testable, see
// test/hooks.test.ts) with every key side by side. The concept here is cache
// identity itself, not the reads it names.

import type { PortfolioOptions } from "./binary/portfolio.js";
import type { MarketCreatorFilter } from "./marketCreatorAdmin.js";
import type { MarketType } from "./markets.js";
import type { OperatorFilter } from "./operatorAdmin.js";

/** First element of every {@link ClientQueryKey} — match on it to invalidate all SDK reads at once. */
export const QUERY_KEY_SCOPE = "somnia-markets";

/** One element of a {@link ClientQueryKey} — JSON-serializable by construction. */
export type QueryKeyElement =
  | string
  | number
  | boolean
  | null
  | Readonly<Record<string, string | number | boolean>>;

/** A cache key for one client read: `["somnia-markets", <read>, …inputs]`. */
export type ClientQueryKey = readonly QueryKeyElement[];

/** Drop `undefined` fields so `{}` and `{ limit: undefined }` produce the same key. */
function pruned(
  opts: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Case-fold an address / hex id; `null` keeps a disabled query's key serializable. */
function id(value: string | null | undefined): string | null {
  return value == null ? null : value.toLowerCase();
}

/** Key for `client.listMarkets(opts)`. */
export function marketsKey(opts?: {
  /** Restrict to one market kind. */
  marketType?: MarketType;
  /** Page size. */
  limit?: number;
  /** Page offset. */
  offset?: number;
}): ClientQueryKey {
  return [
    QUERY_KEY_SCOPE,
    "markets",
    pruned({ marketType: opts?.marketType, limit: opts?.limit, offset: opts?.offset }),
  ];
}

/** Key for `client.getPortfolio(account, opts)`. */
export function portfolioKey(account: string | null | undefined, opts?: PortfolioOptions): ClientQueryKey {
  return [
    QUERY_KEY_SCOPE,
    "portfolio",
    id(account),
    pruned({ ordersLimit: opts?.ordersLimit, tradesLimit: opts?.tradesLimit, since: opts?.since }),
  ];
}

/** Key for `client.getCandles(pool, intervalSeconds, opts)`. */
export function candlesKey(
  pool: string | null | undefined,
  intervalSeconds: number,
  opts?: {
    /** Max candles. */
    limit?: number;
    /** Range start (unix seconds). */
    from?: number;
    /** Range end (unix seconds). */
    to?: number;
  },
): ClientQueryKey {
  return [
    QUERY_KEY_SCOPE,
    "candles",
    id(pool),
    intervalSeconds,
    pruned({ limit: opts?.limit, from: opts?.from, to: opts?.to }),
  ];
}

/** Key for `client.getMarketFees(marketId)`. */
export function marketFeesKey(marketId: string | null | undefined): ClientQueryKey {
  return [QUERY_KEY_SCOPE, "marketFees", id(marketId)];
}

/** Key for `client.listOperators(opts)`. */
export function operatorsKey(
  opts?: OperatorFilter & {
    /** Page size. */
    limit?: number;
    /** Page offset. */
    offset?: number;
  },
): ClientQueryKey {
  return [
    QUERY_KEY_SCOPE,
    "operators",
    pruned({
      owner: opts?.owner?.toLowerCase(),
      enabled: opts?.enabled,
      limit: opts?.limit,
      offset: opts?.offset,
    }),
  ];
}

/** Key for `client.listMarketCreators(opts)`. */
export function marketCreatorsKey(
  opts?: MarketCreatorFilter & {
    /** Page size. */
    limit?: number;
    /** Page offset. */
    offset?: number;
  },
): ClientQueryKey {
  return [
    QUERY_KEY_SCOPE,
    "marketCreators",
    pruned({
      owner: opts?.owner?.toLowerCase(),
      operatorId: opts?.operatorId,
      venueId: opts?.venueId?.toLowerCase(),
      limit: opts?.limit,
      offset: opts?.offset,
    }),
  ];
}

/** Key for `client.listOracleAdapters(opts)`. */
export function oracleAdaptersKey(opts?: {
  /** Restrict to adapters owned by this address. */
  owner?: string;
  /** Restrict to approved (true) / unapproved (false) adapters. */
  approved?: boolean;
  /** Page size. */
  limit?: number;
  /** Page offset. */
  offset?: number;
}): ClientQueryKey {
  return [
    QUERY_KEY_SCOPE,
    "oracleAdapters",
    pruned({
      owner: opts?.owner?.toLowerCase(),
      approved: opts?.approved,
      limit: opts?.limit,
      offset: opts?.offset,
    }),
  ];
}

/** Key for `client.getSyncStatus(chainId)`. */
export function syncStatusKey(chainId: number): ClientQueryKey {
  return [QUERY_KEY_SCOPE, "syncStatus", chainId];
}

/** Key for `client.getMaxVenueFeeBps()`. */
export function maxVenueFeeBpsKey(): ClientQueryKey {
  return [QUERY_KEY_SCOPE, "maxVenueFeeBps"];
}

/** Key for `client.getMarketOnchain(marketId)`. */
export function marketOnchainKey(marketId: string | null | undefined): ClientQueryKey {
  return [QUERY_KEY_SCOPE, "marketOnchain", id(marketId)];
}
