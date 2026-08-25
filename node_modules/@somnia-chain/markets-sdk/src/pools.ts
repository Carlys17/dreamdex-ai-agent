// Pools — the CLOB pool records and their market bindings.
//
// A pool address is a TIME-VARYING binding: settlement-extraction v2 recycles one
// pool across successive markets, so `(pool, nonce)` identifies a market's slice
// of a pool's history and a pool alone never identifies a market. These reads are
// how a caller resolves that binding — which market a pool is hosting now, which
// it hosted, and which pools are free for the next one.
//
// Shared across kinds: every kind's CLOB is a pool from the same factory.

import * as IndexerRead from "./indexerRead.js";
import * as Markets from "./markets.js";
import { graphql } from "./gql/gql.js";
import type { PublicClient } from "viem";
import * as ModuleAbi from "./moduleAbi.js";
import type { Address } from "viem";
import type { Market } from "./markets.js";


/**
 *  Resolve a market by its pool address (one query; no live watch), as the
 *  discriminated {@link Market} union — null if no market rests on that pool.
 *  For spot/perp the pool address IS the market id, but binary markets are keyed
 *  by bytes32 marketId, so this looks them up by the `poolAddress` column.
 *
 *  RECYCLE CAVEAT (settlement-extraction v2): a binary pool serves SUCCESSIVE
 *  markets, so several binary rows can share one `poolAddress`. This returns the
 *  NEWEST (the pool's current/latest binding). To address a specific past market
 *  of a recycled pool, key by `marketId` (or match `nonce`) instead.
 */
export async function getMarketByPool(pool: string, indexerUrl: string): Promise<Market | null> {
  const data = await IndexerRead.gqlRequest(MarketByPoolQuery, { pool: pool.toLowerCase() }, indexerUrl);
  const row = data.Market[0];
  return row ? Markets.toMarket(row) : null;
}

// prettier-ignore
const MarketByPoolQuery = graphql(`
  query MarketByPool($pool: String!) {
    Market(
      where: { poolAddress: { _eq: $pool } }
      order_by: { createdAtTimestamp: desc }
      limit: 1
    ) {
      ...MarketFields
    }
  }
`);

// ---------------------------------------------------------------- pool reuse
// Settlement-extraction v2: a BinaryPool is a long-lived contract REUSED across
// successive markets. The indexer keeps a per-pool aggregate (`Pool`) and the
// full audit trail of pool→market bindings (`PoolBinding`) — these reads back
// the explorer's "every market this pool served" view.

/**
 *  One interval in a pool's life during which it was bound 1:1 to a single
 *  market (indexer `PoolBinding`; id = `${pool}_${nonce}`). `MarketCreated`
 *  OPENS a binding; `PoolReleased` or the next `MarketCreated` on the same pool
 *  CLOSES it. An open binding (`toBlock` null) is the pool's current market.
 */
export interface PoolBindingRecord {
  /** `${poolAddress}_${nonce}` */
  id: string;
  /** Lowercased pool address. */
  poolAddress: string;
  /** Lowercased bytes32 marketId this binding served. */
  marketId: string;
  /** Pool market nonce for this binding (decimal string). */
  nonce: string;
  /** Block the binding opened in (the MarketCreated; decimal string). */
  fromBlock: string;
  /** Log index of the opening event within its block. */
  fromLogIndex: number;
  /** Timestamp (unix seconds) the binding opened. */
  fromTimestamp: string;
  /** Null while the binding is open (the pool's current market). */
  toBlock: string | null;
  /** Log index of the closing event; null while the binding is open. */
  toLogIndex: number | null;
  /** Timestamp (unix seconds) the binding closed; null while open. */
  toTimestamp: string | null;
  /**
   *  How the binding closed: `"Released"` (PoolReleased) | `"Rotated"` (the next
   *  MarketCreated recycled the pool onward); null while open.
   */
  closedBy: "Released" | "Rotated" | null;
}

/**
 *  A pool's full binding history, newest (highest nonce) first — every market
 *  the pool has served. The first row with `toBlock === null` is the current
 *  binding; a fully-released pool has no open row.
 */
export async function getPoolBindings(pool: string, indexerUrl: string): Promise<PoolBindingRecord[]> {
  const data = await IndexerRead.gqlRequest(PoolBindingsQuery, { pool: pool.toLowerCase() }, indexerUrl);
  // `closedBy` is a plain String column, narrowed here to the only values the
  // indexer writes ("Rotated" | "Released" | null — see indexer/src/handlers/
  // binary.ts; confirmed against the live indexer). Same asserted-not-proven class
  // as the enum-scalars in codegen.ts.
  return IndexerRead.narrowIndexerInvariant<PoolBindingRecord>(data.PoolBinding);
}

/**
 *  The indexer's per-pool aggregate (`Pool`; id = lowercased pool address) — the
 *  long-lived BinaryPool contract that outlives any single market.
 */
export interface IndexedPool {
  /** Lowercased pool address (== address). */
  id: string;
  /** Lowercased pool address (== id). */
  address: string;
  /** Collateral token the pool is bound to for its whole life (lowercased). */
  collateral: string | null;
  /**
   *  The pool's creator — its first-deploy market creator, the only party that
   *  can reuse it (lowercased).
   */
  creator: string | null;
  /**
   *  marketId of the pool's CURRENT binding; null when finalized + released and
   *  awaiting reuse.
   */
  currentMarketId: string | null;
  /** Pool market nonce of the current binding (decimal string). */
  currentNonce: string | null;
  /** Number of markets this pool has served (== the latest nonce). */
  generationCount: number;
  /** Timestamp (unix seconds) of the pool's first MarketCreated. */
  createdAtTimestamp: string;
  /** Timestamp (unix seconds) of the last binding change. */
  updatedAtTimestamp: string;
}

/**
 *  One pool's aggregate row by address — null if the indexer has never seen a
 *  MarketCreated on it.
 */
export async function getPool(address: string, indexerUrl: string): Promise<IndexedPool | null> {
  const data = await IndexerRead.gqlRequest(PoolByPkQuery,
    { id: address.toLowerCase() },
    indexerUrl,
  );
  return data.Pool_by_pk ?? null;
}

// prettier-ignore
const PoolBindingsQuery = graphql(`
  query PoolBindings($pool: String!) {
         PoolBinding(where: {poolAddress: {_eq: $pool}}, order_by: {nonce: desc}) {
           id poolAddress marketId nonce fromBlock fromLogIndex fromTimestamp
           toBlock toLogIndex toTimestamp closedBy
         }
       }
`);

// prettier-ignore
const PoolByPkQuery = graphql(`
  query PoolByPk($id: String!) {
         Pool_by_pk(id: $id) {
           id address collateral creator currentMarketId currentNonce generationCount
           createdAtTimestamp updatedAtTimestamp
         }
       }
`);

/**
 *  A creator's free (finalized + released, reusable) pools for `collateral`,
 *  LIFO order (the LAST entry is popped first on the creator's next
 *  createMarket). Pure chain read (no signer).
 */
export async function getFreePools(
  creator: Address,
  collateral: Address,
  module: Address,
  client: PublicClient,
): Promise<Address[]> {
  const pools = (await client.readContract({
    address: module,
    abi: ModuleAbi.binaryModuleReadAbi,
    functionName: "getFreePools",
    args: [creator, collateral],
  }));
  return [...pools];
}
