// createClient — the SDK's single entry point.
//
// Everything flows through a SomniaMarketsClient: indexer reads, on-chain reads, the
// live tail, and writes. There is no module-global config or singleton store —
// each client owns its own config, MaterializerStore, LiveTail, and (lazily
// opened) WebSocket socket. So two clients (different chains, a per-request
// user tail, parallel tests) never share state. In React, wrap your tree in
// <SomniaMarketsProvider client={createClient(...)}> and use the hooks.
//
// The socket is opened lazily on first chain I/O, so an indexer-only client
// (e.g. server-side GraphQL reads) that never touches the chain never opens one.
//
// The public contract lives in somniaMarketsClient.ts (the fully documented
// SomniaMarketsClient interface); this module is the wiring that implements it.

import type { Address, Hex, PublicClient } from "viem";
import * as BinarySettlement from "./binary/settlement.js";
import * as PerpPortfolio from "./perp/portfolio.js";
import * as PerpHistory from "./perp/history.js";
import * as PerpState from "./perp/state.js";
import * as PerpMargin from "./perp/margin.js";
import * as PerpSystem from "./perp/system.js";
import * as PerpStops from "./perp/stops.js";
import * as PerpRegistry from "./perp/registry.js";
import * as SpotPortfolio from "./spot/portfolio.js";
import * as SpotStops from "./spot/stops.js";
import * as SpotVaultMode from "./spot/vaultMode.js";
import * as SpotPoolReads from "./spot/poolReads.js";
import * as SpotOperatorGrants from "./spot/operatorGrants.js";
import * as BinaryPortfolio from "./binary/portfolio.js";
import * as Balances from "./balances.js";
import * as Fees from "./fees.js";
import { AsyncCache } from "./asyncCache.js";
import * as Orders from "./orders.js";
import * as Units from "./units.js";
import * as Markets from "./markets.js";
import * as SyncStatus from "./syncStatus.js";
import * as Router from "./router.js";
import * as Pools from "./pools.js";
import * as Candles from "./candles.js";
import * as IndexerRead from "./indexerRead.js";
import { InvalidInputError, NotConfiguredError } from "./errors.js";
import * as Client from "./client.js";
import type { ClientConfig } from "./config.js";
import * as Debug from "./debug.js";
import * as LiveTail from "./liveTail.js";
import type { SomniaMarketsClient } from "./somniaMarketsClient.js";
import type { LiveMarket } from "./store.js";
import * as Store from "./store.js";
import * as Fills from "./fills.js";
import type { BinaryOrderBook } from "./orders.js";
import type { BinaryOrderQuote, MarketStats24h, BinaryPositionPnL, ClaimablePosition, ClaimableInput } from "./derivedReads.js";
import * as DerivedReads from "./derivedReads.js";
import * as System from "./system.js";
import * as Trade from "./trade.js";
import * as OperatorAdmin from "./operatorAdmin.js";
import type { QuestionDefinitionInput } from "./oracleHub.js";
import * as OracleHub from "./oracleHub.js";
import * as GovernanceAdmin from "./governanceAdmin.js";
import * as MarketCreatorAdmin from "./marketCreatorAdmin.js";
import * as OperatorReads from "./operatorReads.js";
import type { SomniaLendClient } from "./lend/client.js";
import * as Lend from "./lend/client.js";
import * as Config from "./config.js";
import type { PriceWatchHandle } from "./priceFeed/priceFeed.js";
import * as PriceFeedPriceFeed from "./priceFeed/priceFeed.js";
import * as PriceFeedPriceStore from "./priceFeed/priceStore.js";
import * as PriceFeedQuery from "./priceFeed/query.js";

export type { SomniaMarketsClient };

/**
 *  Shared stable empty binary book — a stale/unbound market resolves to this
 *  (identity-stable so useSyncExternalStore never loops on an empty result).
 */
const EMPTY_BINARY_BOOK: BinaryOrderBook = { yesBids: [], yesAsks: [], noBids: [], noAsks: [] };

/**
 * Build an SDK client — the single entry point for all protocol I/O.
 *
 * ```ts
 * import { createClient } from "@somnia-chain/markets-sdk";
 * import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
 *
 * const client = createClient({
 *   indexerUrl: "/v1/graphql",
 *   chain: somniaShannon,
 *   wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
 * });
 * const watch = await client.watchMarket(pool);   // live book/fills for one market
 * const book = client.getLiveBinaryOrderBook(pool);
 * const trader = client.createTrader({ privateKey });
 * ```
 */
