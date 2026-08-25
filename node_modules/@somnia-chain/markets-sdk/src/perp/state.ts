// Perp market state — mark/index price, funding, open interest, positions.
//
// PERP-ONLY: funding rates and open interest are perp mechanics (a perpetual has
// no expiry, so funding is what tethers it to the index). `pokeFunding` is the
// keeper verb that settles the accumulated rate.

import { ChainDoesNotSupportContract, type Address, type PublicClient } from "viem";
import * as ReadsAbi from "../readsAbi.js";
import * as TradeAbi from "../tradeAbi.js";
import * as ActionsAbi from "../actionsAbi.js";
import * as IndexerRead from "../indexerRead.js";
import { graphql } from "../gql/gql.js";
import type { Writer as WriterCtx } from "../writer.js";
import type { TxResult } from "../trade.js";
/**
 *  A perp pool's live pricing/funding state, read straight from chain in one
 *  pipelined fan-out. Fresher than the indexed Market row (funding fields there
 *  only update when FundingUpdated fires, i.e. per settlement window).
 */
export interface PerpStateOnchain {
  /** EMA-smoothed oracle mark price (raw quote units per whole base). */
  markPrice: bigint;
  /**
   *  Whether the mark feed is live. When false, `markPrice` is not meaningful — the
   *  FundingUpdated event signals the same condition with a 0 sentinel.
   */
  markPriceOk: boolean;
  /** Unsmoothed oracle index price (raw quote units per whole base). */
  indexPrice: bigint;
  /** Index price oracle timestamp (seconds). */
  indexUpdatedAt: bigint;
  /** Current funding rate per settlement window (1e18-scaled fraction, signed). */
  fundingRate: bigint;
  /** Settled cumulative funding per base unit (1e18-scaled, signed). */
  cumulativeFundingPerUnit: bigint;
  /** Cumulative funding projected to now (unsettled accrual included). */
  projectedCumulativeFundingPerUnit: bigint;
  /**
   *  TOTAL open interest in base units.
   *
   *  Replaces `longOpenInterest` / `shortOpenInterest`: the contract keeps ONE counter
   *  because the short side is provably equal in a matched CLOB, and the two-field form
   *  did not match the deployed ABI at all — it made every `getPerpState` call throw.
   */
  openInterest: bigint;
  /**
   *  The rate's DENOMINATOR in seconds (`fundingCalculationWindowSec`), 28800 on every
   *  live pool. `fundingRate` is per THIS window — not per settlement interval and not
   *  annualized. Normalize with it; never with a hardcoded constant.
   */
  fundingWindowSec: number;
  /**
   *  Settlement cadence in seconds. 300 on testnet, expected 3600 on mainnet, so
   *  `fundingWindowSec / fundingIntervalSec` is 96 vs 8 — the same emitted rate means a
   *  12x different per-interval accrual between them.
   */
  fundingIntervalSec: number;
  /** Last settlement, unix seconds (the chain stores nanoseconds). */
  lastFundingUpdateAt: bigint;
  /** When the next settlement becomes due. Settlement is LAZY, so it may pass unmet. */
  nextFundingAt: bigint;
  /**
   *  EMA'd premium driving the rate: book-MIDPOINT vs index, NOT mark vs index, and 0
   *  for a one-sided or empty book. Not recoverable from events, so this is the only
   *  source. Expect it to disagree with (mark - index) / index — they are different
   *  quantities by design.
   */
  emaPremium: bigint;
}

/**
 *  The price to mark a perp position at, and whether it came from the mark feed.
 *
 *  Extracted and tested rather than written inline at the call site, because the inline
 *  version is a one-line regression waiting to happen. `getPerpState` reads the mark via
 *  `tryGetMarkPrice`, which REPORTS staleness rather than reverting on it — so the naive
 *  `markPrice - entryPrice` takes the meaningless 0 price word from a stale feed and
 *  produces a 100% loss on every open position. An earlier `getMarkPrice()` read reverted
 *  instead, which failed loudly; making the read more robust made the derived number
 *  silently worse until this guard.
 *
 *  The index price is the fallback rather than "no value": it is a separate oracle the
 *  pool already trusts for funding, and dropping positions out of a portfolio view is its
 *  own kind of wrong. Callers that want a MARK READING (rather than something to mark
 *  against) should report undefined on staleness instead — see `fetchFundingRate`.
 */
