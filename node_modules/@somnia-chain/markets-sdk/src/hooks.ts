"use client";

// React bindings for a SomniaMarketsClient. Provide one client at the top of your
// tree with <SomniaMarketsProvider client={client}>; the hooks read it from context
// and subscribe to its live-tail store via useSyncExternalStore. The store's
// memoized selectors keep snapshots stable between mutations so these never
// loop.
//
// Watching is automatic: every pool-keyed data hook holds a ref-counted
// watchMarket() on its pool while mounted, so rendering a market's book/tape
// is what subscribes to it — and navigating away releases it (after a short
// linger). Components only reach for useWatchMarket / useWatchUser directly
// when they need a watch without reading (e.g. pre-warming) or the user's
// history hydrated.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SomniaMarketsClient } from "./createClient.js";
import { InvalidInputError } from "./errors.js";
import * as Debug from "./debug.js";
import type { WatchHandle, WatchStatus } from "./liveTail.js";
import type { BinaryOrderBook, SpotOrderBook } from "./orders.js";
import type { IndexedMarketCreator, IndexedOracleAdapter, MarketCreatorFilter } from "./marketCreatorAdmin.js";
import type { IndexedOperator, OperatorFilter } from "./operatorAdmin.js";
import type { Portfolio, PortfolioOptions } from "./binary/portfolio.js";
import type { BinaryMarket, Market, MarketFees, MarketType } from "./markets.js";
import type { Candle } from "./candles.js";
import type { Address } from "viem";
import type { LendAccount, LendReserve } from "./lend/types.js";
import type { LiveFill, LiveFundingUpdate, LiveMarket, LiveOrder, TailStatus } from "./store.js";
import type { FundingRateCandle } from "./perp/history.js";
import { buildFundingRateSeries, type FundingRateSeries } from "./funding.js";
import type { PriceWatchHandle } from "./priceFeed/priceFeed.js";
import type { LivePrice, PriceFeedInfo, PriceFeedStatus, PricePoint } from "./priceFeed/types.js";

const ClientContext = createContext<SomniaMarketsClient | null>(null);

/**
 *  Provide the SDK's engine tier to the hooks below. Build one exchange
 *  (`new SomniaMarkets(...)`) and pass its `.client` here near the root of your app.
 */
export function SomniaMarketsProvider({
  client,
  children,
}: {
  client: SomniaMarketsClient;
  children: ReactNode;
}): ReactNode {
  return createElement(ClientContext.Provider, { value: client }, children);
}

/** The SomniaMarketsClient from the nearest provider. Throws if there isn't one. */
export function useSomniaMarketsClient(): SomniaMarketsClient {
  const client = useContext(ClientContext);
  if (!client) {
    throw new InvalidInputError(
      "no client in context — wrap your tree in <SomniaMarketsProvider client={exchange.client}>",
    );
  }
  return client;
}

/**
 *  Effect plumbing shared by the watch hooks: hold one ref-counted watch while
 *  mounted, releasing it (or a not-yet-resolved acquisition) on unmount.
 */
