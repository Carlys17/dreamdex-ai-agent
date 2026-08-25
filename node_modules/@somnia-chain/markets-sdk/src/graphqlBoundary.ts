// The GraphQL-over-HTTP boundary, shared by the three modules that speak to an
// indexer: the concept modules (the typed reads), snapshot.ts (hydration), and
// priceFeed/query.ts (the price feed's own Hasura).
//
// Each of those had its own copy of "POST, check res.ok, check json.errors,
// check json.data" throwing raw Errors. One shared funnel means one place
// decides what a failed indexer read looks like to a caller — an IndexerError
// naming the operation, with the original in `cause`.
//
// The absence-vs-failure contract lives ABOVE this helper: every throw here means
// "the read did not complete". A read that completes and finds nothing returns
// its empty data upward, where the caller turns it into `null` / `[]`.

import { IndexerError } from "./errors.js";

/** Reads the operation name out of a GraphQL document, for the error message. */
export function operationNameOf(query: string): string {
  return query.match(/(?:query|mutation|subscription)\s+(\w+)/)?.[1] ?? "anonymous";
}

/**
 *  The `signal` to hand `fetch`: the caller's, the timeout's, or both.
 *
 *  `AbortSignal.any` combines them where available (Node 20.3+, current
 *  browsers). This package declares no `engines` floor and ships to browsers, so
 *  when it is missing the caller's signal wins — losing the timeout bound is the
 *  safe direction to degrade, because dropping the CALLER's signal instead would
 *  silently un-cancel a request they explicitly aborted.
 */
function signalFor(options: { timeoutMs?: number; signal?: AbortSignal }): { signal?: AbortSignal } {
  const timeout = options.timeoutMs !== undefined ? AbortSignal.timeout(options.timeoutMs) : undefined;
  if (!options.signal) return timeout ? { signal: timeout } : {};
  if (!timeout) return { signal: options.signal };
  return {
    signal:
      typeof AbortSignal.any === "function" ? AbortSignal.any([options.signal, timeout]) : options.signal,
  };
}

/**
 *  POSTs a GraphQL request and returns its `data`, throwing {@link IndexerError}
 *  on any failure to complete.
 *
 *  @param endpoint - Absolute URL of the GraphQL endpoint.
 *  @param query - The document text (its operation name is used in errors).
 *  @param variables - Variables for the document.
 *  @param options - `headers` merged into the request; `timeoutMs` bounds it;
 *  `signal` cancels it (combined with `timeoutMs` — whichever fires first wins);
 *  `label` overrides the operation name in error messages (use it when the
 *  endpoint is not the main indexer, e.g. `"price-feed getCandles"`).
 *  @returns The response's `data` payload.
 *
 *  @throws {@link IndexerError} — the request failed, returned a non-2xx, replied
 *  with a GraphQL `errors` payload, or carried no `data`. The underlying failure
 *  is in `cause`, and the server's own wording is preserved in the message (some
 *  callers branch on it — see `aggregateCount`'s missing-`_aggregate` fallback).
 *  @throws The caller's own abort reason, re-thrown UNWRAPPED when `signal` is
 *  what ended the request — a cancellation is not an indexer failure, and code
 *  that checks `err.name === "AbortError"` (or compares against its own
 *  `controller.signal.reason`) must still see it. A `timeoutMs` expiry is a
 *  failure and stays an {@link IndexerError}.
 */
export async function postGraphql<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
    label?: string;
  } = {},
): Promise<T> {
  const operation = options.label ?? operationNameOf(query);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ query, variables }),
      // Never let a framework fetch cache stand between the indexer and the UI —
      // Next.js would otherwise serve a stale response to `router.refresh()`.
      // Indexer reads are always point-in-time.
      cache: "no-store",
      ...signalFor(options),
    });
  } catch (cause) {
    // A caller-requested cancellation is not an indexer failure. Surface their
    // abort as-is so `name === "AbortError"` checks and React's
    // "ignore the aborted render" idiom keep working; anything else is ours.
    if (options.signal?.aborted) throw options.signal.reason;
    throw new IndexerError(operation, cause instanceof Error ? cause.message : String(cause), { cause });
  }

  if (!res.ok) throw new IndexerError(operation, `HTTP ${res.status}`);

  let json: { data?: T; errors?: { message: string }[] };
  try {
    json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  } catch (cause) {
    throw new IndexerError(operation, "response was not JSON", { cause });
  }

  const gqlError = json.errors?.[0];
  if (gqlError) throw new IndexerError(operation, gqlError.message);
  if (!json.data) throw new IndexerError(operation, "empty response (no data)");
  return json.data;
}