export function perpMarkForPnl(
  state: Pick<PerpStateOnchain, "markPrice" | "markPriceOk" | "indexPrice">,
): { price: bigint; fromIndex: boolean } {
  // Belt and braces: a feed can report ok while still handing back 0, and a zero mark is
  // never a real price for a live perp.
  if (state.markPriceOk && state.markPrice > 0n) {
    return { price: state.markPrice, fromIndex: false };
  }
  return { price: state.indexPrice, fromIndex: true };
}

/**
 *  The nine pool reads behind {@link PerpStateOnchain}, in the order the destructure
 *  below expects.
 *
 *  `tryGetMarkPrice` rather than `getMarkPrice`: the latter REVERTS on a stale feed,
 *  which would take the whole read down with it. See {@link perpMarkForPnl}.
 */
const PERP_STATE_READS = [
  "tryGetMarkPrice",
  "getIndexPrice",
  "getCurrentFundingRate",
  "getCumulativeFundingPerUnit",
  "getProjectedCumulativeFundingPerUnit",
  "getOpenInterest",
  "getFundingParameters",
  "getLastFundingUpdateTimestampNs",
  "getEmaPremium",
] as const;

/**
 *  Read a perp pool's mark/index/funding/open-interest state AT ONE BLOCK.
 *
 *  **Why the block pin**
 *
 *  Every field must describe the same instant. A mark price from block N beside a
 *  funding rate from block N+2 describes a market state that never existed, and a
 *  price bar rendering the pair presents it as if it did.
 *
 *  The pin — not the multicall — is what provides that guarantee, so do not delete it
 *  as redundant next to `multicall`: viem splits a batch into several `eth_call`s once
 *  the calldata exceeds `batchSize`, and those can straddle blocks. Multicall is here
 *  for the round-trips, not the correctness.
 *
 *  **Gotchas**
 *
 *  Multicall3 availability is NOT `typeof client.multicall === "function"` — every real
 *  viem client has the method regardless of chain, so the gate gets a second half: the
 *  chain must declare a `multicall3`. Chains built with a bare `defineChain` (the e2e
 *  stack, the taker, the explorer) declare no contracts and take the fan-out.
 *
 *  Declaring one is still not enough to guarantee it is usable AT THE PINNED BLOCK:
 *  viem also throws `ChainDoesNotSupportContract` when `multicall3.blockCreated` is
 *  newer than the block being read, which a forked or replaying node below the
 *  deployment height will hit. That is why the batch is attempted and only that one
 *  error falls back — a revert, a bad ABI or a dead RPC still throws, so a real failure
 *  cannot hide behind a silent nine-read retry.
 */
export async function getPerpState(pool: Address, client: PublicClient): Promise<PerpStateOnchain> {
  const p = { address: pool, abi: ReadsAbi.perpPoolReadAbi } as const;
  const pc = client;
  // Pin FIRST: every read below quotes this block, so they cannot straddle.
  const blockNumber = await pc.getBlockNumber();
  const fanOut = () =>
    Promise.all(PERP_STATE_READS.map((functionName) => pc.readContract({ ...p, functionName, blockNumber })));
  let results: unknown[];
  if (typeof pc.multicall === "function" && pc.chain?.contracts?.multicall3) {
    try {
      results = await pc.multicall({
        contracts: PERP_STATE_READS.map((functionName) => ({ ...p, functionName })),
        // A revert inside the batch must surface as a thrown SDK error, exactly as it
        // does on the readContract path — never as a silent per-call failure result.
        allowFailure: false,
        blockNumber,
      });
    } catch (e) {
      // Only "this chain has no usable Multicall3 here" falls back. A revert, a bad ABI
      // or a dead RPC must still throw, or a broken pool would silently cost nine reads
      // and report the same answer.
      if (!(e instanceof ChainDoesNotSupportContract)) throw e;
      results = await fanOut();
    }
  } else {
    results = await fanOut();
  }
  // The cast below is unchecked, so a short batch would surface as a TypeError from the
  // middle of a destructure ("Cannot convert undefined to a BigInt") rather than as an
  // error naming the pool. Fail here instead, while there is still context.
  if (results.length !== PERP_STATE_READS.length) {
    throw new Error(
      `getPerpState(${pool}): expected ${PERP_STATE_READS.length} reads, got ${results.length}`,
    );
  }
  const [
    [markPriceOk, markPrice],
    [indexPrice, indexUpdatedAt],
    fundingRate,
    cumulative,
    projected,
    openInterest,
    params,
    lastFundingNs,
    emaPremium,
    // Unchecked: both paths return `unknown[]`, so this tuple is the only thing tying
    // the results back to PERP_STATE_READS. Keep the two in the same order.
    // `getFundingParameters` returns seven uint256 fields (readsAbi.ts); only the two
    // read below are named here.
  ] = results as [
    readonly [boolean, bigint],
    readonly [bigint, bigint],
    bigint,
    bigint,
    bigint,
    bigint,
    { fundingCalculationWindowSec: bigint; fundingSettlementIntervalSec: bigint },
    bigint,
    bigint,
  ];
  const fundingWindowSec = Number(params.fundingCalculationWindowSec);
  const fundingIntervalSec = Number(params.fundingSettlementIntervalSec);
  const lastFundingUpdateAt = BigInt(lastFundingNs) / 1_000_000_000n;
  return {
    markPrice,
    markPriceOk,
    indexPrice,
    indexUpdatedAt,
    fundingRate,
    cumulativeFundingPerUnit: cumulative,
    projectedCumulativeFundingPerUnit: projected,
    openInterest,
    fundingWindowSec,
    fundingIntervalSec,
    lastFundingUpdateAt,
    nextFundingAt: lastFundingUpdateAt + BigInt(fundingIntervalSec),
    emaPremium,
  };
}

