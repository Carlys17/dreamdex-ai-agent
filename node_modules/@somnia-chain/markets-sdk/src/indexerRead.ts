// The typed-read plumbing every indexer-backed concept module shares.
//
// `gqlRequest` takes a GENERATED typed document only, so a selection, filter or
// sort the indexer does not have fails `pnpm gql:codegen` / `pnpm typecheck`
// rather than throwing per call at runtime. The transport underneath is
// graphqlBoundary.ts (which turns any failure-to-complete into IndexerError);
// this module is the typed door onto it, plus the small helpers every concept
// needs to build a Hasura `where`.
//
// A LEAF module by design: it imports the boundary and the generated types, and
// nothing else in src/ — so no concept module can create a cycle through it.

import * as GraphqlBoundary from "./graphqlBoundary.js";
import { IndexerError, InvalidInputError } from "./errors.js";
import type { TypedDocumentString } from "./gql/graphql.js";


/**
 *  Default per-request ceiling (ms) so a hung/unreachable indexer surfaces a
 *  timeout instead of a promise that never settles.
 */
const GQL_TIMEOUT_MS = 30_000;

/**
 *  Cancellation signals, keyed by the endpoint URL the reads already carry.
 *
 *  **Details**
 *
 *  WHY A REGISTRY. Every concept read ends in `(…, indexerUrl, headers?)` — the
 *  exact tail `clientConformance.ts` strips to prove the client and its modules
 *  still agree. Threading a signal parameter through all ~105 of them would
 *  change that tail, break the conformance type, and put a transport concern in
 *  every read's signature. So the client registers its signal once, against the
 *  url it passes anyway, and the boundary picks it up.
 *
 *  A `WeakRef` so a discarded client's signal cannot pin it in memory, and keyed
 *  by url rather than by client identity because the url is what actually reaches
 *  this layer.
 *
 *  **Gotchas**
 *
 *  Two clients on the SAME url: the later registration wins, which is why
 *  {@link registerIndexerSignal} returns an unregister function — `createClient`
 *  holds it for the client's lifetime.
 */
const signals = new Map<string, WeakRef<AbortSignal>>();

/**
 *  Bind `signal` to every indexer read that goes to `indexerUrl`. Returns the
 *  unregister function; call it when the owning client is discarded.
 *
 *  Used by `createClient` for `ClientConfig.signal` — not part of the public API.
 */
export function registerIndexerSignal(indexerUrl: string, signal: AbortSignal): () => void {
  const ref = new WeakRef(signal);
  signals.set(indexerUrl, ref);
  return () => {
    // Only clear our own entry: a later client on the same url replaced it, and
    // that client's signal must outlive this unregister.
    if (signals.get(indexerUrl) === ref) signals.delete(indexerUrl);
  };
}

/** The registered signal for `indexerUrl`, if one is still live. */
function signalFor(indexerUrl: string): AbortSignal | undefined {
  const ref = signals.get(indexerUrl);
  if (!ref) return undefined;
  const signal = ref.deref();
  if (!signal) {
    signals.delete(indexerUrl);
    return undefined;
  }
  return signal;
}

/**
 *  Recursively collect dotted paths of variable values `JSON.stringify` would
 *  silently drop (`undefined`) or that a Next.js `"use client"` boundary rewrote
 *  into a throwing stub (`function`). Walking nested objects catches the subtle
 *  case too: a `where` sub-object with `{ _eq: undefined }` — which would
 *  serialize away and collapse the filter to `IS NULL`, silently dropping rows.
 */
function findBadVariablePaths(value: unknown, path: string, out: string[]): void {
  if (value === undefined) {
    out.push(`${path}=undefined`);
    return;
  }
  if (typeof value === "function") {
    out.push(`${path}=<client-boundary stub function>`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findBadVariablePaths(v, `${path}[${i}]`, out));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    findBadVariablePaths(v, path ? `${path}.${k}` : k, out);
  }
}

