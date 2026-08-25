// Fills — the executed-trade tape, shared across every market kind.
//
// One `Fill` entity serves spot, perp and binary (the OrderBook core emits one
// `OrderFilled` for all of them), so this is a SHARED concept rather than a
// per-kind one: `pool` scopes a query to a market, and the rows carry whatever
// kind that pool hosts.
//
// Read-only by nature — a fill is something the chain did, never something a
// caller asks for. Errors propagate (see CONVENTIONS.md): an empty array means
// "no fills", never "the read failed".

import * as IndexerRead from "./indexerRead.js";
import { graphql } from "./gql/gql.js";
import type { BinaryFillKind, BinarySide } from "./store.js";


/** Options for {@link SomniaMarketsClient.getFills} / {@link SomniaMarketsClient.getUserFills}. All optional. */
export type FillsOptions = {
  /** Max rows (default 50). */
  limit?: number;
  /** Row offset for paging the tape (default 0). */
  offset?: number;
  /** Only fills at/after this unix-seconds timestamp. */
  since?: number;
  /** Only fills at/before this unix-seconds timestamp. */
  until?: number;
};

// prettier-ignore
const FillQueryFields = graphql(`
  fragment FillQueryFields on Fill {
    id
    market: market_id
    pool
    fillPrice
    quantity
    quoteQuantity
    maker
    makerSide
    taker
    takerSide
    kind
    takerIsBid
    timestamp
    txHash
    # The taker's ORDER, not just the denormalized copy on the fill. On binary
    # the fill's takerSide is backfilled by the PendingTakerFill bridge only
    # once BinaryOrderPlaced lands, so it can still be null on a row whose
    # taker is already stamped. The Order carries the authoritative side from
    # the moment it exists, which is what the portfolio reads have always used.
    takerOrder { owner side }
  }
`);

/**
 *  Recent fills for a pool (either market type), newest first — a one-shot
 *  indexer query. For a continuously-updating trade tape on a binary pool, use
 *  the live-store reader `getLiveFills` (or the `useLiveFills` hook) instead.
 *  @param pool - Pool address (case-insensitive).
 *  @param opts - Paging + `since`/`until` window ({@link FillsOptions}).
 */