/**
 *  An account's position in one perp pool (from the MarginBank). `size` is
 *  signed base units: positive = long, negative = short, zero = flat.
 */
export interface PerpPosition {
  /**
   *  Signed position size in raw base units: positive = long, negative = short,
   *  zero = flat.
   */
  size: bigint;
  /** Volume-weighted average entry price (raw quote units per whole base). */
  avgEntryPrice: bigint;
  /** Cumulative funding index at open / last settlement (1e18-scaled, signed). */
  entryFundingIndex: bigint;
  /** Last position update (nanoseconds). */
  lastUpdatedTimestampNs: bigint;
}

/**
 *  Identifies one account's position in one perp pool — the (bank, account,
 *  pool) triple every per-position read keys on. Shared by
 *  `getPerpPosition` and `getLiquidationPrice` (perp/margin.ts); one object
 *  instead of three positional `Address` args (which compiled fine with any two
 *  swapped).
 */
export interface PerpPositionRef {
  /** The MarginBank holding the position — comes off the `PerpMarket` row. */
  marginBank: Address;
  /** The position's owner. */
  account: Address;
  /** The perp pool the position is in. */
  pool: Address;
}

/** Read an account's position for one perp pool from the MarginBank. */
export async function getPerpPosition(ref: PerpPositionRef, client: PublicClient): Promise<PerpPosition> {
  const r = (await client.readContract({
    address: ref.marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "getPosition",
    args: [ref.account, ref.pool],
  }));
  return {
    size: r.size,
    avgEntryPrice: r.avgEntryPrice,
    entryFundingIndex: r.entryFundingIndex,
    lastUpdatedTimestampNs: r.lastUpdatedTimestampNs,
  };
}

/**
 *  One account's position in one perp pool as the INDEXER has it — the mirror of
 *  the `PerpPosition` entity, and the batch counterpart to the per-pool chain read
 *  `client.getPerpPosition`.
 *
 *  **This is a snapshot, not the live position.** The row is upserted on each
 *  `MarginBank.PositionUpdated`, so it is current as of {@link updatedAtBlock} and
 *  no fresher. Everything mark-dependent — unrealized PnL, liquidation price,
 *  margin health — needs a chain read on top; nothing here is marked to market.
 *
 *  Numeric fields are decimal STRINGS of raw units (the indexer wire format),
 *  unlike {@link PerpPosition}, whose chain reads are `bigint`.
 */