/**
 *  A generated, typed operation: carries its own result and variables types, so
 *  neither is self-declared at the call site. `documentMode: "string"` means the
 *  document IS its text (a `String` subclass), so the bytes on the wire are
 *  identical to the template strings these replace.
 *
 *  The generated class itself, NOT a structural stand-in. A structural shape here
 *  would be satisfied by a plain `string` — it has `toString()`, and optional
 *  markers like `__apiType` / `__meta__` are vacuously met — which would let raw
 *  query text slip onto the typed path. `TypedDocumentString` carries a `private`
 *  member, so it is nominal: only `graphql()` output can produce one.
 */
export type TypedDocument<TResult, TVariables> = TypedDocumentString<TResult, TVariables>;

/**
 *  Issue a GraphQL read against the indexer.
 *
 *  Takes a GENERATED typed document only: its result and variable types derive from
 *  the committed schema snapshot, so a selection, alias, filter or sort the indexer
 *  does not have fails `pnpm gql:codegen` / `pnpm typecheck` instead of throwing on
 *  every call at runtime. This is the shape every indexer read in this file uses.
 *
 *  Runtime-assembled queries cannot be documents (`graphql()` resolves its overloads
 *  from the literal source string) — they call {@link gqlRequestDynamic}, whose only
 *  caller is {@link aggregateCount}. Both share the request path below: same
 *  bad-variable walk, same timeout, same throw-on-failure contract.
 */