export async function getFills(pool: string, opts: FillsOptions = {}, indexerUrl: string): Promise<FillRow[]> {
  const where = applyFillWindow({ pool: { _eq: pool.toLowerCase() } }, opts);
  const data = await IndexerRead.gqlRequest(FillsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Fill;
}

/**
 *  Fills a user participated in (as maker OR taker), newest first — the one-shot
 *  indexer counterpart to the live-store `getLiveUserFills`. Optionally scoped to
 *  one pool and/or a `since`/`until` window.
 */
export async function getUserFills(
  account: string,
  opts: FillsOptions & { pool?: string } = {},
  indexerUrl: string,
): Promise<FillRow[]> {
  const acct = account.toLowerCase();
  const where: Record<string, unknown> = { _or: participatedAs(acct) };
  if (opts.pool != null) where.pool = { _eq: opts.pool.toLowerCase() };
  applyFillWindow(where, opts);
  const data = await IndexerRead.gqlRequest(UserFillsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Fill;
}

/**
 *  Server-side COUNT of the fills `account` participated in (maker OR taker),
 *  optionally scoped to one pool + a `since`/`until` window — a history-page
 *  total without fetching rows (Hasura `Fill_aggregate`, bounded fallback on
 *  the public role).
 */
export async function countUserFills(
  account: string,
  opts: FillsOptions & { pool?: string } = {},
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<number> {
  const acct = account.toLowerCase();
  const where: Record<string, unknown> = { _or: participatedAs(acct) };
  if (opts.pool != null) where.pool = { _eq: opts.pool.toLowerCase() };
  applyFillWindow(where, opts);
  return IndexerRead.aggregateCount("Fill", "Fill_bool_exp", where, indexerUrl, headers);
}

/**
 *  One fill as the indexer recorded it (mirror of the unified `Fill` entity —
 *  spot, perp and binary fills share it).
 */
export type FillRow = {
  /** Fill id (`${blockNumber}_${logIndex}`). */
  id: string;
  /**
   *  The market's bytes32 marketId — the STABLE identity of the market this fill
   *  executed in.
   *
   *  Group and label by this, never by `pool` alone: a binary pool is recycled
   *  across successive markets, so fills from a pool's earlier life carry the
   *  same pool address as the market currently on it. On SPOT/PERP the pool
   *  address IS the market id. Pass it to
   *  {@link SomniaMarketsClient.getMarket | client.getMarket} for the full row.
   */
  market: string;
  /**
   *  Lowercased pool address the fill executed on. A TIME-VARYING binding — see
   *  `market` for the identity that does not move.
   */
  pool: string;
  /**
   *  Execution price, raw quote units per whole base (binary: YES-probability
   *  scale). SPOT/PERP: the maker's limit price.
   */
  fillPrice: string;
  /** Base/outcome-token quantity filled, raw units. */
  quantity: string;
  /** Quote/collateral value = quantity × fillPrice / 10^baseDecimals (raw, floored). */
  quoteQuantity: string;
  /** Maker (resting) wallet, lowercased; null when unknown. */
  maker: string | null;
  /** BINARY only — the maker's YES/NO side; null on SPOT/PERP. */
  makerSide: BinarySide | null;
  /**
   *  Taker wallet, lowercased. Denormalized from the taker's OrderPlaced (which
   *  fires after the fill in the same tx) — null until that bridge lands.
   */
  taker: string | null;
  /**
   *  BINARY only — the taker's YES/NO side; null on SPOT/PERP or until the
   *  taker's OrderPlaced is bridged.
   */
  takerSide: BinarySide | null;
  /**
   *  BINARY only — how the fill settled (direct trade vs mint/burn of a pair);
   *  null on SPOT/PERP or until the taker side is known.
   */
  kind: BinaryFillKind | null;
  /**
   *  True when the taker bought the base/YES (the maker was the ask); null until
   *  the taker side is known.
   */
  takerIsBid: boolean | null;
  /**
   *  The taker's ORDER (owner + side), when the indexer has it.
   *
   *  Prefer `takerOrder.side` over {@link FillRow.takerSide} on binary: the
   *  latter is a denormalized copy the taker bridge backfills, so it lags and
   *  can be null on a row that already names its taker.
   */
  takerOrder: { owner: string; side: BinarySide | null } | null;
  /** Timestamp (unix seconds) of the fill. */
  timestamp: string;
  /** Tx hash the fill landed in. */
  txHash: string;
};

/**
 *  The three ways an account appears on a fill.
 *
 *  `Fill.taker` is denormalized ONLY on spot — the schema says so, and it is
 *  populated by the PendingTakerFill bridge because the taker's `OrderPlaced`
 *  fires after the fill. On BINARY it is null, and the account is reachable only
 *  through the taker ORDER's owner. Matching on `maker`/`taker` alone therefore
 *  drops every binary fill the account took, at any limit — the portfolio reads
 *  have always carried this join for exactly that reason
 *  (`binary/portfolio.ts`: "taker isn't denormalized on the binary Fill").
 */
function participatedAs(acct: string): Record<string, unknown>[] {
  return [{ maker: { _eq: acct } }, { taker: { _eq: acct } }, { takerOrder: { owner: { _eq: acct } } }];
}

/** Add a `since`/`until` window to a Fill `where` object (unix seconds). */
function applyFillWindow(where: Record<string, unknown>, opts: FillsOptions): Record<string, unknown> {
  const ts: Record<string, number> = {};
  if (opts.since != null) ts._gte = opts.since;
  if (opts.until != null) ts._lte = opts.until;
  if (Object.keys(ts).length) where.timestamp = ts;
  return where;
}

// ---------------------------------------------------------------------------
// Typed documents for the reads above. Hoisted here (rather than inline at each
// call site) to keep this file's reading order: functions first, GraphQL after.
// Result and variable types are derived from the committed schema snapshot.

// prettier-ignore
const FillsQuery = graphql(`
  query Fills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {
        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {
          ...FillQueryFields
        }
      }
`);

// prettier-ignore
const UserFillsQuery = graphql(`
  query UserFills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {
        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {
          ...FillQueryFields
        }
      }
`);
