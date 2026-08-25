// Indexer sync status — how far behind head the indexer is.
//
// The one read whose answer is about the DATA SOURCE rather than the protocol: a
// UI uses it to decide whether an indexer-backed number is trustworthy right now,
// or whether to prefer a chain read. Kept separate from the concepts it qualifies
// precisely because it belongs to none of them.

import * as IndexerRead from "./indexerRead.js";
import { graphql } from "./gql/gql.js";

/**
 *  The indexer's own sync state for one chain (envio `chain_metadata`). Compare
 *  `latestProcessedBlock` to `blockHeight` to gauge indexer lag.
 */
export type IndexerSyncStatus = {
  /** Chain id the row describes. */
  chainId: number;
  /** Last block the indexer fully processed; null before the first block lands. */
  latestProcessedBlock: number | null;
  /** Chain head height as the indexer last saw it; null until first fetched. */
  blockHeight: number | null;
  /**
   *  Lifetime count of events the indexer has processed on this chain. `null` on
   *  the rare row where envio has not populated the counter yet — Hasura declares
   *  the column nullable, so this is the wire's shape, not a defensive guess.
   */
  numEventsProcessed: number | null;
};

/**
 *  First operation on the typed path (see {@link gqlRequest}): result and
 *  variables are DERIVED from the committed schema snapshot, so selecting a field
 *  `chain_metadata` does not have — or assuming the wrong nullability — fails
 *  `pnpm codegen` / `pnpm typecheck` rather than at runtime on every call.
 */
// prettier-ignore
const SyncStatusQuery = graphql(`
  query SyncStatus($chainId: Int!) {
    chain_metadata(where: { chain_id: { _eq: $chainId } }) {
      chain_id
      latest_processed_block
      block_height
      num_events_processed
    }
  }
`);

/**
 *  Indexer sync state from chain_metadata (the indexer's own view of head).
 *  Null if the indexer has no row for this chain; throws on request failure.
 */
export async function getSyncStatus(
  chainId: number,
  indexerUrl: string,
): Promise<IndexerSyncStatus | null> {
  const data = await IndexerRead.gqlRequest(SyncStatusQuery, { chainId }, indexerUrl);
  const row = data.chain_metadata[0];
  if (!row) return null;
  return {
    // The row was selected BY chain_id, so it equals the argument — Hasura types
    // the column nullable (it has no notion of the filter), but a matched row
    // cannot carry a null here. Prefer the known argument over asserting.
    chainId,
    latestProcessedBlock: row.latest_processed_block,
    blockHeight: row.block_height,
    numEventsProcessed: row.num_events_processed,
  };
}