export async function gqlRequest<TResult, TVariables extends Record<string, unknown>>(
  document: TypedDocument<TResult, TVariables>,
  variables: TVariables,
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<TResult> {
  return sendGraphql<TResult>(document.toString(), variables, indexerUrl, headers);
}

/**
 *  Escape hatch for the ONE read whose query text is assembled per call (the entity
 *  name is a parameter) — see {@link aggregateCount} for why it cannot be a typed
 *  document and what that costs. `T` is self-declared here, so nothing checks it
 *  against the schema.
 *
 *  Deliberately NOT the same name as {@link gqlRequest}: a new read that reaches for
 *  this has to type the name out, which is the point. New reads are typed documents.
 */
export async function gqlRequestDynamic<T>(
  query: string,
  variables: Record<string, unknown>,
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<T> {
  return sendGraphql<T>(query, variables, indexerUrl, headers);
}

async function sendGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<T> {
  // Fail fast with the query name + the dotted path of the bad variable so the
  // call site (not an opaque Hasura wire error) surfaces first. Deep-walks the
  // variables — see findBadVariablePaths for the two failure modes it catches.
  const operation = query.match(/query\s+(\w+)/)?.[1] ?? "anonymous";
  const bad: string[] = [];
  for (const [k, v] of Object.entries(variables)) findBadVariablePaths(v, k, bad);
  // A bad variable is the CALLER's mistake, caught before the request goes out —
  // so it is InvalidInputError, not IndexerError (which always means "the read
  // didn't complete").
  if (bad.length) {
    throw new InvalidInputError(`gqlRequest(${operation}): unusable variable(s): ${bad.join(", ")}`);
  }

  // The request itself goes through the shared indexer boundary, which turns
  // every failure-to-complete into an IndexerError with `cause` chained. It
  // preserves the server's own wording — aggregateCount detects the "aggregate
  // field absent on this role" case by matching /aggregate/ + /not found/ on the
  // message, and that fallback must keep working.
  return GraphqlBoundary.postGraphql<T>(indexerUrl, query, variables, {
    headers,
    timeoutMs: GQL_TIMEOUT_MS,
    signal: signalFor(indexerUrl),
  });
}

/**
 *  Count rows via Hasura `_aggregate` (O(1)). envio exposes `_aggregate` only to
 *  a privileged role, reached by sending a Hasura admin-secret header
 *  (`ClientConfig.indexerHeaders`, server-only). When that header is present this
 *  is a single fast count. When it is NOT — the request lands on the public role,
 *  where the aggregate field does not exist and Hasura returns
 *  `field 'X_aggregate' not found in type: 'query_root'` — we fall back to a
 *  BOUNDED row count so the caller still gets a total (accurate up to
 *  {@link COUNT_FALLBACK_CAP}) instead of throwing and blanking the page. Any
 *  other error (bad filter, indexer down) still surfaces.
 *
 *  THE ONE TYPED-DOCUMENT EXEMPTION. Every other indexer read in this file is a
 *  generated `graphql()` document whose result and variables derive from the
 *  committed schema snapshot. These two cannot be: the ENTITY NAME is a parameter,
 *  so the query text is assembled per call — and `graphql()` resolves its overloads
 *  from the literal source string, which a template with a `${table}` hole does not
 *  have. Generating one document per (table × aggregate/fallback) pair would be 10
 *  near-identical documents to keep in step, for two queries whose result shape is
 *  a single integer.
 *
 *  What that costs: a wrong `whereType` or a renamed `id` column here surfaces as a
 *  Hasura runtime error, not a compile error. Contained deliberately — `table` is a
 *  closed union of five entity names, the selections are `{ aggregate { count } }`
 *  and `{ id }`, and the sdk-e2e suite exercises the count helpers against a live
 *  indexer. Do NOT widen `table` to `string`, and do not add new callers of the
 *  untyped {@link gqlRequest} overload: new reads are typed documents.
 */
const COUNT_FALLBACK_CAP = 10_000;

export async function aggregateCount(
  table: "Market" | "Operator" | "Venue" | "Order" | "Fill",
  whereType: string,
  where: Record<string, unknown>,
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<number> {
  try {
    const data = await gqlRequestDynamic<Record<string, { aggregate: { count: number } }>>(
      `query Count($where: ${whereType}!) { ${table}_aggregate(where: $where) { aggregate { count } } }`,
      { where },
      indexerUrl,
      headers,
    );
    // Dynamic key: the flag is right that Hasura could omit it (a renamed
    // entity), and the aggregate fallback below is exactly that case.
    const agg = data[`${table}_aggregate`];
    if (!agg) throw new IndexerError("aggregateCount", `${table}_aggregate not found in response`);
    return agg.aggregate.count;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Only the "aggregate field absent on this role" case falls back.
    if (!(/aggregate/i.test(msg) && /not found/i.test(msg))) throw e;
    const rows = await gqlRequestDynamic<Record<string, { id: string }[]>>(
      `query CountFallback($where: ${whereType}!) { ${table}(where: $where, limit: ${COUNT_FALLBACK_CAP}) { id } }`,
      { where },
      indexerUrl,
      headers,
    );
    return (rows[table] ?? []).length;
  }
}

/**
 *  Narrow an indexer row to a public type that is stricter than the schema.
 *
 *  Hasura must declare every market-type-specific column nullable — a column has
 *  to be null for the OTHER market types — and it types object relationships
 *  (`market`) nullable even when the owning row's `market_id` is `String!`. A
 *  query filtered to BINARY rows (or reading a binary-only entity such as
 *  `OutcomeBalance`) therefore receives non-null values the SCHEMA still calls
 *  nullable.
 *
 *  Two shapes of that gap, both unprovable by GraphQL:
 *
 *  - NULLABILITY a query's own filter guarantees (a BINARY-scoped query's binary
 *    columns; an object relationship whose owning `*_id` is non-null);
 *  - a VALUE SET the indexer controls but the column does not declare (e.g.
 *    `PoolBinding.closedBy`, a `String` the handlers only ever set to "Rotated" /
 *    "Released").
 *
 *  Same treatment as {@link toMarket}: one named seam instead of scattered casts,
 *  so every place trusting the indexer's handlers is greppable. Field NAMES and
 *  WIRE TYPES stay compiler-checked either side of it.
 *
 *  Verified against the live indexer: `OutcomeBalance` rows are BINARY-only, with
 *  non-null `market`/`asset`/`question`. The spot equivalents are scoped the same
 *  way (`market: {marketType: {_eq: "SPOT"}}`, or a registry-scoped StopOrder).
 */
export function narrowIndexerInvariant<T>(rows: readonly unknown[]): T[] {
  return rows as T[];
}