export type IndexedPerpPosition = {
  /** Row id (`${pool}_${account}`). */
  id: string;
  /** Perp pool the position is in (lowercased). */
  pool: string;
  /** Position owner (lowercased). */
  account: string;
  /**
   *  SIGNED position size in raw base units: positive = long, negative = short.
   *
   *  Normalized to match {@link PerpPosition.size}. The entity itself stores an
   *  absolute `size` plus a separate `isLong` flag; carrying that second field
   *  here would mean two exported position types whose `size` means different
   *  things, which reads correctly for longs and silently inverts every short.
   */
  size: string;
  /**
   *  Volume-weighted average entry price, raw quote units per whole base.
   *
   *  The same quantity as {@link PerpPosition.avgEntryPrice}, written straight
   *  from the event. (The underlying entity column is named `entryPriceX18`, which
   *  is a misnomer — the value is NOT 1e18-scaled. Renamed at this boundary so the
   *  name cannot imply a rescale that never happened.)
   */
  avgEntryPrice: string | null;
  /**
   *  Realized PnL from the MOST RECENT position update only (signed; zero for
   *  opens and increases).
   *
   *  **Not cumulative, and never summable.** There is one row per position, not
   *  one per update, and each update OVERWRITES this field — so prior values are
   *  gone and neither summing across positions nor accumulating over time yields
   *  lifetime realized PnL. It is a property of the last update, nothing more.
   */
  lastUpdateRealizedPnl: string | null;
  /**
   *  Unix SECONDS of the last update. ({@link PerpPosition} is NANOseconds — the
   *  two are 1e9 apart, so never compare them without converting.)
   */
  updatedAt: string;
  /** Block of the last update — the row is current as of this height, not head. */
  updatedAtBlock: number | null;
};

// prettier-ignore
const PerpPositionsQuery = graphql(`
  query PerpPositions($where: PerpPosition_bool_exp!, $limit: Int, $offset: Int) {
    PerpPosition(where: $where, order_by: { updatedAt: desc }, limit: $limit, offset: $offset) {
      id
      pool
      account
      size
      isLong
      entryPriceX18
      realizedPnl
      updatedAt
      updatedAtBlock
    }
  }
`);

/**
 *  An account's perp positions across every pool, newest-updated first — ONE
 *  indexer round-trip instead of a chain read per market.
 *
 *  Indexer tier: history + aggregates, lags head slightly. For a single pool's
 *  authoritative current state — and for ANY funding-sensitive value, since the
 *  entry funding index is not on this row at all — use `client.getPerpPosition`,
 *  which returns `entryFundingIndex` from the MarginBank.
 *
 *  Deliberately selects only columns the CURRENTLY DEPLOYED indexer serves, so this
 *  read works against production today rather than waiting on the next reindex.
 *
 *  **Closed positions are excluded by default.** Rows are upserted and never
 *  deleted, so a fully-closed position lingers forever as a size-0 row; returning
 *  those would render phantom positions in every consumer. Pass `includeFlat` to
 *  get them (e.g. to show markets an account has touched).
 *
 *  **An empty array means the indexer has no rows, not that the account is flat.**
 *  A position opened moments ago may not be indexed yet; `updatedAtBlock` on each
 *  row is how far along the indexer was.
 *
 *  @param account - the position owner
 *  @param opts.pool - restrict to one perp pool
 *  @param opts.includeFlat - include size-0 (fully closed) rows; default false
 *  @param opts.limit - default 100
 */
export async function listPerpPositions(
  account: string,
  opts: { pool?: string; includeFlat?: boolean; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<IndexedPerpPosition[]> {
  const where: Record<string, unknown> = { account: { _eq: account.toLowerCase() } };
  if (opts.pool != null) where.pool = { _eq: opts.pool.toLowerCase() };
  if (opts.includeFlat !== true) where.size = { _gt: "0" };
  const data = await IndexerRead.gqlRequest(PerpPositionsQuery,
    { where, limit: opts.limit ?? 100, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.PerpPosition.map((p) => ({
    id: p.id,
    pool: p.pool,
    account: p.account,
    // The entity splits magnitude from direction; the SDK's position sign convention
    // is a signed size, so fold `isLong` back in here rather than exporting both.
    size: p.isLong ? p.size : (-BigInt(p.size)).toString(),
    avgEntryPrice: p.entryPriceX18 ?? null,
    lastUpdateRealizedPnl: p.realizedPnl ?? null,
    updatedAt: p.updatedAt,
    updatedAtBlock: p.updatedAtBlock ?? null,
  }));
}

export async function pokeFunding(w: WriterCtx, p: { pool: Address; gas?: bigint }): Promise<TxResult> {
    return w.execute({
      address: p.pool,
      abi: TradeAbi.perpPoolWriteAbi,
      functionName: "updateFunding",
      args: [],
      gas: p.gas ?? w.defaultGas,
    });
}

export async function poke(w: WriterCtx, p: { market: Address; gas?: bigint }): Promise<TxResult> {
    return w.execute({
      address: p.market,
      abi: ActionsAbi.binaryMarketWriteAbi,
      functionName: "poke",
      args: [],
      gas: p.gas ?? w.defaultGas,
    });
}