function useWatch(open: (() => Promise<WatchHandle>) | null, key: string | undefined): void {
  const client = useSomniaMarketsClient();
  useEffect(() => {
    if (!open) return;
    let handle: WatchHandle | undefined;
    let cancelled = false;
    open().then(
      (h) => {
        if (cancelled) h.stop();
        else handle = h;
      },
      // Route through the debug channel when configured; fall back to console —
      // a silently-dropped watch failure is worse than an unsolicited warn.
      (e) => Debug.warnOrConsole(client.config.debug, "hooks", `watch failed for ${key}`, { error: e }),
    );
    return () => {
      cancelled = true;
      handle?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` is keyed by (client, key)
  }, [client, key]);
}

/**
 *  Watch one market while mounted (ref-counted; shared with the data hooks) and
 *  report its watch state — render loading UI off `"hydrating"`.
 */
export function useWatchMarket(pool: string | undefined): WatchStatus {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (pool ? client.getWatchStatus(pool) : "unwatched"),
    () => "unwatched" as WatchStatus,
  );
}

/**
 *  Hydrate + hold `user`'s order/fill history while mounted, so the user-scoped
 *  live reads have depth predating the market watches.
 */
export function useWatchUser(user: string | null | undefined): void {
  const client = useSomniaMarketsClient();
  useWatch(user ? () => client.watchUser(user) : null, user?.toLowerCase());
}

/**
 *  The live tail's status snapshot (mode, blocks, event counter) — drive a
 *  connection banner off it, or use {@link useIsTailing} for the common boolean.
 */
export function useLiveStatus(): TailStatus {
  const client = useSomniaMarketsClient();
  return useSyncExternalStore(client.subscribeLive, client.getLiveStatus, client.getLiveStatus);
}

/** True when at least one watch is live (vs idle / hydrating / reconnecting). */
export function useIsTailing(): boolean {
  return useLiveStatus().mode === "tailing";
}

const EMPTY_FILLS: LiveFill[] = [];
const EMPTY_ORDERS: LiveOrder[] = [];

/** Live trade tape for one pool. Watches the pool while mounted. */
export function useLiveFills(pool: string | undefined, limit = 40): LiveFill[] {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (pool ? client.getLiveFills(pool, { limit }) : EMPTY_FILLS),
    () => EMPTY_FILLS,
  );
}

/**
 *  Fills `user` participated in. Watches `pool` while mounted when given; with
 *  `pool === null` it reads across whatever markets other hooks are watching
 *  (pair with useWatchUser for history).
 */
export function useLiveUserFills(
  pool: string | null,
  user: string | undefined,
  limit = 50,
): LiveFill[] {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (user ? client.getLiveUserFills(pool, user, { limit }) : EMPTY_FILLS),
    () => EMPTY_FILLS,
  );
}

/** One market by pool address (either kind). Watches the pool while mounted. */
export function useLiveMarketByPool(pool: string | undefined): LiveMarket | null {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (pool ? client.getLiveMarketByPool(pool) : null),
    () => null,
  );
}

/**
 *  One binary market by its BinaryMarket contract address. NOTE: watches are
 *  pool-keyed, so this hook does not open one — it reads whatever a pool-keyed
 *  hook (or explicit watchMarket) on the same page has hydrated.
 */
export function useLiveMarketByAddress(addr: string | undefined): BinaryMarket | null {
  const client = useSomniaMarketsClient();
  return useSyncExternalStore(
    client.subscribeLive,
    () => (addr ? client.getLiveMarketByAddress(addr) : null),
    () => null,
  );
}

/** `user`'s orders on one pool. Watches the pool while mounted. */
export function useLiveUserOrders(
  pool: string | undefined,
  user: string | undefined,
  limit = 100,
): LiveOrder[] {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (pool && user ? client.getLiveUserOrders(pool, user, { limit }) : EMPTY_ORDERS),
    () => EMPTY_ORDERS,
  );
}

const EMPTY_BOOK: BinaryOrderBook = { yesBids: [], yesAsks: [], noBids: [], noAsks: [] };
const EMPTY_SPOT_BOOK: SpotOrderBook = { bids: [], asks: [] };

/**
 *  The locally-materialized resting book of a binary pool (4-sided), updating
 *  the moment an order event lands — no round-trips, no refetch interval.
 *  Watches the pool while mounted.
 */
export function useLiveBinaryOrderBook(pool: string | undefined, depth = 10): BinaryOrderBook {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (pool ? client.getLiveBinaryOrderBook(pool, { depth }) : EMPTY_BOOK),
    () => EMPTY_BOOK,
  );
}

/**
 *  The locally-materialized resting book of a binary MARKET, resolved by its
 *  `marketId` (4-sided) — mirrors {@link useLiveBinaryOrderBook} but keyed on the
 *  market rather than the pool. Because a BinaryPool is recycled across markets,
 *  this returns an EMPTY book once the given market is no longer the pool's
 *  current binding, so a stale page never shows the successor market's orders.
 *  Watches the market's pool while mounted (once the market is known to the live
 *  store).
 */
export function useLiveBinaryOrderBookByMarket(marketId: string | undefined, depth = 10): BinaryOrderBook {
  const client = useSomniaMarketsClient();
  const id = marketId?.toLowerCase();
  // Resolve the pool from the live store so we can hold a watch on it. Until the
  // market is known, there is nothing to watch (the book reads empty anyway).
  const pool = id ? client.getLiveMarkets().find((m) => m.id === id)?.poolAddress : undefined;
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (id ? client.getLiveBinaryOrderBookByMarket(id, { depth }) : EMPTY_BOOK),
    () => EMPTY_BOOK,
  );
}

/**
 *  The locally-materialized resting book of a spot pool, updating the moment an
 *  order event lands — no round-trips, no refetch interval. Watches the pool
 *  while mounted.
 */
export function useLiveSpotOrderBook(pool: string | undefined, depth = 12): SpotOrderBook {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (pool ? client.getLiveSpotOrderBook(pool, { depth }) : EMPTY_SPOT_BOOK),
    () => EMPTY_SPOT_BOOK,
  );
}

// ---- indexer-read hooks ----
// Async one-shot indexer reads (history + directories), not the live store.
// `useIndexerQuery` is the generic engine — it runs `fn(client)` on mount and
// whenever `deps` change, tracks loading/error, and ignores stale responses
// (last-write-wins by request id). Concrete hooks below wrap the common reads.

/** The state one {@link useIndexerQuery} exposes. */
export interface IndexerQueryState<T> {
  /**
   *  Latest successful result — `undefined` until the first response lands;
   *  the previous value is kept while a refetch is in flight or after it fails.
   */
  data: T | undefined;
  /** True while a request is in flight (initial load and refetches alike). */
  loading: boolean;
  /** The most recent request's failure, or null. Cleared when a new request starts. */
  error: Error | null;
  /** Re-run the query imperatively (e.g. a manual refresh button). */
  refetch: () => void;
}

/**
 * Run an async indexer read against the context client, re-running when `deps`
 * change. Errors are captured (not thrown) so a failed indexer read renders as
 * `error`, not a crash. A superseded request (deps changed, `refetch`, unmount)
 * is aborted via the `signal` handed to `fn`, and its response is discarded
 * either way. Client reads take no per-request signal (cancellation is
 * client-scoped, via `ClientConfig.signal`), so the signal matters when `fn`
 * does its own fetching — pass it to anything that accepts one.
 *
 * ```ts
 * const { data: markets } = useIndexerQuery((c) => c.listBinaryMarkets({ limit: 20 }), []);
 * ```
 */
export function useIndexerQuery<T>(
  fn: (client: SomniaMarketsClient, signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): IndexerQueryState<T> {
  const client = useSomniaMarketsClient();
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | null }>({
    data: undefined,
    loading: true,
    error: null,
  });
  const controller = useRef<AbortController | null>(null);
  const run = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState((s) => ({ ...s, loading: true, error: null }));
    // `ctrl.signal.aborted` doubles as the staleness fence: a run is superseded
    // (dep change, refetch, unmount) exactly when its controller was aborted,
    // even for an `fn` that ignores the signal — the check is on our side.
    fn(client, ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted) setState({ data, loading: false, error: null });
      },
      (e: unknown) => {
        if (!ctrl.signal.aborted) {
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e : new Error(String(e)) }));
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns `deps`; `fn` is keyed by them
  }, [client, ...deps]);
  useEffect(() => {
    run();
    return () => {
      // Abort the in-flight request of a torn-down instance; this also fences
      // its response out of state.
      controller.current?.abort();
    };
  }, [run]);
  return { ...state, refetch: run };
}

/** A wallet's binary portfolio (indexer read). Re-runs when `account`/`opts` change. */
export function usePortfolio(
  account: string | undefined,
  opts?: PortfolioOptions,
): IndexerQueryState<Portfolio | undefined> {
  return useIndexerQuery(
    (c) => (account ? c.getPortfolio(account, opts) : Promise.resolve(undefined)),
    [account, opts?.ordersLimit, opts?.tradesLimit, opts?.since],
  );
}

/** Markets, newest first (indexer read). Pass `marketType` to narrow. */
export function useMarkets(opts?: {
  marketType?: MarketType;
  limit?: number;
  offset?: number;
}): IndexerQueryState<Market[]> {
  return useIndexerQuery((c) => c.listMarkets(opts), [opts?.marketType, opts?.limit, opts?.offset]);
}

/** OHLCV candles for one pool + interval (indexer read), oldest first. */
export function useCandles(
  pool: string | undefined,
  intervalSeconds: number,
  opts?: { limit?: number; from?: number; to?: number },
): IndexerQueryState<Candle[]> {
  return useIndexerQuery(
    (c) => (pool ? c.getCandles(pool, intervalSeconds, opts) : Promise.resolve([])),
    [pool, intervalSeconds, opts?.limit, opts?.from, opts?.to],
  );
}

const EMPTY_FUNDING: LiveFundingUpdate[] = [];

/**
 *  Funding settlements for one pool seen by the live tail, OLDEST FIRST (chart order,
 *  matching `SomniaMarketsClient.getLiveFundingUpdates`) — not newest first like
 *  {@link useLiveFills}. Watches the pool while mounted.
 *
 *  These are the tail's counterpart to the indexed `FundingRateUpdate` series and carry
 *  only what `FundingUpdated` puts on the wire — no `intervalsAccrued`, no covered span.
 *  For a chart, prefer {@link useFundingRateSeries}, which uses these purely as a nudge.
 */
export function useLiveFundingUpdates(pool: string | undefined, limit = 50): LiveFundingUpdate[] {
  const client = useSomniaMarketsClient();
  useWatch(pool ? () => client.watchMarket(pool) : null, pool?.toLowerCase());
  return useSyncExternalStore(
    client.subscribeLive,
    () => (pool ? client.getLiveFundingUpdates(pool, { limit }) : EMPTY_FUNDING),
    () => EMPTY_FUNDING,
  );
}

const EMPTY_SERIES: FundingRateSeries<FundingRateCandle> = {
  buckets: [],
  truncated: false,
  firstBucketStart: null,
};

/**
 *  A pool's funding-rate rollups over `[from, to)` at one resolution (3600 | 14400 |
 *  86400), densified onto the grid and oldest-first. The read for a funding chart.
 *
 *  Poll plus nudge: the rollups are re-read when the live tail observes a settlement on
 *  this pool, so the tip advances at settlement time rather than on the next poll tick.
 *  Callers should not re-implement that — the whole point of this hook.
 *
 *  THE CALLER OWNS THE CLOCK. `from`/`to` are required and must be stable across
 *  renders: a `Date.now()` read inside this hook would change the query deps on every
 *  render and refetch forever. Snap your window to the grid
 *  (`Math.floor(now / interval) * interval`) and it will be stable between buckets.
 *
 *  Reading the result:
 *
 *  - `avgFundingRate8h` is already per-8h. Convert with the helpers in `funding.ts`
 *    (`fundingRate1h`, `annualizedFundingRate`) — never by hand in a component.
 *  - `coverage` is a 1e18-scaled ratio in [0, 1]. A bucket at rate 0 with LOW coverage is
 *    a pause, not a measured zero — hatch it. `filled: true` marks a slot with no row at
 *    all; both cases are `coverage: "0"`, and only `filled` separates them.
 *  - Cumulative funding is exact and needs none of that reasoning:
 *    `realizedFundingPerBase(first.cumulativeFundingStart, last.cumulativeFundingEnd)`
 *    telescopes across gaps, because the index is flat over uncovered time.
 */
export function useFundingRateSeries(
  pool: string | undefined,
  intervalSeconds: number,
  window: { from: number; to: number; limit?: number },
): IndexerQueryState<FundingRateSeries<FundingRateCandle>> {
  const { from, to, limit = 500 } = window;

  const state = useIndexerQuery<FundingRateSeries<FundingRateCandle>>(
    async (c) => {
      if (!pool) return EMPTY_SERIES;
      const rows = await c.listFundingRateCandles(pool, intervalSeconds, { limit, from, to });
      return buildFundingRateSeries(rows, intervalSeconds, from, to, limit);
    },
    [pool, intervalSeconds, from, to, limit],
  );

  // The nudge. Keyed on the newest settlement's id (`${pool}_${block}_${logIndex}`), so
  // it fires once per settlement rather than on every tail commit. The first observed id
  // is swallowed: it is whatever the store already held at mount, and refetching for it
  // would double-fetch behind the read above.
  const latestLiveId = useLiveFundingUpdates(pool, 1)[0]?.id;
  const seenLiveId = useRef<string | undefined>(undefined);
  const refetch = state.refetch;
  useEffect(() => {
    if (!latestLiveId) return;
    if (seenLiveId.current === undefined) {
      seenLiveId.current = latestLiveId;
      return;
    }
    if (seenLiveId.current === latestLiveId) return;
    seenLiveId.current = latestLiveId;
    refetch();
  }, [latestLiveId, refetch]);

  // A pool switch must not let the OLD pool's last settlement nudge the new pool's read.
  //
  // Gated on an actual change, not just on `[pool]`: effects run in declaration order on
  // EVERY commit whose deps changed, including mount — an unconditional reset here would
  // run right after the swallow above on the very first commit and erase the id it just
  // recorded, so the first REAL settlement after mount would be misread as the initial
  // one and silently swallowed instead of triggering a refetch.
  const prevPool = useRef(pool);
  useEffect(() => {
    if (prevPool.current === pool) return;
    prevPool.current = pool;
    seenLiveId.current = undefined;
  }, [pool]);

  return state;
}

/** A market's frozen fee config + running total (indexer read), or null. */
export function useMarketFees(marketId: string | undefined): IndexerQueryState<MarketFees | null | undefined> {
  return useIndexerQuery(
    (c) => (marketId ? c.getMarketFees(marketId) : Promise.resolve(undefined)),
    [marketId],
  );
}

/** Operator directory (indexer read). Pass `owner`/`enabled` to filter, page with `limit`/`offset`. */
export function useOperators(
  opts?: OperatorFilter & { limit?: number; offset?: number },
): IndexerQueryState<IndexedOperator[]> {
  return useIndexerQuery(
    (c) => c.listOperators(opts),
    [opts?.owner, opts?.enabled, opts?.limit, opts?.offset],
  );
}

/**
 *  MarketCreator directory (indexer read) — the operator machinery list. Pass
 *  `owner`/`operatorId`/`venueId` to filter, page with `limit`/`offset`. Each
 *  row carries its nested `series`.
 */
export function useMarketCreators(
  opts?: MarketCreatorFilter & { limit?: number; offset?: number },
): IndexerQueryState<IndexedMarketCreator[]> {
  return useIndexerQuery(
    (c) => c.listMarketCreators(opts),
    [opts?.owner, opts?.operatorId, opts?.venueId, opts?.limit, opts?.offset],
  );
}

/**
 *  Oracle-adapter directory (indexer read). Pass `owner`/`approved` to filter,
 *  page with `limit`/`offset`.
 */
export function useOracleAdapters(
  opts?: { owner?: string; approved?: boolean; limit?: number; offset?: number },
): IndexerQueryState<IndexedOracleAdapter[]> {
  return useIndexerQuery(
    (c) => c.listOracleAdapters(opts),
    [opts?.owner, opts?.approved, opts?.limit, opts?.offset],
  );
}

const EMPTY_MARKETS: LiveMarket[] = [];

/**
 *  Every market the live store knows (spot + perp + binary), from the live tail
 *  — synchronous, memoized. Pair with {@link useWatchMarket}/`watchMarkets` to
 *  keep it populated; unlike {@link useMarkets} this is the zero-round-trip store
 *  view, not an indexer fetch.
 */
export function useLiveMarkets(): LiveMarket[] {
  const client = useSomniaMarketsClient();
  return useSyncExternalStore(
    client.subscribeLive,
    () => client.getLiveMarkets(),
    () => EMPTY_MARKETS,
  );
}

// ---- realtime price feeds ----
// Separate store from the order-book tail, so these subscribe to
// client.subscribePrices (not subscribeLive). `useWatch` is reused: a
// PriceWatchHandle is structurally a WatchHandle ({ stop(): void }).

const EMPTY_TICKS: PricePoint[] = [];

/**
 *  Watch one asset's price feed (e.g. `"BTC"`, `"ETH"`) while mounted
 *  (ref-counted; shared with the price data hooks) and report its watch state.
 */
export function useWatchPrice(asset: string | undefined): PriceFeedStatus {
  const client = useSomniaMarketsClient();
  const key = asset?.toUpperCase();
  useWatch(key ? () => client.watchPrice(key) : null, key);
  return useSyncExternalStore(
    client.subscribePrices,
    () => (key ? client.getPriceStatus(key) : "unwatched"),
    () => "unwatched" as PriceFeedStatus,
  );
}

/**
 *  The live current price of one asset, updating the moment a new tick is pushed
 *  — no round-trips, no refetch interval. Watches the feed while mounted.
 */
export function useLivePrice(asset: string | undefined): LivePrice | null {
  const client = useSomniaMarketsClient();
  const key = asset?.toUpperCase();
  useWatch(key ? () => client.watchPrice(key) : null, key);
  return useSyncExternalStore(
    client.subscribePrices,
    () => (key ? client.getLivePrice(key) : null),
    () => null,
  );
}

/**
 *  The live feed metadata of one asset — pair symbol, quote, decimals, and the
 *  freshness fields (`updatedAtMs` / `sourceUpdatedAtMs` / `resynced`). Watches
 *  the feed while mounted.
 *
 *  Note this does NOT re-render as a price ages: a stalled feed pushes nothing,
 *  so the store never notifies. Callers rendering an age must drive their own
 *  timer (see {@link PriceFeedInfo.updatedAtMs}).
 */
export function useLivePriceFeedInfo(asset: string | undefined): PriceFeedInfo | null {
  const client = useSomniaMarketsClient();
  const key = asset?.toUpperCase();
  useWatch(key ? () => client.watchPrice(key) : null, key);
  return useSyncExternalStore(
    client.subscribePrices,
    () => (key ? client.getLivePriceFeedInfo(key) : null),
    () => null,
  );
}

/** The live tick tape of one asset, newest first. Watches the feed while mounted. */
export function useLivePriceTicks(asset: string | undefined, limit = 100): PricePoint[] {
  const client = useSomniaMarketsClient();
  const key = asset?.toUpperCase();
  useWatch(key ? () => client.watchPrice(key) : null, key);
  return useSyncExternalStore(
    client.subscribePrices,
    () => (key ? client.getLivePriceTicks(key, { limit }) : EMPTY_TICKS),
    () => EMPTY_TICKS,
  );
}

// ---- SomniaLend (chain reads through the same fetch-state engine, off the
// client's `lend` namespace — needs config.addresses.lend on the provided client) ----

/**
 *  Every SomniaLend reserve — rates, caps, prices (chain read via the
 *  UiPoolDataProvider aggregate). Errors (surfaced on `error`) when the
 *  client's `config.addresses.lend` is unset.
 */
export function useLendReserves(): IndexerQueryState<LendReserve[]> {
  return useIndexerQuery((c) => c.lend.listReserves(), []);
}

/**
 *  A SomniaLend account's health factor + positions (chain read). Re-runs when
 *  `account` changes; `undefined` account resolves to `undefined` data.
 */
export function useLendAccount(account: Address | undefined): IndexerQueryState<LendAccount | undefined> {
  return useIndexerQuery(
    (c) => (account ? c.lend.getAccount(account) : Promise.resolve(undefined)),
    [account],
  );
}