export function createClient(config: ClientConfig): SomniaMarketsClient {
  if (!config.indexerUrl) {
    throw new NotConfiguredError("indexerUrl", "createClient");
  }
  const url = config.indexerUrl;
  // Server-only privileged headers (e.g. Hasura admin-secret) for reads the
  // public role can't do — currently just `_aggregate` counts.
  const indexerHeaders = config.indexerHeaders;
  // Bind the caller's cancellation to this client's indexer reads. Registered
  // against the url because that is what every read carries down to the
  // boundary — see registerIndexerSignal for why it is not a read parameter.
  if (config.signal) IndexerRead.registerIndexerSignal(url, config.signal);
  const store = new Store.MaterializerStore();
  const getConfig = () => config;
  // The client's debug channel — a no-op unless config.debug is set (see debug.ts).
  const dbg = Debug.makeDebug(config.debug);

  // The WebSocket socket is opened lazily + memoized — an indexer-only client
  // (server-side GraphQL reads) that never touches the chain never opens one.
  // Both views are memoized together: they share one transport, so building the
  // pair once is what keeps `getViemClient()` off a second socket.
  let clients: Client.ChainClients | undefined;
  const getClients = (): Client.ChainClients => {
    if (!clients) {
      // An explicit wsRpcUrl wins; otherwise the chain definition's own
      // WebSocket endpoint serves (every /chains definition carries one —
      // viem's somniaTestnet is the notable definition that doesn't).
      const wsRpcUrl = config.wsRpcUrl ?? config.chain.rpcUrls.default.webSocket?.[0];
      if (!wsRpcUrl) {
        throw new NotConfiguredError(
          "wsRpcUrl in createClient (or a chain whose rpcUrls carry a webSocket endpoint)",
          "this operation needs chain access",
        );
      }
      clients = Client.makePublicClient(config.chain, wsRpcUrl);
    }
    return clients;
  };
  // The SDK's own door — every internal chain read goes through the DECORATED
  // client, so reverts arrive named. Never hand this one to a caller.
  const getClient = (): PublicClient => getClients().decorated;

  const tail = new LiveTail.LiveTail({ getConfig, store, getClient, dbg });

  // The OracleHub address gate for the hub quote reads (§8c) — throws a clear
  // error instead of readContract-ing the zero address.
  const requireOracleHub = (): Address => {
    const hub = config.addresses?.oracleHub;
    if (!hub) {
      throw new NotConfiguredError("config.addresses.oracleHub", "this read needs the OracleHub");
    }
    return hub;
  };

  // Realtime price feeds — a separate service (the EMA price-feed indexer) on a
  // separate transport (Hasura WS), so its own store + tail, isolated from the
  // order-book store above.
  const priceStore = new PriceFeedPriceStore.PriceStore();
  const priceFeed = new PriceFeedPriceFeed.PriceFeed({ getConfig, store: priceStore });
  const feedUrl = () => Config.resolvePriceFeed(config).url;
  // The quote the feed is pinned to (e.g. "USDC"). The feed indexes several
  // quotes per base, so every read passes this to resolve a base to one feed;
  // undefined leaves reads unfiltered (single-quote deployments only).
  const feedQuote = () => Config.resolvePriceFeed(config).quote;

  // Resolve a `{ pool } | { marketId }` target to a pool address (for candle /
  // stats reads). Prefers the indexer (authoritative for a marketId → pool), so
  // this works without a live watch running.
  const resolvePoolTarget = async (target: { pool?: string; marketId?: string }): Promise<{ pool: string }> => {
    if (target.pool != null) return { pool: target.pool.toLowerCase() };
    if (target.marketId != null) {
      const m = await Markets.getBinaryMarket(target.marketId, url);
      if (!m) throw new InvalidInputError(`no binary market ${target.marketId}`);
      return { pool: m.poolAddress.toLowerCase() };
    }
    throw new InvalidInputError("needs a pool or marketId");
  };

  // A pool's tick/lot grid is admin-retunable but never changes per-order —
  // one eth_call per pool per client lifetime backs every stake/sell quote.
  // AsyncCache owns the sharing and the evict-on-reject (a transient RPC error
  // must not poison the pool).
  const _bookParamsCache = new AsyncCache<string, Orders.BinaryBookParams>();
  const bookParamsFor = (pool: string): Promise<Orders.BinaryBookParams> => {
    const key = pool.toLowerCase();
    return _bookParamsCache.getOrCreate(key, () => Orders.getBinaryBookParams(key as Address, getClient()));
  };

  // Resolve the live book + the store market (for decimals/pool) from a
  // {pool | marketId} key — the shared front half of the quote* methods.
  // marketId goes through the recycle-safe reader.
  const resolveLiveBinaryBook = (
    target: { pool?: string; marketId?: string },
    depth: number,
  ): { book: BinaryOrderBook; market: LiveMarket | null } => {
    if (target.marketId != null) {
      const id = target.marketId.toLowerCase();
      return {
        book: client.getLiveBinaryOrderBookByMarket(id, { depth }),
        market: store.markets.get(id) ?? null,
      };
    }
    if (target.pool != null) {
      return {
        book: client.getLiveBinaryOrderBook(target.pool, { depth }),
        market: store.marketByPool(target.pool),
      };
    }
    throw new InvalidInputError("needs a pool or marketId");
  };

  // The SomniaLend namespace, built lazily on first touch (it needs `client`,
  // which is still being defined below) and memoized — one binding per client.
  let lendClient: SomniaLendClient | undefined;

  const client: SomniaMarketsClient = {
    config,
    // The undecorated client, on the SAME socket — deliberately a method, so
    // reaching outside the SDK's error contract is an explicit act (and so the
    // socket-opening side effect isn't hidden behind a field read).
    getViemClient: () => getClients().raw,
    get lend() {
      lendClient ??= Lend.createLendWithDeps(
        { getConfig, getClient },
        config.addresses?.lend ?? {},
      );
      return lendClient;
    },

    watchMarket: (pool) => tail.watchMarket(pool),
    watchMarkets: (opts) => tail.watchAllMarkets(opts?.discover ?? false),
    watchUser: (user) => tail.watchUser(user),
    getWatchStatus: (pool) => tail.getWatchStatus(pool),
    stopLive: () => {
      tail.stopLive();
      priceFeed.stopAll();
    },
    subscribeLive: (listener) => store.subscribe(listener),
    getLiveStatus: () => store.getStatus(),
    isTailing: () => store.getStatus().mode === "tailing",
    getLiveMarkets: () => store.allMarkets(),
    getLiveMarketByPool: (pool) => store.marketByPool(pool),
    getLiveMarketByAddress: (addr) => store.marketByAddress(addr),
    getLiveFills: (pool, opts) => store.recentFills(pool, opts?.limit ?? 40),
    getLiveFundingUpdates: (pool, opts) => store.fundingUpdatesFor(pool, opts?.limit ?? 500),
    getLiveUserFills: (pool, user, opts) => store.userFills(pool, user, opts?.limit ?? 50),
    getLiveUserOrders: (pool, user, opts) => store.userOrders(pool, user, opts?.limit ?? 100),
    getLiveBinaryOrderBook: (pool, opts) => {
      const depth = opts?.depth ?? 10;
      // Memoized via select() so the reference is stable between store commits
      // (useSyncExternalStore contract).
      return store.select(`bookyn:${pool.toLowerCase()}:${depth}`, () => {
        const { bids, asks } = store.bookLevels(pool, depth);
        const m = store.marketByPool(pool);
        const oneBase = 10n ** BigInt(m?.quoteDecimals ?? Store.DECIMALS);
        return Orders.toBinaryBook(bids, asks, oneBase);
      });
    },
    getLiveBinaryOrderBookByMarket: (marketId, opts) => {
      const depth = opts?.depth ?? 10;
      const id = marketId.toLowerCase();
      return store.select(`bookynm:${id}:${depth}`, () => {
        // Recycle-safe: null when `marketId` is no longer the pool's current
        // binding (stale/ended) — render an empty book, never the successor's.
        const levels = store.bookLevelsByMarket(id, depth);
        if (!levels) return EMPTY_BINARY_BOOK;
        const oneBase = 10n ** BigInt(store.markets.get(id)?.quoteDecimals ?? Store.DECIMALS);
        return Orders.toBinaryBook(levels.bids, levels.asks, oneBase);
      });
    },
    getLiveSpotOrderBook: (pool, opts) => store.bookLevels(pool, opts?.depth ?? 12),

    // ---- P1 derived reads (analytics bundle; derived from existing data) ----
    quoteBinaryOrder: (params): BinaryOrderQuote => {
      const depth = params.depth ?? 10;
      // Resolve the live book + the market (for its collateral decimals). Either
      // a pool or a marketId keys it; marketId goes through the recycle-safe reader.
      let book;
      let market: LiveMarket | null;
      if (params.marketId != null) {
        const id = params.marketId.toLowerCase();
        book = client.getLiveBinaryOrderBookByMarket(id, { depth });
        market = store.markets.get(id) ?? null;
      } else if (params.pool != null) {
        book = client.getLiveBinaryOrderBook(params.pool, { depth });
        market = store.marketByPool(params.pool);
      } else {
        throw new InvalidInputError("quoteBinaryOrder needs a pool or marketId");
      }
      const oneCollateral = 10n ** BigInt(market?.quoteDecimals ?? Store.DECIMALS);
      return DerivedReads.quoteBinaryOrderOverBook(book, params.side, params.quantity, oneCollateral);
    },

    getBinaryBookParams: (pool) => bookParamsFor(pool),

    quoteBinaryStake: async (params): Promise<DerivedReads.BinaryStakeQuote | null> => {
      const { book, market } = resolveLiveBinaryBook(params, params.depth ?? 10);
      // The grid read needs the pool address — the store market carries it on
      // the marketId path; fall back to the indexer so a stake quote still
      // works before the first live snapshot lands.
      const pool = params.pool ?? market?.poolAddress ?? (await resolvePoolTarget(params)).pool;
      const grid = await bookParamsFor(pool);
      const oneCollateral = 10n ** BigInt(market?.quoteDecimals ?? Store.DECIMALS);
      return DerivedReads.quoteBinaryStakeOverBook(book, params.side, params.stake, oneCollateral, {
        ...grid,
        slippageBps: params.slippageBps,
        slippageMinTicks: params.slippageMinTicks,
      });
    },

    quoteBinarySell: async (params): Promise<DerivedReads.BinarySellQuote | null> => {
      const { book, market } = resolveLiveBinaryBook(params, params.depth ?? 10);
      const pool = params.pool ?? market?.poolAddress ?? (await resolvePoolTarget(params)).pool;
      const grid = await bookParamsFor(pool);
      const oneCollateral = 10n ** BigInt(market?.quoteDecimals ?? Store.DECIMALS);
      return DerivedReads.quoteBinarySellOverBook(book, params.side, params.quantity, oneCollateral, {
        ...grid,
        slippageBps: params.slippageBps,
        slippageMinTicks: params.slippageMinTicks,
      });
    },

    getMarketStats24h: async (target): Promise<MarketStats24h> => {
      const { pool } = await resolvePoolTarget(target);
      // 1h candles over the trailing 24h — 24 buckets, cheaper than scanning fills.
      const nowSec = Math.floor(Date.now() / 1000);
      const candles = await Candles.getCandles(pool, 3600, { from: nowSec - 86_400, to: nowSec }, url);
      return DerivedReads.marketStats24hFromCandles(candles, nowSec);
    },

    getBinaryPositionPnL: async (account, marketId): Promise<BinaryPositionPnL> => {
      const market = await Markets.getBinaryMarket(marketId, url);
      if (!market) {
        throw new InvalidInputError(`getBinaryPositionPnL — no binary market ${marketId}`);
      }
      const oneCollateral = 10n ** BigInt(market.quoteDecimals ?? Store.DECIMALS);
      // Top-of-book for the mark clamp — best-effort: an indexer-only client
      // (or a failed read) falls back to marking on lastPrice alone.
      const readBookTop = async (): Promise<Units.YesBookTop | undefined> => {
        try {
          const book = await Orders.getBinaryOrderBook(
            market.poolAddress,
            { decimals: market.quoteDecimals ?? Store.DECIMALS, depth: 1 },
            getClient(),
          );
          return { bestBid: book.yesBids[0]?.price, bestAsk: book.yesAsks[0]?.price };
        } catch {
          return undefined;
        }
      };
      const [fills, actions, balances, bookTop] = await Promise.all([
        Fills.getUserFills(account, { pool: market.poolAddress, limit: 1000 }, url),
        Router.getRouterActions(account, { market: marketId, limit: 1000 }, url),
        BinaryPortfolio.getOutcomeBalances(account, market.marketAddress, url),
        readBookTop(),
      ]);
      const events = DerivedReads.pnlEventsFor(account, fills, actions);
      return DerivedReads.computePositionPnL(
        events,
        { balanceYes: BigInt(balances.yes), balanceNo: BigInt(balances.no) },
        market,
        oneCollateral,
        { bookTop },
      );
    },

    getOpenPositionsWithPnL: async (account): Promise<BinaryPortfolio.OpenPositionPnL[]> => {
      // The account's open positions (non-zero balances) — each carries its
      // market's id/pool/quoteDecimals/lastPrice/winningOutcome/voided; no
      // orders/trades pulled (ordersLimit/tradesLimit 0).
      const { positions } = await BinaryPortfolio.getPortfolio(account, { ordersLimit: 0, tradesLimit: 0 }, url);
      if (positions.length === 0) return [];

      // Batch the shared inputs: ALL the user's fills + router actions in one
      // query each, plus one top-of-book read for every open market — a bounded
      // number of round-trips, not a per-position loop. (Fills capped at 1000, the
      // same assumption getBinaryPositionPnL makes per market.) The pure fold
      // then groups + marks each position (see computeOpenPositionsPnL).
      const marketIds = [...new Set(positions.map((p) => p.market.id))];
      const [fills, actions, bookTops] = await Promise.all([
        Fills.getUserFills(account, { limit: 1000 }, url),
        Router.getRouterActions(account, { limit: 1000 }, url),
        Orders.getBookTops(marketIds, url),
      ]);
      return BinaryPortfolio.computeOpenPositionsPnL(account, positions, fills, actions, bookTops);
    },

    getClaimable: async (account): Promise<ClaimablePosition[]> => {
      const portfolio = await BinaryPortfolio.getPortfolio(account, { ordersLimit: 0, tradesLimit: 0 }, url);
      // Only settled markets (Resolved / Voided / Finalized) hold claimable value.
      const settled = portfolio.positions.filter(
        (p) => p.market.voided || p.market.winningOutcome != null,
      );
      // Fee only bites a WINNER; fetch it once per (unique) winning market.
      const feeCache = new Map<string, bigint>();
      const feeFor = async (id: string): Promise<bigint> => {
        const hit = feeCache.get(id);
        if (hit != null) return hit;
        const fees = await Markets.getMarketFees(id, url);
        const bps = fees?.settlementFeeBps != null ? BigInt(fees.settlementFeeBps) : 0n;
        feeCache.set(id, bps);
        return bps;
      };
      const inputs: ClaimableInput[] = [];
      for (const p of settled) {
        const isWinner = !p.market.voided && p.market.winningOutcome === p.outcomeIndex;
        inputs.push({
          marketId: p.market.id,
          pool: p.market.poolAddress,
          outcomeIdx: p.outcomeIndex === 1 ? 1 : 0,
          amount: BigInt(p.balance),
          winningOutcome: p.market.winningOutcome ?? null,
          voided: p.market.voided,
          status: p.market.status,
          settlementFeeBps: isWinner ? await feeFor(p.market.id) : 0n,
        });
      }
      return DerivedReads.claimableFrom(inputs);
    },

    watchPrice: (asset) => priceFeed.watchPrice(asset),
    watchPrices: async (assets) => {
      // Start all in parallel, but if any rejects, release the ones that DID start
      // (no combined handle is returned on throw, so they'd otherwise leak).
      const settled = await Promise.allSettled(assets.map((a) => priceFeed.watchPrice(a)));
      const handles = settled
        .filter((r): r is PromiseFulfilledResult<PriceWatchHandle> => r.status === "fulfilled")
        .map((r) => r.value);
      const failed = settled.find((r) => r.status === "rejected");
      if (failed) {
        handles.forEach((h) => h.stop());
        throw (failed as PromiseRejectedResult).reason;
      }
      return { stop: () => handles.forEach((h) => h.stop()) };
    },
    getPriceStatus: (asset) => priceFeed.getStatus(asset),
    subscribePrices: (listener) => priceStore.subscribe(listener),
    getLivePrice: (asset) => priceStore.getLatest(asset),
    getLivePrices: (assets) => assets.map((a) => priceStore.getLatest(a)),
    getLivePriceTicks: (asset, opts) => priceStore.getTicks(asset, opts?.limit ?? 100),
    getLivePriceFeedInfo: (asset) => priceStore.getInfo(asset),
    fetchPriceFeedInfo: (asset) => PriceFeedQuery.getPriceFeedInfo(feedUrl(), asset, feedQuote()),
    fetchPrice: (asset) => PriceFeedQuery.getPriceFeedInfo(feedUrl(), asset, feedQuote()).then((info) => info.latest),
    fetchPrices: (assets) => PriceFeedQuery.getLivePrices(feedUrl(), assets, feedQuote()),
    listPriceFeeds: () => PriceFeedQuery.listFeeds(feedUrl(), undefined, feedQuote()),
    fetchPriceHistory: (asset, opts) => PriceFeedQuery.getPriceHistory(feedUrl(), asset, opts, feedQuote()),
    fetchPriceCandles: (asset, resolution, opts) => PriceFeedQuery.getPriceCandles(feedUrl(), asset, resolution, opts, feedQuote()),

    listMarkets: (opts) => Markets.listMarkets(opts, url),
    listRegistryMarkets: () => Markets.listRegistryMarkets(url),
    countMarkets: (opts) => Markets.countMarkets(opts ?? {}, url, indexerHeaders),
    getMarket: (id) => Markets.getMarket(id, url),
    listBinaryMarkets: (opts) => Markets.listBinaryMarkets(opts, url),
    listLiveBinaryMarkets: (filter) => Markets.listLiveBinaryMarkets(filter, url),
    listBinaryVenueIds: () => Markets.listBinaryVenueIds(url),
    listBinaryAssets: () => Markets.listBinaryAssets(url),
    countBinaryMarkets: (opts) => Markets.countBinaryMarkets(opts, url, indexerHeaders),
    listPastBinaryMarkets: (opts) => Markets.listPastBinaryMarkets(opts, url),
    getBinaryMarket: (id) => Markets.getBinaryMarket(id, url),
    getBinaryMarketByAddress: (marketAddress) => Markets.getBinaryMarketByAddress(marketAddress, url),
    getMarketFees: (id) => Markets.getMarketFees(id, url),
    listSpotMarkets: (opts) => Markets.listSpotMarkets(opts, url),
    getSpotMarket: (id) => Markets.getSpotMarket(id, url),
    getMarketStatusHistory: (marketId) => Markets.getMarketStatusHistory(marketId, url),
    listPerpMarkets: (opts) => Markets.listPerpMarkets(opts, url),
    getPerpMarket: (id) => Markets.getPerpMarket(id, url),
    getCandles: (pool, interval, opts) => Candles.getCandles(pool, interval, opts, url),
    getFills: (pool, opts) => Fills.getFills(pool, opts, url),
    getUserFills: (account, opts) => Fills.getUserFills(account, opts, url),
    getOpenOrders: (owner, opts) => Orders.getOpenOrders(owner, opts, url),
    getOrders: (owner, opts) => Orders.getOrders(owner, opts, url),
    listSweepableOrders: (opts) => Orders.listSweepableOrders(opts ?? {}, url),
    getOutcomeBalances: (account, marketAddress) => BinaryPortfolio.getOutcomeBalances(account, marketAddress, url),
    getPortfolio: (account, opts) => BinaryPortfolio.getPortfolio(account, opts, url),
    getSpotPortfolio: (account, opts) => SpotPortfolio.getSpotPortfolio(account, opts, url),
    getSpotStopOrders: (account, opts) => SpotStops.getSpotStopOrders(account, opts, url),
    getPerpPortfolio: (account, opts) => PerpPortfolio.getPerpPortfolio(account, opts, url),
    listPerpStopOrders: (opts) => PerpStops.listPerpStopOrders(opts ?? {}, url),

    getPerpStopOrder: (ref) => PerpStops.getPerpStopOrder(ref, getClient()),
    getPerpStopOrderSomiPayment: (registry) =>
      PerpStops.getPerpStopOrderSomiPayment(registry, getClient()),
    getUnclaimedPerpStopSomi: (ref) => PerpStops.getUnclaimedPerpStopSomi(ref, getClient()),
    listPerpOrderHistory: (account, opts) => PerpPortfolio.listPerpOrderHistory(account, opts ?? {}, url),
    getSyncStatus: (chainId) => SyncStatus.getSyncStatus(chainId, url),
    getMarketByPool: (pool) => Pools.getMarketByPool(pool, url),
    countOrders: (owner, opts) => Orders.countOrders(owner, opts ?? {}, url, indexerHeaders),
    countUserFills: (account, opts) => Fills.countUserFills(account, opts ?? {}, url, indexerHeaders),
    getRouterActions: (account, opts) => Router.getRouterActions(account, opts ?? {}, url),
    getMarketResolution: (marketId) => BinarySettlement.getMarketResolution(marketId, url),
    getOpeningPrices: (marketIds) => Markets.getOpeningPrices(marketIds, url),
    getBookTops: (marketIds) => Orders.getBookTops(marketIds, url),
    listProtocolFees: (opts) => Fees.listProtocolFees(opts ?? {}, url),
    listBuilderFees: (opts) => Fees.listBuilderFees(opts ?? {}, url),
    listSettlementFees: (opts) => Fees.listSettlementFees(opts ?? {}, url),
    listBuilderApprovals: (opts) => Fees.listBuilderApprovals(opts ?? {}, url),
    getVaultPayoutFallbacks: (owner, opts) => BinaryPortfolio.getVaultPayoutFallbacks(owner, opts ?? {}, url),
    getFundingPayments: (account, opts) => PerpHistory.getFundingPayments(account, opts ?? {}, url),
    getMarginEvents: (account, opts) => PerpHistory.getMarginEvents(account, opts ?? {}, url),
    getLiquidations: (opts) => PerpHistory.getLiquidations(opts ?? {}, url),
    getFundingRateHistory: (pool, opts) => PerpHistory.getFundingRateHistory(pool, opts ?? {}, url),
    listFundingRateHistory: (pool, opts) => PerpHistory.listFundingRateHistory(pool, opts ?? {}, url),
    listFundingRateCandles: (pool, intervalSeconds, opts) =>
      PerpHistory.listFundingRateCandles(pool, intervalSeconds, opts ?? {}, url),
    getOpenInterestHistory: (pool, opts) => PerpHistory.getOpenInterestHistory(pool, opts ?? {}, url),
    listPerpFees: (opts) => PerpHistory.listPerpFees(opts ?? {}, url),
    // An indexer read living in the perp STATE module: positions are one concept,
    // and CONVENTIONS.md scopes modules by concept, never by transport direction.
    listPerpPositions: (account, opts) => PerpState.listPerpPositions(account, opts ?? {}, url),

    getBinaryOrderBook: (pool, opts) => Orders.getBinaryOrderBook(pool, opts, getClient()),
    getSpotOrderBook: (pool, opts) => Orders.getSpotOrderBook(pool, opts, getClient()),
    getOrderOnchain: (pool, orderId) => Orders.getOrderOnchain(pool, orderId, getClient()),
    getOwnOpenOrdersOnchain: (pool, owner) => Orders.getOwnOpenOrdersOnchain(pool, owner, getClient()),
    getAllOpenOrdersOnchain: (pool, opts) => Orders.getAllOpenOrdersOnchain(pool, opts, getClient()),
    getPerpState: (pool) => PerpState.getPerpState(pool, getClient()),
    getPerpPosition: (ref) => PerpState.getPerpPosition(ref, getClient()),
    getMarginAccount: (marginBank, account) => PerpMargin.getMarginAccount(marginBank, account, getClient()),
    getAccountHealth: (marginBank, account) => PerpMargin.getAccountHealth(marginBank, account, getClient()),
    getLiquidationPrice: (ref) => PerpMargin.getLiquidationPrice(ref, getClient()),
    getPerpLeverage: (ref) => PerpMargin.getPerpLeverage(ref, getClient()),
    getPerpPositionAnalytics: (ref) => PerpMargin.getPerpPositionAnalytics(ref, getClient()),
    listPerpPositionAnalytics: (p) => PerpMargin.listPerpPositionAnalytics(p, getClient()),
    getMaxPerpOrderSize: (p) => PerpMargin.getMaxPerpOrderSize(p, getClient()),
    previewPerpClosePnl: (p) => PerpMargin.previewPerpClosePnl(p, getClient()),
    previewPerpLiquidationPrice: (p) => PerpMargin.previewPerpLiquidationPrice(p, getClient()),
    getPerpSideHolders: (ref, opts) => PerpMargin.getPerpSideHolders(ref, opts ?? {}, getClient()),
    getBankruptcyPrice: (ref, opts) => PerpMargin.getBankruptcyPrice(ref, opts ?? {}, getClient()),
    getPerpSystemConfig: (marginBank) => PerpSystem.getPerpSystemConfig(marginBank, getClient()),
    getInsuranceFundState: (fund) => PerpSystem.getInsuranceFundState(fund, getClient()),
    getLiquidationEngineConfig: (engine) => PerpSystem.getLiquidationEngineConfig(engine, getClient()),
    tryGetPerpAccountEquity: (marginBank, account) => PerpSystem.tryGetPerpAccountEquity(marginBank, account, getClient()),
    getPerpCollateralBasis: (marginBank, account) => PerpSystem.getPerpCollateralBasis(marginBank, account, getClient()),
    listPerpPoolStatuses: (p) => PerpRegistry.listPerpPoolStatuses(p, getClient()),
    listTradeablePerpPools: (p) => PerpRegistry.listTradeablePerpPools(p, getClient()),
    isPerpPoolRegistered: (p) => PerpRegistry.isPerpPoolRegistered(p, getClient()),
    getPerpRiskParams: (pool) => PerpMargin.getPerpRiskParams(pool, getClient()),
    previewPerpOrderMargin: (p) => PerpMargin.previewPerpOrderMargin(p, getClient()),
    meetsPerpImForFill: (p) => PerpMargin.meetsPerpImForFill(p, getClient()),
    quoteMeetsPerpImForOrder: (p) => PerpMargin.quoteMeetsPerpImForOrder(p, getClient()),
    quotePerpOrderTopUp: (p) => PerpMargin.quotePerpOrderTopUp(p, getClient()),
    getPerpHealthSnapshot: (pool) => PerpMargin.getPerpHealthSnapshot(pool, getClient()),
    getEffectiveImfBps: (pool) => PerpMargin.getEffectiveImfBps(pool, getClient()),
    getVaultBalance: (p) => BinaryPortfolio.getVaultBalance(p, getClient()),
    getManualVaultMode: (p) => SpotVaultMode.getManualVaultMode(p, getClient()),
    getAutoPullRequirement: (p) => SpotPoolReads.getAutoPullRequirement(p, getClient()),
    isOperatorAuthorized: (p) => SpotPoolReads.isOperatorAuthorized(p, getClient()),
    isGloballyApproved: (p) =>
      SpotOperatorGrants.isGloballyApproved(p, getClient(), config.addresses?.operatorPermissionsRegistry),
    isApprovedForPool: (p) =>
      SpotOperatorGrants.isApprovedForPool(p, getClient(), config.addresses?.operatorPermissionsRegistry),
    getOwnLockedBalance: (p) => SpotPoolReads.getOwnLockedBalance(p, getClient()),
    getLockedTokenBreakdown: (pool) => SpotPoolReads.getLockedTokenBreakdown(pool, getClient()),
    convertToQuoteAtPriceCeil: (p) => SpotPoolReads.convertToQuoteAtPriceCeil(p, getClient()),
    getMarketOnchain: (marketId) => {
      const module = config.addresses?.binaryModule;
      if (!module) {
        throw new NotConfiguredError("addresses.binaryModule", "getMarketOnchain (v2 resolves markets by marketId through the module)");
      }
      return Markets.getMarketOnchain(
        marketId,
        { module, settlement: config.addresses?.binarySettlement },
        getClient(),
      );
    },
    // Pool-reuse reads (settlement-extraction v2). Chain half needs the module
    // address; indexer half (getPoolBindings/getPool) is pure GraphQL.
    getPoolCreator: (pool) => {
      const module = config.addresses?.binaryModule;
      if (!module) {
        throw new NotConfiguredError("addresses.binaryModule", "getPoolCreator");
      }
      return Markets.getPoolCreator(pool, module, getClient());
    },
    getFreePools: (creator, collateral) => {
      const module = config.addresses?.binaryModule;
      if (!module) {
        throw new NotConfiguredError("addresses.binaryModule", "getFreePools");
      }
      return Pools.getFreePools(creator, collateral, module, getClient());
    },
    getPoolBindings: (pool) => Pools.getPoolBindings(pool, url),
    getPool: (address) => Pools.getPool(address, url),
    getErc20Balance: (token: Address, account: Address) => Balances.getErc20Balance(token, account, getClient()),
    getErc20Metadata: (token: Address) => Balances.getErc20Metadata(token, getClient()),
    getErc20Allowance: (token: Address, owner: Address, spender: Address) =>
      Balances.getErc20Allowance(token, owner, spender, getClient()),
    getOutcomeBalance: (p) => BinaryPortfolio.getOutcomeBalance(p, getClient()),
    getBalances: (tokens, account) => Balances.getBalances(tokens, account, getClient()),
    getStopOrderSomiPayment: (registry) => SpotStops.getStopOrderSomiPayment(registry, getClient()),
    getMaxBuilderFeeBpsTimes1k: (pool) => Fees.getMaxBuilderFeeBpsTimes1k(pool, getClient()),
    getBuilderApproval: (ref) => Fees.getBuilderApproval(ref, getClient()),
    getEffectiveBuilderApproval: (ref) => Fees.getEffectiveBuilderApproval(ref, getClient()),
    getContractMeta: (address, opts) => Markets.getContractMeta(address, opts ?? {}, getClient()),
    getNativeBalance: (address) => System.getNativeBalance(address, getClient()),
    getHeadBlock: () => Orders.getHeadBlock(getClient()),
    getSystemInfo: () => System.getSystemInfo(getClient(), config.addresses ?? {}),

    // Control plane — operators/venues are INDEXER reads (like the market
    // list); only fee-param encoding + the fee cap touch the chain (the module).
    listOperators: (opts) => OperatorAdmin.listOperators(opts ?? {}, url),
    countOperators: (opts) => OperatorAdmin.countOperators(opts ?? {}, url, indexerHeaders),
    getOperator: (operatorId) => OperatorAdmin.getOperator(operatorId, url),
    listVenues: (opts) => OperatorAdmin.listVenues(opts ?? {}, url),
    countVenues: (opts) => OperatorAdmin.countVenues(opts ?? {}, url, indexerHeaders),
    getVenue: (venueId) => OperatorAdmin.getVenue(venueId, url),
    encodeBinaryVenueFeeParams: (vp) => OperatorReads.encodeBinaryVenueFeeParams(vp, getClient(), config.addresses?.binaryModule),
    getMaxVenueFeeBps: () => OperatorReads.getMaxVenueFeeBps(getClient(), config.addresses?.binaryModule),

    // Machinery directory — MarketCreators / oracle adapters / series are
    // INDEXER reads (like the operator/venue directory); the on-chain point
    // reads live on the machinery admins.
    listMarketCreators: (opts) => MarketCreatorAdmin.listMarketCreators(opts ?? {}, url),
    getMarketCreator: (creator) => MarketCreatorAdmin.getMarketCreator(creator, url),
    listOracleAdapters: (opts) => MarketCreatorAdmin.listOracleAdapters(opts ?? {}, url),
    getOracleAdapter: (adapter) => MarketCreatorAdmin.getOracleAdapter(adapter, url),
    listSeries: (opts) => MarketCreatorAdmin.listSeries(opts ?? {}, url),

    // Oracle v2 hub §8e — the user-side quote reads (chain) + the hub's indexer
    // entities (questions / hub accounts / binds / callbacks). The §8e rule:
    // attach `getSchedulingCost(def) + resolveReserve()` to every create — the
    // reserve is earmarked at onBind (no separate prepaid pre-fund).
    getSchedulingCost: (def: QuestionDefinitionInput) => OracleHub.getSchedulingCost(def, requireOracleHub(), getClient()),
    earmarkedOf: (operatorId: number) => OracleHub.earmarkedOf(operatorId, requireOracleHub(), getClient()),
    creditOf: (operatorId: number) => OracleHub.creditOf(operatorId, requireOracleHub(), getClient()),
    outstandingOf: (operatorId: number) => OracleHub.outstandingOf(operatorId, requireOracleHub(), getClient()),
    withdrawableOf: (operatorId: number) => OracleHub.withdrawableOf(operatorId, requireOracleHub(), getClient()),
    payerCreditOf: (payer: Address) => OracleHub.payerCreditOf(payer, requireOracleHub(), getClient()),
    payerOf: (marketId: Hex) => OracleHub.payerOf(marketId, requireOracleHub(), getClient()),
    resolveReserve: () => OracleHub.resolveReserve(requireOracleHub(), getClient()),
    quoteCreateMarketValue: (def: QuestionDefinitionInput) => OracleHub.quoteCreateMarketValue(def, requireOracleHub(), getClient()),
    getOracleQuestion: (oracleQuestionId) => OracleHub.getOracleQuestion(oracleQuestionId, url),
    listOracleQuestions: (opts) => OracleHub.listOracleQuestions(opts ?? {}, url),
    getOperatorHubAccount: (operatorId) => OracleHub.getOperatorHubAccount(operatorId, url),
    listOperatorHubAccounts: (opts) => OracleHub.listOperatorHubAccounts(opts ?? {}, url),
    listOracleBinds: (opts) => OracleHub.listOracleBinds(opts ?? {}, url),
    listOracleCallbacks: (opts) => OracleHub.listOracleCallbacks(opts ?? {}, url),

    createTrader: (traderConfig) => Trade.createTraderWithDeps(traderConfig, { getConfig, getClient, dbg }),
    createOperatorAdmin: (adminConfig) => OperatorAdmin.createOperatorAdminWithDeps(adminConfig, { getConfig, getClient }),
    createOracleHubAdmin: (adminConfig) => OracleHub.createOracleHubAdminWithDeps(adminConfig, { getConfig, getClient }),
    createGovernanceAdmin: (adminConfig) => GovernanceAdmin.createGovernanceAdminWithDeps(adminConfig, { getConfig, getClient }),
    createMarketCreatorAdmin: (adminConfig) => MarketCreatorAdmin.createMarketCreatorAdminWithDeps(adminConfig, { getConfig, getClient }),
  };

  return client;
}
