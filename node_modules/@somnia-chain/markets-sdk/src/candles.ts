// Candles — OHLCV buckets, shared across every market kind.
//
// The indexer aggregates fills into fixed buckets; `CANDLE_INTERVALS` is the set
// it materializes, so a caller can only ask for a bucket that exists (an
// arbitrary interval would silently return nothing).
//
// Read-only: candles are derived history. An empty array means "no buckets in
// range", never "the read failed".

import * as IndexerRead from "./indexerRead.js";
import { graphql } from "./gql/gql.js";


// `openPrice`/`closePrice` are suffixed because `open`/`close` are envio reserved words.
/**
 *  One OHLCV candle (mirror of the indexer `Candle` entity). Candles exist for
 *  ANY pool — spot or binary — so this is unprefixed, not binary-specific.
 *  Prices are raw quote units per whole base (binary: the YES-probability
 *  scale, same as `lastPrice`); volumes are raw.
 */
export type Candle = {
  /** Bucket-open timestamp (unix seconds), aligned to the interval. */
  bucketStart: string;
  /** First fill price in the bucket (raw). */
  openPrice: string;
  /** Highest fill price in the bucket (raw). */
  high: string;
  /** Lowest fill price in the bucket (raw). */
  low: string;
  /** Last fill price in the bucket (raw). */
  closePrice: string;
  /** Base/outcome-token volume in the bucket (raw). */
  baseVolume: string;
  /** Quote/collateral volume in the bucket (raw). */
  quoteVolume: string;
  /** Number of fills in the bucket. */
  tradeCount: number;
};

/**
 *  OHLCV candles for one pool + interval (any market type), oldest-first
 *  (ready for charting).
 */
export async function getCandles(
  poolAddress: string,
  intervalSeconds: number,
  opts: { limit?: number; from?: number; to?: number } = {},
  indexerUrl: string,
): Promise<Candle[]> {
  const where: Record<string, unknown> = {
    pool: { _eq: poolAddress.toLowerCase() },
    intervalSeconds: { _eq: intervalSeconds },
  };
  const bs: Record<string, number> = {};
  if (opts.from != null) bs._gte = opts.from;
  if (opts.to != null) bs._lte = opts.to;
  if (Object.keys(bs).length) where.bucketStart = bs;
  const data = await IndexerRead.gqlRequest(CandlesQuery,
    { where, limit: opts.limit ?? 500 },
    indexerUrl,
  );
  return data.Candle.slice().reverse();
}

/**
 *  Candle bucket sizes (seconds): 1m, 5m, 15m, 1h, 4h, 1d — the intervals the
 *  indexer rolls up. Keep in lockstep with `indexer/src/intervals.ts`
 *  (CANDLE_INTERVALS) so {@link SomniaMarketsClient.getCandles} is only ever asked for a bucket the
 *  indexer actually materializes.
 */
export const CANDLE_INTERVALS = [60, 300, 900, 3600, 14400, 86400] as const;

// prettier-ignore
const CandlesQuery = graphql(`
  query Candles($where: Candle_bool_exp!, $limit: Int) {
        Candle(where: $where, order_by: {bucketStart: desc}, limit: $limit) {
          bucketStart openPrice high low closePrice baseVolume quoteVolume tradeCount
        }
      }
`);
