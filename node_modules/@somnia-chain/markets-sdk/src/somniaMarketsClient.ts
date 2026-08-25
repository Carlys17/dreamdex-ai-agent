// The public client surface. This module is TYPES ONLY — the fully documented
// SomniaMarketsClient interface, factored out of createClient.ts so the contract can
// be read (and reviewed, and doc-generated) without the wiring. createClient.ts
// returns an implementation of this interface.
//
// Documentation conventions used below:
//   · "live store"  — this client's in-memory MaterializerStore, kept current by
//     the live tail. Reads are SYNCHRONOUS, cost zero round-trips, and are
//     current to the last block the tail delivered.
//   · "indexer"     — the Envio/Hasura GraphQL endpoint (config.indexerUrl).
//     Reads are one HTTP round-trip, lag the chain by indexer latency
//     (~hundreds of ms), and THROW on request failure — an empty result always
//     means "no rows", never "request failed".
//   · "chain"       — a viem eth_call over this client's WebSocket. One
//     round-trip, current to head.

import type { Address, Hex, PublicClient } from "viem";
import type { ClientConfig } from "./config.js";
import type { WatchHandle, WatchStatus } from "./liveTail.js";
import type { MarketResolutionEvent, MarketReferenceLink, OracleAnswer } from "./binary/settlement.js";
import type { PerpPortfolio, PerpOrderHistoryRow, TerminalOrderStatus } from "./perp/portfolio.js";
import type { FundingPayment, MarginEvent, LiquidationEvent, FundingRateUpdate, FundingRateCandle, OpenInterestSnapshot, PerpFeeRecord } from "./perp/history.js";
import type { SpotPortfolio } from "./spot/portfolio.js";
import type { SpotStopOrder, StopOrderStatus } from "./spot/stops.js";
import type { PerpStopOrder, PerpStopOrderOnChain } from "./perp/stops.js";
import type { GetManualVaultModeParams } from "./spot/vaultMode.js";
import type {
  AutoPullRequirement,
  GetAutoPullRequirementParams,
  IsOperatorAuthorizedParams,
  LockedBalance,
  LockedTokenBreakdown,
} from "./spot/poolReads.js";
import type { IsApprovedForPoolParams, IsGloballyApprovedParams } from "./spot/operatorGrants.js";
import type {
  GetOutcomeBalanceParams,
  GetVaultBalanceParams,
  OpenPositionPnL,
  OutcomeBalances,
  Portfolio,
  PortfolioOptions,
  VaultPayoutFallback,
} from "./binary/portfolio.js";
import type {
  ProtocolFeeRecord,
  BuilderFeeRecord,
  SettlementFeeRecord,
  BuilderApproval,
  BuilderApprovalRef,
} from "./fees.js";
import type { BinaryBookParams, OnchainOrder, OpenOrder, OrderRow, OrdersOptions, BookTop, SweepableOrder } from "./orders.js";
import type { BinaryMarket, BinaryMarketFilter, LiveBinaryMarketsFilter, Market, MarketStatusUpdate, MarketFees, MarketType, PastBinaryMarketsOptions, PerpMarket, PerpMarketFilter, SpotMarket, SpotMarketFilter } from "./markets.js";
import type { IndexerSyncStatus } from "./syncStatus.js";
import type { RouterActionRecord, RouterActionKind } from "./router.js";
import type { PoolBindingRecord, IndexedPool } from "./pools.js";
import type { Candle } from "./candles.js";
import type { FillRow, FillsOptions } from "./fills.js";
import type { MarketOnchain, ContractMeta } from "./markets.js";
import type { IndexedPerpPosition, PerpPosition, PerpPositionRef, PerpStateOnchain } from "./perp/state.js";
import type {
  MarginAccount,
  AccountHealth,
  PerpRiskParams,
  PerpHealthSnapshot,
  PerpOrderMarginPreview,
  PerpClosePreview,
  PerpLeverage,
  PerpLiquidationPreview,
  PerpMaxOrderSize,
  PerpPositionAnalytics,
  PerpSideHolders,
  PerpSideHoldersRef,
  GetPerpSideHoldersOptions,
  GetBankruptcyPriceOptions,
} from "./perp/margin.js";
import type { PerpPoolStatus } from "./perp/registry.js";
import type {
  PerpSystemConfig,
  InsuranceFundState,
  LiquidationEngineConfig,
} from "./perp/system.js";
import type { BalanceQuery, Erc20Metadata } from "./balances.js";
import type { BinaryOrderBook, SpotOrderBook } from "./orders.js";
import type { BinarySide, LiveFill, LiveFundingUpdate, LiveMarket, LiveOrder, OrderStatus, TailStatus } from "./store.js";
import type {
  BinaryOrderQuote,
  BinaryStakeQuote,
  BinarySellQuote,
  BinaryBuySide,
  BinarySellSide,
  MarketStats24h,
  BinaryPositionPnL,
  ClaimablePosition,
} from "./derivedReads.js";
import type { SystemInfo } from "./system.js";
import type { Trader, TraderConfig } from "./trade.js";
import type { OperatorAdmin, OperatorAdminConfig } from "./operatorAdmin.js";
import type { OracleHubAdmin, OracleHubAdminConfig, QuestionDefinitionInput } from "./oracleHub.js";
import type { GovernanceAdmin, GovernanceAdminConfig } from "./governanceAdmin.js";
import type { MarketCreatorAdmin, MarketCreatorAdminConfig } from "./marketCreatorAdmin.js";
import type { SomniaLendClient } from "./lend/client.js";
import type { BinaryVenueParams } from "./operatorReads.js";
import type { IndexedMarketCreator, IndexedOracleAdapter, IndexedSeries, MarketCreatorFilter } from "./marketCreatorAdmin.js";
import type { IndexedOperator, IndexedVenue, OperatorFilter } from "./operatorAdmin.js";
import type { OracleQuestionRecord, OperatorHubAccountRecord, OracleBindRecord, OracleCallbackRecord } from "./oracleHub.js";
import type { PriceWatchHandle } from "./priceFeed/priceFeed.js";
import type {
  LivePrice,
  PriceCandle,
  PriceCandleResolution,
  PriceFeedInfo,
  PriceFeedStatus,
  PricePoint,
} from "./priceFeed/types.js";

/**
 * An SDK client — the single handle for all protocol I/O.
 *
 * This is the raw engine tier, reached through the exchange (`new
 * SomniaMarkets(config)` → `exchange.client`). Each exchange's engine is fully
 * isolated: its own config, live store, and (lazily opened) chain WebSocket,
 * so several can coexist in one process without sharing state.
 *
 * The read surface has three tiers — pick by freshness need:
 * 1. **Live store** (`getLive*`, synchronous): zero round-trips, updates the
 *    moment an event lands on-chain. Requires a watch ({@link watchMarket} /
 *    {@link watchMarkets}) covering the market you read.
 * 2. **Chain** (`getBinaryOrderBook`, `getMarketOnchain`, …): one `eth_call`
 *    round-trip, current to head. Works without any watch.
 * 3. **Indexer** (`listMarkets`, `getPortfolio`, …): history and aggregates;
 *    lags the chain slightly. Works without any watch or the socket.
 */
export interface SomniaMarketsClient {
  /** The config this client was built with. */
  readonly config: ClientConfig;

  /**
   *  This client's underlying viem client, undecorated — viem's own behaviour,
   *  over the socket this client already has.
   *
   *  **When to use**
   *
   *  Use to reach a contract or RPC method the SDK does not model: your own
   *  contracts, or plain calls like `getBalance` / `getCode` /
   *  `waitForTransactionReceipt`. Reads through it keep VIEM's error contract, so
   *  `e instanceof ContractFunctionRevertedError` and the rest of your existing
   *  viem error handling still work.
   *
   *  Building your own client instead would open a second WebSocket; this one
   *  shares the SDK's.
   *
   *  **Gotchas**
   *
   *  Reads through this client do NOT get the SDK's decoded protocol errors — a
   *  revert arrives as viem's error, not a {@link ContractRevertError} with an
   *  `errorName`. That is the point of the accessor, but it means you should
   *  prefer the SDK's own methods for protocol contracts, where the decoding is
   *  the value. The two clients are deliberately different: everything reachable
   *  from this interface uses the decoded one.
   *
   *  Calling this opens the WebSocket if it is not already open, and throws
   *  {@link NotConfiguredError} on a client built without `wsRpcUrl`.
   *
   *  @returns The undecorated viem `PublicClient` for this client's chain.
   */
  getViemClient(): PublicClient;

  /**
   * The SomniaLend namespace — reads (`lend.listReserves()`, `lend.getAccount()`)
   * and the `lend.createLender()` write factory for the third-party Aave v3
   * money market on Somnia (mainnet + testnet). Lazily bound to
   * `config.addresses.lend` (set `SOMNIA_MAINNET_LEND` / `SOMNIA_TESTNET_LEND`
   * from the root entry); its
   * methods throw a clear error when those addresses are unset. The root entry
   * also publishes its types, deployment
   * constants, ray-math helpers and ABIs; this namespace is the only way to call
   * it, so a lend read always rides the client's own chain transport.
   */
  readonly lend: SomniaLendClient;

  // ------------------------------------------------------------------
  // Live watches — scoped, ref-counted local materialization
  // ------------------------------------------------------------------

  /**
   * Watch one market: hydrate a consistent snapshot of it (market row, recent
   * fills, its full resting order book) and stream its events — order-book
   * activity plus, for a binary market, its lifecycle/status events. While the
   * watch is active, every `getLive*` read for this pool is current to the
   * last block at zero round-trip cost.
   *
   * Watches are **ref-counted**: watching the same pool twice shares one
   * subscription and one snapshot; each handle's `stop()` releases one
   * reference, and the scope is torn down (subscription dropped, heavy rows
   * purged) shortly after the last release — a brief linger absorbs quick
   * re-watches (navigation, React remounts) without re-snapshotting.
   *
   * Resolves once the seam is sealed (snapshot + backfill + buffered replay) —
   * i.e. once reads are live. Rejects (and releases the reference) if
   * hydration fails; the socket dropping later is healed automatically by
   * reconnect + chain backfill.
   *
   * The React data hooks call this automatically while mounted.
   */
  watchMarket(pool: string): Promise<WatchHandle>;

  /**
   * Watch every market the indexer currently knows — the whole-protocol tail
   * for list views and multi-market bots. Prefer {@link watchMarket} scoped to
   * what you actually trade or render: this variant's cost grows with the
   * protocol (snapshot size, subscription filter width, event volume).
   *
   * @param opts.discover Also watch the MarketCreator factory so markets
   *   created AFTER this call join the watch live, in their creation block
   *   (requires `config.addresses.marketCreator`). Off by default.
   */
  watchMarkets(opts?: { discover?: boolean }): Promise<WatchHandle>;

  /**
   * Hydrate one account's order/fill **history** (one indexer fetch) so
   * {@link getLiveUserFills} / {@link getLiveUserOrders} have depth predating
   * your watches. This does not subscribe to anything by itself: live events
   * are attributed to every account automatically, but only within markets
   * covered by an active {@link watchMarket} / {@link watchMarkets} — an
   * account's activity in unwatched markets stays at snapshot state.
   * Ref-counted like market watches; supports multiple accounts at once.
   */
  watchUser(user: string): Promise<WatchHandle>;

  /**
   * Per-market watch state: `"unwatched"` (no active watch — `getLive*` reads
   * return empty for this pool, which is how you distinguish "empty book"
   * from "not watching"), `"hydrating"` (watch registered; snapshot, seam
   * backfill, or reconnect in progress), or `"live"`.
   */
  getWatchStatus(pool: string): WatchStatus;

  /**
   *  Tear down every watch, subscription, and timer (tests, shutdown). The
   *  store keeps its last state; `getLive*` reads keep answering (stale).
   */
  stopLive(): void;

  /**
   * Fire `listener` after every batch of store changes — the "something
   * changed, re-read" signal (the React hooks subscribe to exactly this).
   * Re-read with any `getLive*` method; their results are memoized per store
   * version, so re-reading without a change returns the same reference.
   *
   * @returns An unsubscribe function.
   */
  subscribeLive(listener: () => void): () => void;

  /**
   *  The tail's global health: mode (`"init"` until the first watch hydrates,
   *  then `"tailing"`), the last seam block, the last locally-materialized
   *  block, the chain head, socket state, and the active watch count. For one
   *  market's state, use {@link getWatchStatus}.
   */
  getLiveStatus(): TailStatus;

  /** True once at least one watch is live (`mode === "tailing"`). */
  isTailing(): boolean;

  /**
   *  Every market the store knows (spot + binary, as the discriminated
   *  {@link Market} union) — markets hydrated by any watch, past or present
   *  (market rows are kept as metadata after a watch is released). Synchronous,
   *  memoized.
   */
  getLiveMarkets(): LiveMarket[];

  /** One market by its pool address (either kind), or null if unknown. */
  getLiveMarketByPool(pool: string): LiveMarket | null;

  /**
   *  One binary market by its BinaryMarket contract address, or null. (Spot
   *  markets have no market contract — they are identified by pool.)
   */
  getLiveMarketByAddress(marketAddress: string): BinaryMarket | null;

  /**
   * The most recent fills on one pool, newest first — the live trade tape.
   * Maker/taker owner + side are back-joined from the order map where known.
   *
   * @param opts.limit Max rows (default 40; the store retains ~400 per pool).
   */
  getLiveFills(pool: string, opts?: { limit?: number }): LiveFill[];

  /**
   * Funding settlements the live tail has seen for a perp pool, OLDEST FIRST.
   *
   * The tail's counterpart to {@link listFundingRateHistory}: splice these onto a
   * one-shot query to extend a funding chart past the snapshot block, instead of only
   * seeing the latest value on the market row. Deduped on (block, logIndex), so a reorg
   * replay overwrites rather than appending a phantom point.
   *
   * Carries less than an indexed row, deliberately: `intervalsAccrued` needs `n` from the
   * parameter-epoch series and the covered span needs the settlement anchor, neither of
   * which the tail has. Both arrive with the indexed row a moment later.
   *
   * @param opts.limit Max rows (default 500).
   */
  getLiveFundingUpdates(pool: string, opts?: { limit?: number }): LiveFundingUpdate[];

  /**
   * Fills `user` participated in (as maker or taker), newest first.
   *
   * @param pool Restrict to one pool, or null for all pools.
   * @param opts.limit Max rows (default 50).
   */
  getLiveUserFills(pool: string | null, user: string, opts?: { limit?: number }): LiveFill[];

  /**
   * `user`'s orders on one pool, newest first — every lifecycle state (open,
   * filled, cancelled, expired), so filter by `status === "Open"` for a
   * working-orders view. Includes history hydrated by {@link watchUser} plus
   * everything witnessed live on watched markets.
   *
   * @param opts.limit Max rows (default 100).
   */
  getLiveUserOrders(pool: string, user: string, opts?: { limit?: number }): LiveOrder[];

  /**
   * The locally-materialized resting book of a **binary** pool, 4-sided
   * (`yesBids`/`yesAsks` plus the NO sides derived as `1 − yesPrice`) — the
   * zero-round-trip mirror of {@link getBinaryOrderBook}, current to the last block.
   * Synchronous; safe to call every render (memoized per store version).
   *
   * @param opts.depth Price levels per side (default 10).
   */
  getLiveBinaryOrderBook(pool: string, opts?: { depth?: number }): BinaryOrderBook;

  /**
   * The locally-materialized resting book of a **binary** market, resolved by
   * its `marketId` rather than its pool address. Because a BinaryPool is
   * RECYCLED across markets (one pool serves successive markets, never
   * concurrently), a page keyed on a `marketId` must never render the pool's
   * NEXT market's orders once its own market has ended. This read resolves the
   * market's current pool and, if `marketId` is no longer the pool's current
   * binding (stale/ended), returns an EMPTY book — so a stale page renders
   * nothing rather than the successor market's liquidity. Prefer this over
   * {@link getLiveBinaryOrderBook} when you hold a `marketId` (not a live pool).
   *
   * @param opts.depth Price levels per side (default 10).
   */
  getLiveBinaryOrderBookByMarket(marketId: string, opts?: { depth?: number }): BinaryOrderBook;

  /**
   * The locally-materialized resting book of a **spot** pool (`bids`/`asks`,
   * best price first) — the zero-round-trip mirror of {@link getSpotOrderBook}.
   *
   * @param opts.depth Price levels per side (default 12).
   */
  getLiveSpotOrderBook(pool: string, opts?: { depth?: number }): SpotOrderBook;

  // ------------------------------------------------------------------
  // Derived reads — analytics the frontend needs, derived client-side from the
  // live book / candles / fills (no dedicated indexer field)
  // ------------------------------------------------------------------

  /**
   * Preview a MARKET order against the live binary book — "you'll pay ~$X,
   * average Y, slippage Z". Pure over the live store (synchronous); key it by
   * `pool` (a live pool) or `marketId` (recycle-safe — a stale market quotes
   * against an empty book). Crossing side: BUY_YES/BUY_NO consume the asks,
   * SELL_YES/SELL_NO the bids; NO prices are the YES book inverted
   * (`oneCollateral − yesPrice`). `cost` is raw collateral paid (buy) / received
   * (sell); `avgPrice` the volume-weighted fill price; `wouldRest` the unfilled
   * remainder that would rest as a maker order.
   *
   * @param params.quantity Order size in raw outcome-token units.
   * @param params.depth Book levels to walk per side (default 10).
   */
  quoteBinaryOrder(params: {
    pool?: string;
    marketId?: string;
    side: BinarySide;
    quantity: bigint;
    depth?: number;
  }): BinaryOrderQuote;

  /**
   * A BinaryPool's on-chain order-book grid (`tickSize`/`lotSize`/`minQuantity`)
   * — the increments the pool validates every order against. One `eth_call`,
   * cached per pool for the client's lifetime (the grid is admin-retunable but
   * never changes per-order). {@link quoteBinaryStake} and
   * {@link quoteBinarySell} read it through this cache.
   */
  getBinaryBookParams(pool: string): Promise<BinaryBookParams>;

  /**
   * Size a stake-denominated market BUY against the live binary book — "bet
   * $50 on Up" → the shares, protective limit, and escrow the order will
   * actually use. The inverse of {@link quoteBinaryOrder}: that prices a
   * quantity; this sizes a quantity from a collateral budget, walking the asks
   * cheapest-first while the escrow at the worst level touched stays within
   * the stake. The protective limit is padded with a slippage cushion (so the
   * IOC still crosses a moving book), tick-aligned, and the quantity re-fit
   * and lot-aligned so the escrow never exceeds the stake.
   *
   * Live store + one cached chain read ({@link getBinaryBookParams}); needs an
   * active watch for the book. The result feeds straight into
   * `trader.placeOrder({ pool, side, price: yesPrice, quantity, orderType: ORDER_TYPE.MARKET })`.
   * Resolves `null` when nothing is fillable (empty book, or a stake too small
   * to buy a single lot).
   *
   * @param params.side "BUY_YES" (Up) or "BUY_NO" (Down).
   * @param params.stake Collateral budget in raw units — the max loss.
   * @param params.depth Book levels to sweep (default 10).
   * @param params.slippageBps Protective-limit cushion in bps (default 300 = 3%).
   * @param params.slippageMinTicks Minimum cushion in ticks (default 10).
   */
  quoteBinaryStake(params: {
    pool?: string;
    marketId?: string;
    side: BinaryBuySide;
    stake: bigint;
    depth?: number;
    slippageBps?: bigint;
    slippageMinTicks?: bigint;
  }): Promise<BinaryStakeQuote | null>;

  /**
   * Build a market SELL that unwinds an outcome position by crossing the
   * resting bids, with a tick-aligned slippage cushion below the best bid —
   * the sell-side sibling of {@link quoteBinaryStake} (see it for the family's
   * mental model and tiering). Resolves `null` when there's no bid to cross or
   * nothing to sell — disable the Sell control rather than sending a doomed order.
   * The quote's `fillableQuantity`/`estProceeds` report what the crossable bids
   * can actually absorb — warn on a partial unwind before submitting.
   *
   * @param params.side "SELL_YES" (Up position) or "SELL_NO" (Down position).
   * @param params.quantity Outcome tokens to sell, raw units (lot-aligned down).
   * @param params.depth Book levels to resolve (default 10).
   * @param params.slippageBps Protective-floor cushion in bps (default 300 = 3%).
   * @param params.slippageMinTicks Minimum cushion in ticks (default 10).
   */
  quoteBinarySell(params: {
    pool?: string;
    marketId?: string;
    side: BinarySellSide;
    quantity: bigint;
    depth?: number;
    slippageBps?: bigint;
    slippageMinTicks?: bigint;
  }): Promise<BinarySellQuote | null>;

  /**
   * A market's trailing-24h stats (volume, trades, price change, high/low/open),
   * summed from 1h OHLCV candle buckets — cheaper than scanning fills. Key it by
   * `pool` or `marketId`. Prices are raw quote units; volume is raw collateral.
   * One indexer round-trip.
   */
  getMarketStats24h(target: { pool?: string; marketId?: string }): Promise<MarketStats24h>;

  /**
   * An account's position + cost basis + PnL in one binary market, RAW units.
   * Reconstructs cost basis (weighted-average) from the account's order-book
   * fills on the market folded with complete-set mints/merges, marks the CURRENT
   * balances to the book-clamped last price (see `markYesPrice`; the settlement
   * payout once resolved), and realizes sells against the running average.
   * Best-effort over indexed fills; see {@link BinaryPositionPnL} for the
   * accounting assumptions. One fan-out of indexer reads plus one top-of-book
   * `eth_call` (skipped, falling back to `lastPrice` alone, when no chain
   * client is configured).
   */
  getBinaryPositionPnL(account: string, marketId: string): Promise<BinaryPositionPnL>;

  /**
   * PnL for ALL of an account's open binary positions in one call — the batched,
   * positions-list companion to {@link getBinaryPositionPnL}. Each entry is a
   * {@link OpenPositionPnL}: the position's market joined with its reliable
   * avg-cost PnL (`costBasis` / `avgCost` / `markValue` / `unrealizedPnl` /
   * `realizedPnl`, marked to the book-clamped price), computed identically to
   * `getBinaryPositionPnL` per market. Prefer this over deriving PnL from book
   * stats. Fetched in a bounded number of indexer round-trips (fills + router
   * actions + top-of-book batched across every open market), not a per-position
   * loop. Empty array when the account holds nothing.
   */
  getOpenPositionsWithPnL(account: string): Promise<OpenPositionPnL[]>;

  /**
   * An account's redeemable positions across all SETTLED (resolved/voided)
   * binary markets, each shaped to feed straight into
   * `trader.redeemMany({ entries })`. Winners get `amount × (1 − settlementFee)`;
   * both sides of a voided market get `amount / 2`; loser-side and still-trading
   * positions are omitted. One portfolio read plus one fee read per winning
   * market.
   */
  getClaimable(account: string): Promise<ClaimablePosition[]>;

  // ------------------------------------------------------------------
  // Realtime price feeds — the on-chain EMA oracles (one endpoint, many assets)
  // ------------------------------------------------------------------

  /**
   * Watch one asset's price (e.g. `"BTC"`, `"ETH"`): hydrate a snapshot (feed
   * metadata + current price + recent ticks) to get roughly up to speed, then
   * stream live over a Hasura WebSocket subscription. While active, every
   * `getLivePrice`/`getLivePriceTicks` read for this asset is current to the
   * last pushed tick at zero round-trip cost.
   *
   * Ref-counted like {@link watchMarket}: watching the same asset twice shares
   * one subscription and one snapshot; each handle's `stop()` releases one
   * reference, and a brief linger absorbs quick re-watches. Requires
   * `config.priceFeed` to be set; rejects (and releases) otherwise.
   */
  watchPrice(asset: string): Promise<PriceWatchHandle>;

  /**
   *  Watch a batch of assets at once (e.g. `["BTC", "ETH"]`). Returns a single
   *  handle whose `stop()` releases all of them; each asset is independently
   *  ref-counted, so this composes with per-asset {@link watchPrice} calls.
   */
  watchPrices(assets: string[]): Promise<PriceWatchHandle>;

  /** Per-asset price-watch state: `"unwatched"`, `"hydrating"`, or `"live"`. */
  getPriceStatus(asset: string): PriceFeedStatus;

  /**
   * Fire `listener` after every batch of price-store changes (React hooks
   * subscribe to exactly this). Re-read with `getLivePrice`/`getLivePriceTicks`;
   * results are memoized per store version. Independent of {@link subscribeLive}
   * (prices are a separate store/service).
   *
   * @returns An unsubscribe function.
   */
  subscribePrices(listener: () => void): () => void;

  /**
   *  The current price of a watched asset (from the live store), or null if
   *  unwatched / not yet hydrated. Synchronous, memoized.
   */
  getLivePrice(asset: string): LivePrice | null;

  /**
   *  Current prices for a batch of watched assets, aligned to `assets` (each entry
   *  null if that asset is unwatched / not yet hydrated). Synchronous.
   */
  getLivePrices(assets: string[]): (LivePrice | null)[];

  /**
   *  The recent tick tape of a watched asset, newest first. Synchronous, memoized.
   *  @param opts.limit Max ticks (default 100; the store retains ~1000).
   */
  getLivePriceTicks(asset: string, opts?: { limit?: number }): PricePoint[];

  /**
   *  Feed metadata + current price for a watched asset (from the live store), or
   *  null if unwatched. For a one-shot read without a watch use {@link fetchPriceFeedInfo}.
   */
  getLivePriceFeedInfo(asset: string): PriceFeedInfo | null;

  /** One-shot feed metadata + current price (one HTTP round-trip; no watch needed). */
  fetchPriceFeedInfo(asset: string): Promise<PriceFeedInfo>;

  /**
   *  One-shot current price (one HTTP round-trip), or null if the feed has no
   *  observations yet.
   */
  fetchPrice(asset: string): Promise<LivePrice | null>;

  /**
   *  One-shot current prices for a batch of assets, or ALL tracked assets when
   *  `assets` is omitted — the multi-asset "price wall" in one request. Assets
   *  with no observations yet are omitted from the result.
   */
  fetchPrices(assets?: string[]): Promise<LivePrice[]>;

  /**
   *  One-shot feed catalog — metadata + current price for every tracked asset
   *  (discovery). One HTTP round-trip; no watch needed.
   */
  listPriceFeeds(): Promise<PriceFeedInfo[]>;

  /**
   *  Historic ticks for one asset, newest first — window with `from`/`to` (unix
   *  seconds, chain time), page with `limit` (default 500).
   */
  fetchPriceHistory(
    asset: string,
    opts?: { limit?: number; from?: number; to?: number },
  ): Promise<PricePoint[]>;

  /**
   *  OHLC candles for one asset + resolution (`"M1"`/`"H1"`/`"D1"`), oldest first
   *  (chart-ready). Window with `from`/`to` (unix seconds); page with `limit`.
   */
  fetchPriceCandles(
    asset: string,
    resolution: PriceCandleResolution,
    opts?: { limit?: number; from?: number; to?: number },
  ): Promise<PriceCandle[]>;

  // ------------------------------------------------------------------
  // Indexer reads — history + aggregates (throw on request failure)
  // ------------------------------------------------------------------

  /**
   * List markets, newest first, as the discriminated
   * `Market = SpotMarket | BinaryMarket` union.
   *
   * @param opts.marketType Filter to `"SPOT"` or `"BINARY"`; omit for both.
   * @param opts.limit Max rows (default 50).
   * @param opts.offset Row offset for pagination (default 0).
   */
  listMarkets(opts?: { marketType?: MarketType; limit?: number; offset?: number }): Promise<Market[]>;

  /**
   *  Registry sweep for the unified tier: every non-binary market plus the
   *  binary series that are still live (not finalized), paged until
   *  exhausted. Finalized series accumulate without bound; resolve those by
   *  pool via the raw-tier lookups instead.
   */
  listRegistryMarkets(): Promise<Market[]>;

  /**
   *  Server-side COUNT of markets (optionally one type) for pagination totals.
   *  Needs the privileged `_aggregate` role (server-only), like {@link countBinaryMarkets}.
   */
  countMarkets(opts?: { marketType?: MarketType }): Promise<number>;

  /**
   *  One market by primary key (bytes32 marketId for binary, pool address for
   *  spot), or null if the indexer doesn't have it.
   */
  getMarket(id: string): Promise<Market | null>;

  /** {@link listMarkets} pre-narrowed to binary markets. */
  listBinaryMarkets(opts?: BinaryMarketFilter & { limit?: number }): Promise<BinaryMarket[]>;

  /**
   *  Currently-live binary markets (`expiry > now`), soonest-to-expire first.
   *  Call with no argument for all live markets, or pass a
   *  {@link LiveBinaryMarketsFilter} to narrow by `operatorId` / `venueId` /
   *  `asset` / `intervalSec` / `status` (e.g. `{ venueId: "0x4d41494e" }`).
   */
  listLiveBinaryMarkets(filter?: LiveBinaryMarketsFilter): Promise<BinaryMarket[]>;

  /**
   *  Distinct (operatorId, venueId) pairs across binary markets — the cheap
   *  server-side source for operator/venue filter options (so a UI never
   *  fetches every market just to enumerate origins). Excludes null attribution.
   */
  listBinaryVenueIds(): Promise<
    {
      /** The operator the venue belongs to (venue ids are operator-scoped). */
      operatorId: number;
      /** Venue id (bytes4 hex, e.g. "0x4d41494e"), unique within its operator. */
      venueId: string;
    }[]
  >;

  /**
   *  Distinct asset symbols across binary markets — the cheap server-side
   *  source for an asset filter's options.
   */
  listBinaryAssets(): Promise<string[]>;

  /**
   *  Server-side COUNT of binary markets matching a filter, split by lifecycle
   *  phase — a total without fetching rows (Hasura `_aggregate`).
   */
  countBinaryMarkets(
    opts: BinaryMarketFilter & { phase: "live" | "past"; nowSec?: number },
  ): Promise<number>;

  /**
   *  Past binary markets (`expiry ≤ now`), most-recently-expired first,
   *  paginated with `limit` + `offset`.
   */
  listPastBinaryMarkets(opts?: PastBinaryMarketsOptions): Promise<BinaryMarket[]>;

  /**
   *  One binary market by bytes32 marketId, or null (also null if the id
   *  resolves to a spot market).
   */
  getBinaryMarket(id: string): Promise<BinaryMarket | null>;
  /**
   *  One binary market by its on-chain BinaryMarket ADDRESS (the Market PK is the
   *  bytes32 marketId, so an address-keyed caller must resolve through this).
   *  Newest first for recycled/rebound addresses; null if not yet indexed.
   */
  getBinaryMarketByAddress(marketAddress: string): Promise<BinaryMarket | null>;
  /**
   *  Fee config frozen into the market's pool at creation (origin venue
   *  attribution + rates in bpsTimes1k), or null without attribution.
   */
  getMarketFees(id: string): Promise<MarketFees | null>;

  /**
   *  {@link listMarkets} pre-narrowed to spot markets. Pass a
   *  {@link SpotMarketFilter} (+ `limit`) to narrow by base/quote symbol.
   */
  listSpotMarkets(opts?: SpotMarketFilter & { limit?: number }): Promise<SpotMarket[]>;

  /** One spot market by pool address, or null (also null if not spot). */
  getSpotMarket(id: string): Promise<SpotMarket | null>;

  /**
   *  A market's status-transition history (Trading→Locked→Settling→Resolved…),
   *  oldest-first — the resolution/lock timeline for a market page.
   */
  getMarketStatusHistory(marketId: string): Promise<MarketStatusUpdate[]>;

  /**
   *  {@link listMarkets} pre-narrowed to perp markets. Pass a
   *  {@link PerpMarketFilter} (+ `limit`) to narrow by base/quote symbol.
   */
  listPerpMarkets(opts?: PerpMarketFilter & { limit?: number }): Promise<PerpMarket[]>;

  /**
   *  One perp market by pool address, or null (also null if the id resolves to
   *  another market kind).
   */
  getPerpMarket(id: string): Promise<PerpMarket | null>;

  /**
   * OHLCV candles for one pool + interval, oldest first (chart-ready).
   *
   * @param intervalSeconds Bucket size — one of the indexer's rollup intervals.
   * @param opts.limit Max buckets (default 500).
   * @param opts.from Only buckets at/after this unix-seconds timestamp.
   * @param opts.to Only buckets at/before this unix-seconds timestamp.
   */
  getCandles(
    poolAddress: string,
    intervalSeconds: number,
    opts?: { limit?: number; from?: number; to?: number },
  ): Promise<Candle[]>;

  /**
   *  Recent fills for one pool (either kind), newest first — the one-shot
   *  cousin of {@link getLiveFills} for when the tail isn't running.
   */
  getFills(pool: string, opts?: FillsOptions): Promise<FillRow[]>;

  /**
   *  Fills a user participated in (maker OR taker), newest first — the one-shot
   *  indexer counterpart to {@link getLiveUserFills}. Optionally scope to one
   *  pool and/or a `since`/`until` window.
   */
  getUserFills(account: string, opts?: FillsOptions & { pool?: string }): Promise<FillRow[]>;

  /**
   * `owner`'s currently-OPEN orders, newest first. Pass {@link OrdersOptions}
   * (minus `status` — always "Open" here) to scope by `pool`/`side` and page.
   * NOTE: this lags the chain — for a trading loop prefer
   * {@link getLiveUserOrders} (or track the `orderId`s your own
   * `placeOrder` calls return). For non-open history use {@link getOrders}.
   */
  getOpenOrders(owner: string, opts?: Omit<OrdersOptions, "status">): Promise<OpenOrder[]>;

  /**
   *  `owner`'s orders across ALL statuses (Open/Filled/Cancelled/Expired/Closed),
   *  newest first — the order-history counterpart to {@link getOpenOrders}. Each
   *  row carries its lifecycle `status` + fill progress. Filter by
   *  `status`/`side`/`pool` and page via {@link OrdersOptions}.
   */
  getOrders(owner: string, opts?: OrdersOptions): Promise<OrderRow[]>;

  /**
   *  Orders past expiry that are STILL RESTING, across the whole book — the
   *  work-list for a permissionless expired-order sweep. Not scoped to an account.
   *
   *  Works on every market kind; scope with `pool` and/or `marketType`. Each row
   *  carries exactly what the sweep verbs need: `orderId` for
   *  `trader.cancelExpiredOrders`, and `isBid` + `price` for
   *  `trader.sweepExpiredAtLevel`.
   *
   *  **This is not `status: "Expired"`.** That status is written when the chain
   *  emits `OrderExpired` — i.e. once an order has ALREADY been removed. The sweepable
   *  set is the opposite: `status = "Open"` and `expireTimestampNs < now`, orders the
   *  book still holds because nobody has cleaned them up. They are NOT matched against
   *  — the matcher skips an expired maker — but each costs a warm SLOAD per traversal
   *  and holds a priority-index slot.
   *
   *  Longest-overdue first. GTC excludes itself because this SDK writes it as
   *  now + 50 years, not via any contract sentinel.
   */
  listSweepableOrders(opts?: {
    pool?: string;
    marketType?: MarketType;
    owner?: string;
    asOfSec?: number | bigint;
    limit?: number;
    offset?: number;
  }): Promise<SweepableOrder[]>;

  /**
   *  Indexed YES/NO outcome-token balances of `account` in one binary market
   *  ("0" when unseen). Display-grade: to gate a write, read the tokens'
   *  on-chain balances via {@link getErc20Balance} instead.
   */
  getOutcomeBalances(account: string, marketAddress: string): Promise<OutcomeBalances>;

  /**
   *  A wallet's whole binary portfolio in one round-trip: non-zero outcome
   *  positions, open orders, and recent trades (each with market context).
   *  Pass {@link PortfolioOptions} to page orders/trades or window trades.
   */
  getPortfolio(account: string, opts?: PortfolioOptions): Promise<Portfolio>;

  /**
   *  A wallet's spot activity: open orders, pending stop orders, and recent
   *  trades. Token holdings are NOT here — spot balances are plain ERC-20 /
   *  native balances; read them on-chain. Pass {@link PortfolioOptions} to page.
   */
  getSpotPortfolio(account: string, opts?: PortfolioOptions): Promise<SpotPortfolio>;

  /**
   *  A wallet's spot stop orders — PENDING by default (list + cancel via
   *  `trader.cancelStopOrder`). Pass `status` to see triggered/failed/cancelled
   *  history, `pool` to scope to one market, `limit` to page.
   */
  getSpotStopOrders(
    account: string,
    opts?: { pool?: string; status?: StopOrderStatus; limit?: number },
  ): Promise<SpotStopOrder[]>;

  /**
   *  A wallet's perp activity as indexed: open perp orders + recent perp
   *  trades. Positions/collateral live in the MarginBank — read them on-chain
   *  with {@link getPerpPosition} / {@link getMarginAccount}. Pass
   *  {@link PortfolioOptions} to page.
   */
  getPerpPortfolio(account: string, opts?: PortfolioOptions): Promise<PerpPortfolio>;

  /**
   *  Perp take-profit / stop-loss orders, newest first — the read that makes TP/SL
   *  usable at all.
   *
   *  The PerpStopOrderRegistry keeps pending orders in private storage behind no
   *  enumeration getter, so there is no chain read that answers "what stops do I
   *  have". Creation and triggering both work; without this a trader cannot see, price
   *  or cancel what they created, which is why the feature shipped gated.
   *
   *  Every scope comes from the same call: `{ account }` for a trader's working stops
   *  (default status `PENDING`), `{ pool }` with no account for a market's whole
   *  pending book, and `status` for history. `account` is optional deliberately — a
   *  market-wide view of what will fire is a legitimate monitoring read.
   *
   *  Read `dropReason` before calling a `TRIGGER_FAILED` order a failure: a reduce-only
   *  drop means the stop was overtaken by events, which is ordinary; only
   *  `PlacementFailed` is a rejection.
   */
  listPerpStopOrders(opts?: {
    account?: string;
    pool?: string;
    status?: StopOrderStatus[];
    limit?: number;
    offset?: number;
  }): Promise<PerpStopOrder[]>;

  /**
   *  One pending stop read straight from its registry — the chain tier
   *  {@link listPerpStopOrders} does not have.
   *
   *  The only way to read a LIMIT stop's `limitPrice`, its linked `siblingOrderId`
   *  and its `intent`: no event carries them, so {@link PerpStopOrder} cannot.
   *  Cannot enumerate — list ids there, then enrich each here.
   *
   *  `null` when the id is not live. **Do not infer liveness from the terms**: a
   *  dead id keeps plausible values until its slot is recycled, so `live` is the
   *  only truth.
   */
  getPerpStopOrder(ref: {
    registry: Address;
    orderId: bigint | string;
  }): Promise<PerpStopOrderOnChain | null>;

  /**
   *  SOMI a perp stop registry charges per pending order, in wei. Send exactly
   *  this with a create or it reverts; refunded on cancel, consumed on a fire.
   */
  getPerpStopOrderSomiPayment(registry: Address): Promise<bigint>;

  /**
   *  SOMI a perp stop registry owes `account`, in wei, claimable with
   *  `trader.claimPerpStopSomi`. Credited when a cancel's direct refund fails (a
   *  contract owner with no payable receiver) OR when the registry is wound down,
   *  which credits every owner — **including EOAs**.
   */
  getUnclaimedPerpStopSomi(ref: { registry: Address; account: Address }): Promise<bigint>;

  /**
   *  An account's FINISHED perp orders, most-recently-ended first — the history tab
   *  behind {@link getPerpPortfolio}'s open-orders list.
   *
   *  `getPerpPortfolio` hard-filters `status = "Open"`, so before this there was no
   *  way to see a filled, cancelled or expired perp order at all.
   *
   *  Excludes working orders by default (`status != "Open"`); pass `status` to narrow
   *  to particular outcomes. Ordered by when each order ENDED, not when it was
   *  placed — a long-resting order that just filled belongs at the top of a history
   *  view, not buried at its placement date.
   *
   *  Note `Closed` is terminal, not transitional: an IOC that partially filled
   *  without resting stays `Closed` forever, so treating it as "still working" would
   *  show a finished order as live.
   */
  listPerpOrderHistory(
    account: string,
    opts?: {
      pool?: string;
      status?: TerminalOrderStatus[];
      orderBy?: "ended" | "placed";
      limit?: number;
      offset?: number;
    },
  ): Promise<PerpOrderHistoryRow[]>;

  /**
   *  The indexer's own sync state (latest processed block vs chain height) for
   *  `chainId`, or null if it has no row for that chain.
   */
  getSyncStatus(chainId: number): Promise<IndexerSyncStatus | null>;

  /**
   *  Resolve a market by its pool address (one query; no live watch), or null.
   *  Binary markets are keyed by bytes32 marketId, so this is the by-pool lookup.
   */
  getMarketByPool(pool: string): Promise<Market | null>;

  /**
   *  Server-side COUNT of `owner`'s orders matching an {@link OrdersOptions}
   *  filter — the total for an order-history page. Privileged `_aggregate` role
   *  (server-only), with a bounded row-count fallback on the public role.
   */
  countOrders(owner: string, opts?: OrdersOptions): Promise<number>;

  /**
   *  Server-side COUNT of the fills `account` participated in (maker OR taker),
   *  optionally scoped by pool + a `since`/`until` window — a history-page total.
   */
  countUserFills(account: string, opts?: FillsOptions & { pool?: string }): Promise<number>;

  /**
   *  An account's RouterMinter action history (redeem / mint / merge), newest
   *  first — optionally scoped to one `market` and/or `kind`, paginated.
   */
  getRouterActions(
    account: string,
    opts?: { market?: string; kind?: RouterActionKind; limit?: number; offset?: number },
  ): Promise<RouterActionRecord[]>;

  /**
   *  Everything the indexer knows about how a market resolves: lifecycle events,
   *  the oracle reference link, and the posted oracle answers. `closingAnswer` is
   *  the market's own resolution answer (the CLOSING price for a reference-mode
   *  up/down market); `openingAnswer` is the reference-question answer (the OPENING
   *  price it resolves against, null for fixed-strike markets). Any piece may be
   *  absent. `oracleAnswer` is a deprecated alias of `closingAnswer`.
   */
  getMarketResolution(
    marketId: string,
  ): Promise<{
    /** Resolution lifecycle events for the market, oldest first ([] when none yet). */
    events: MarketResolutionEvent[];
    /**
     *  The oracle reference link the market resolves against; null for
     *  fixed-strike markets (no reference question) or before it's indexed.
     */
    reference: MarketReferenceLink | null;
    /**
     *  Answer to the market's OWN resolution question — the CLOSING price for a
     *  reference-mode up/down market; null until the oracle posts it.
     */
    closingAnswer: OracleAnswer | null;
    /**
     *  Answer to the REFERENCE question — the OPENING price the market resolves
     *  against; null for fixed-strike markets or while unanswered.
     */
    openingAnswer: OracleAnswer | null;
    /** @deprecated Alias of `closingAnswer` — kept for back-compat. */
    oracleAnswer: OracleAnswer | null;
  }>;

  /**
   *  Batch opening (reference-question) prices for many markets in one pair of
   *  round-trips — for list views. Map of lowercased marketId → raw oracle
   *  `numericValue` (null when no reference answer yet). Format with the market's
   *  oracle price scale.
   */
  getOpeningPrices(marketIds: string[]): Promise<Record<string, string | null>>;

  /**
   *  Batch top of book (best resting bid/ask + mid, YES terms, raw quote units)
   *  for many binary markets in one round-trip — for list views that want a
   *  book-derived implied probability without an N+1 per-pool fan-out. Map of
   *  lowercased marketId → {@link BookTop}; empty-book markets are absent.
   */
  getBookTops(marketIds: string[]): Promise<Record<string, BookTop>>;

  /**
   *  Realized protocol-fee records, newest first — filter by `recipient` /
   *  `market` / `pool` / `payer`, paginate. The per-fill stream behind
   *  {@link getMarketFees}'s running total.
   */
  listProtocolFees(
    opts?: { recipient?: string; market?: string; pool?: string; payer?: string; limit?: number; offset?: number },
  ): Promise<ProtocolFeeRecord[]>;

  /**
   *  Realized builder/routing-fee records, newest first — filter by `builder` /
   *  `market` / `payer`, paginate.
   */
  listBuilderFees(
    opts?: { builder?: string; market?: string; payer?: string; limit?: number; offset?: number },
  ): Promise<BuilderFeeRecord[]>;

  /**
   *  Realized settlement-fee records, newest first — filter by `market` /
   *  `recipient`, paginate.
   */
  listSettlementFees(opts?: { market?: string; recipient?: string; limit?: number; offset?: number }): Promise<SettlementFeeRecord[]>;

  /**
   *  Builder-approval directory, newest-updated first — filter by `user` and/or
   *  `builder`, paginate. The directory complement to the on-chain point read
   *  {@link getBuilderApproval}.
   */
  listBuilderApprovals(opts?: { user?: string; builder?: string; limit?: number; offset?: number }): Promise<BuilderApproval[]>;

  /**
   *  An owner's vault-credit fallback history (append-only), newest first —
   *  optionally scoped to one `token`, paginated. The live claimable balance is
   *  the chain read {@link getVaultBalance}.
   */
  getVaultPayoutFallbacks(owner: string, opts?: { token?: string; limit?: number; offset?: number }): Promise<VaultPayoutFallback[]>;

  /**
   *  An account's funding-payment history, newest first — optionally scoped to
   *  one `pool`, paginated.
   */
  getFundingPayments(account: string, opts?: { pool?: string; limit?: number; offset?: number }): Promise<FundingPayment[]>;

  /**
   *  An account's margin-account movement history (deposits/withdraws/locks),
   *  newest first — paginated.
   */
  getMarginEvents(account: string, opts?: { limit?: number; offset?: number }): Promise<MarginEvent[]>;

  /** Liquidation events, newest first — filter by `account` and/or `pool`, paginate. */
  getLiquidations(opts?: { account?: string; pool?: string; limit?: number; offset?: number }): Promise<LiquidationEvent[]>;

  /**
   *  A perp pool's funding-rate history, newest first by default.
   *
   *  `from`/`to` are unix SECONDS and are what a chart should use — the settlement cadence
   *  is 300s on testnet (288 rows per pool per day), so paging by offset to reach a date
   *  is both slow and fragile. Normalize each row with its OWN `fundingWindowSec`.
   *
   *  Pass `order: "asc"` to make `from` a forward CURSOR. Under the default `"desc"` a page
   *  always comes off the newest end, so `from = last.timestamp + 1` re-reads the tail
   *  instead of advancing.
   */
  listFundingRateHistory(
    pool: string,
    opts?: {
      limit?: number;
      offset?: number;
      from?: number | bigint;
      to?: number | bigint;
      order?: "asc" | "desc";
    },
  ): Promise<FundingRateUpdate[]>;

  /**
   *  A perp pool's funding-rate ROLLUPS at one resolution (3600 | 14400 | 86400), newest
   *  first — for ranges the raw series is too dense for.
   *
   *  Buckets can be ABSENT where no settlement's span reached them: zero-fill those grid
   *  slots as `{ avgFundingRate8h: 0, coverage: 0 }` and never carry the previous rate
   *  forward. Past buckets also get REVISED when a catch-up settlement reaches backwards.
   *
   *  Pages NEWEST-first against a default `limit` of 500, so a month of hourly buckets (720)
   *  silently returns its newest 500 — treat `rows.length === limit` as truncated.
   */
  listFundingRateCandles(
    pool: string,
    intervalSeconds: number,
    opts?: { limit?: number; offset?: number; from?: number | bigint; to?: number | bigint },
  ): Promise<FundingRateCandle[]>;

  /**
   *  Realized perp fees / rebates / builder credits, newest first — the perps fee rail off
   *  MarginBank, distinct from the binary/spot `listBuilderFees`.
   *
   *  `insurancePortion` is a component OF `amount`, not an addition to it: a fee total is
   *  `SUM(amount)`, an insurance inflow is `SUM(insurancePortion)`, and adding the two
   *  double-counts. `amount` is unsigned — `isRebate` carries the direction.
   */
  listPerpFees(
    opts?: { account?: string; pool?: string; builder?: string; kind?: string; limit?: number; offset?: number },
  ): Promise<PerpFeeRecord[]>;

  /** @deprecated Renamed to {@link listFundingRateHistory}; forwards verbatim. */
  getFundingRateHistory(
    pool: string,
    opts?: { limit?: number; offset?: number; from?: number | bigint; to?: number | bigint },
  ): Promise<FundingRateUpdate[]>;

  /** A perp pool's open-interest history, newest first — paginated. */
  getOpenInterestHistory(pool: string, opts?: { limit?: number; offset?: number }): Promise<OpenInterestSnapshot[]>;

  /**
   *  An account's perp positions across every pool, newest-updated first — ONE
   *  round-trip, replacing a chain read per market.
   *
   *  A snapshot as of each row's `updatedAtBlock`, NOT marked to market: unrealized
   *  PnL, liquidation price and margin health all still need a chain read.
   *  `entryFundingIndex` is not selected — the deployed Hasura schema does not carry
   *  it yet — so anything funding-sensitive belongs on {@link getPerpPosition}.
   *
   *  Size-0 (fully closed) rows are excluded unless `includeFlat` — upserted rows
   *  are never deleted, so closed positions linger forever. An empty array means the
   *  indexer has no rows, not that the account is flat.
   */
  listPerpPositions(
    account: string,
    opts?: { pool?: string; includeFlat?: boolean; limit?: number; offset?: number },
  ): Promise<IndexedPerpPosition[]>;

  // ------------------------------------------------------------------
  // Chain reads — one eth_call round-trip, current to head
  // ------------------------------------------------------------------

  /**
   * Read a binary pool's resting book from the contract (`getBookLevels`,
   * both sides in one pipelined round-trip), 4-sided like the live variant.
   * Use when the tail isn't running or as a checksum; in a render/quote path
   * prefer {@link getLiveBinaryOrderBook}.
   *
   * @param opts.depth Price levels per side (default 10).
   * @param opts.decimals Price scale decimals for the NO-side inversion
   *   (default 6).
   */
  getBinaryOrderBook(pool: Address, opts?: { depth?: number; decimals?: number }): Promise<BinaryOrderBook>;

  /**
   *  Read a spot OR perp pool's resting book from the contract (both ride the
   *  shared OrderBook base). Live variant: {@link getLiveSpotOrderBook}.
   *  @param opts.depth Levels per side (default 12).
   */
  getSpotOrderBook(pool: Address, opts?: { depth?: number }): Promise<SpotOrderBook>;

  /**
   *  One order's state at chain head, by `(pool, orderId)` — ids are unique per
   *  pool. Reads your own writes: answers from the block a placement landed in,
   *  while the indexed {@link getOrders} may still lag. `null` when the pool has
   *  no ACTIVE order for that id (never assigned, filled, cancelled, or reduced
   *  into a new id) — the indexer is the surface that keeps history.
   */
  getOrderOnchain(pool: Address, orderId: bigint): Promise<OnchainOrder | null>;

  /**
   *  An owner's open order ids at chain head. Any address may be asked about —
   *  the pool's view reads `msg.sender` and this impersonates via the `eth_call`
   *  sender, so no signer is involved. Indexed counterpart, with human units and
   *  history: {@link getOpenOrders}.
   */
  getOwnOpenOrdersOnchain(pool: Address, owner: Address): Promise<bigint[]>;

  /**
   *  One page of every open order on one side, at chain head — the per-order
   *  detail the aggregated book reads ({@link getBinaryOrderBook},
   *  {@link getSpotOrderBook}) collapse into levels. The pool accepts this view
   *  only from the zero address, so a configured signer is never forwarded. Loop
   *  while `hasMore`, feeding `nextCursor` back as `cursor`; pin a block if pages
   *  must be mutually consistent.
   *
   *  @param opts.maxCount Orders per page (default 100).
   */
  getAllOpenOrdersOnchain(
    pool: Address,
    opts: { isBid: boolean; maxCount?: number; cursor?: bigint },
  ): Promise<{ orders: OnchainOrder[]; hasMore: boolean; nextCursor: bigint }>;

  /**
   *  A perp pool's live mark/index price, funding rate + cumulative index, and
   *  open interest in one pipelined fan-out — fresher than the indexed row
   *  (which only updates on funding settlements).
   */
  getPerpState(pool: Address): Promise<PerpStateOnchain>;

  /**
   *  An account's position in one perp pool, from the MarginBank (signed size:
   *  positive = long). `ref.marginBank` comes off the {@link PerpMarket} row.
   */
  getPerpPosition(ref: PerpPositionRef): Promise<PerpPosition>;

  /**
   *  An account's cross-margin state (free/locked collateral, equity,
   *  withdrawable, active pools) from the MarginBank — now including the account
   *  health (`imReq`/`mmReq`/`cmReq`) and `marginStatus`.
   */
  getMarginAccount(marginBank: Address, account: Address): Promise<MarginAccount>;

  /**
   *  An account's cross-margin health alone (equity vs IM/MM/CM + the derived
   *  status) — a lighter read than {@link getMarginAccount} when only health matters.
   */
  getAccountHealth(marginBank: Address, account: Address): Promise<AccountHealth>;

  /**
   *  Estimated liquidation price for an account's position in one perp pool (raw
   *  quote units per whole base), or null when flat. Solves `equity == mmReq` with
   *  BOTH sides moving against the mark — see `perpLiquidationPrice` — over the
   *  cross-margin equity/mmReq, so it is the price at which this pool's move alone
   *  trips maintenance. Throws on a stale mark anywhere in the account.
   *
   *  This is where liquidation *triggers*. For the contract's own figure of where a
   *  position's equity is *exhausted*, see {@link getBankruptcyPrice}.
   */
  getLiquidationPrice(ref: PerpPositionRef): Promise<bigint | null>;

  /**
   *  An account's realized leverage at one position and across the whole cross-margin
   *  account, plus every ceiling that bounds it — the market's IMF-implied max, the
   *  account's own cap, the protocol limit, and the credit-voucher confinement. Ratios
   *  are bps of 1x.
   *
   *  Derived, not read: the MarginBank exposes only leverage *caps*, never a
   *  measurement of a position.
   *
   *  The ceilings are returned as stored and do not compose by taking a minimum — see
   *  {@link PerpLeverage.voucherLeverageCapX}. For whether a specific order passes,
   *  use `previewPerpOrderMargin`.
   */
  getPerpLeverage(ref: PerpPositionRef): Promise<PerpLeverage>;

  /**
   *  One position, marked — unrealized PnL, accrued funding, notional, the three
   *  margin requirements it contributes, and its return on margin. Two reads, pinned
   *  to one block.
   *
   *  The split `getAccountHealth` cannot give you: that returns one equity figure for
   *  the whole account, with every market's PnL and funding already summed and netted,
   *  so a two-position trader cannot see which one carries the loss and cannot see
   *  funding at all.
   *
   *  `accruedFunding` is **owed** — positive means the account pays. Returns
   *  `{ priceable: false }` on a stale mark rather than throwing, because in a
   *  positions table one dead feed must degrade one row, not the page.
   */
  getPerpPositionAnalytics(ref: PerpPositionRef): Promise<PerpPositionAnalytics>;

  /**
   *  Every position the account holds, each marked — the positions-table read.
   *
   *  `1 + 2n` reads for `n` active markets, all pinned to ONE block, which is the
   *  point of having it rather than looping the single read: unpinned, the rows come
   *  from different heights and their `equityContribution`s do not re-sum to any
   *  equity the account ever had.
   *
   *  Scoped to the bank's own `activePerpPools`, so a closed position does not linger
   *  the way it does on the indexed rows.
   */
  listPerpPositionAnalytics(p: { marginBank: Address; account: Address }): Promise<PerpPositionAnalytics[]>;

  /**
   *  The largest order this account can place at `price` — what a **Max** button should
   *  call. The inverse of `previewPerpOrderMargin`, and the protocol has no such view.
   *
   *  Does not re-derive the sizing rule: it binary-searches the forward one, so the two
   *  cannot disagree. A hand-rolled `equity / (price × imf)` drops the adverse
   *  mark-to-entry term, which is the usual reason a "max" order is rejected.
   *
   *  `maxQuantity` is aligned down to the pool's lot grid. **Check `placeable`** — a
   *  size below the pool's `minQuantity` is a revert, not a small order. `limitedBy`
   *  says which gate bound it. Market-wide `maxOpenInterest` and book depth are
   *  deliberately not modelled.
   *
   *  **Pass `autoPull` when the transaction sender will be the order owner.** That is
   *  the pool's whole gate for topping the account up from its wallet (T70), and with it
   *  on, an account with an empty bank and a funded, approved wallet goes from a max of
   *  `0n` to whatever the wallet funds. Leave it off for `placeOrderFor`, an operator
   *  grant or the stop registry, where no pull happens.
   */
  getMaxPerpOrderSize(p: {
    pool: Address;
    marginBank: Address;
    account: Address;
    isBid: boolean;
    price: bigint;
    autoPull?: boolean;
    builderFeeBpsTimes1k?: bigint;
  }): Promise<PerpMaxOrderSize>;

  /**
   *  What closing a position — all of it or part — would actually realise. Backs a close
   *  modal.
   *
   *  Two things it gets right that a hand-derived figure usually does not, both silent:
   *  the close is **aligned down to the lot grid** first, so a "close all" on a position
   *  that is not a lot multiple leaves a remainder open; and funding settles on the
   *  **whole** position rather than the closed share, because `settleTrade` settles
   *  before it touches the position.
   *
   *  `netProceeds` is the number to show — `realizedPnl − fundingSettled − fee`.
   *  `fundingSettled` is positive when the account pays.
   */
  previewPerpClosePnl(p: {
    pool: Address;
    marginBank: Address;
    account: Address;
    quantity?: bigint;
    price?: bigint;
    asMaker?: boolean;
  }): Promise<PerpClosePreview>;

  /**
   *  Where a proposed order would leave the liquidation price if it filled in full at
   *  its limit price, alongside where it sits now — the projection an order form needs,
   *  which {@link getLiquidationPrice} cannot give for an order not yet placed.
   *
   *  Ports all four of `MarginBank.settleTrade`'s cases (open / increase / reduce /
   *  flip) and charges the fill's fee, so a reduce and an add move the answer in
   *  opposite directions. Whether the order is ACCEPTED is
   *  {@link previewPerpOrderMargin}'s question, not this one.
   */
  previewPerpLiquidationPrice(p: {
    pool: Address;
    marginBank: Address;
    account: Address;
    isBid: boolean;
    quantity: bigint;
    price: bigint;
    asMaker?: boolean;
  }): Promise<PerpLiquidationPreview>;

  /**
   *  Every account holding an open position on one side of one perp market, from
   *  the MarginBank's own per-(pool, side) holder array — the read that lets a
   *  liquidation keeper find its watch set from head state alone, no off-chain
   *  indexer.
   *
   *  Chain tier. Pages through the bank's bounded slice view (many holders per
   *  round-trip, never one call per holder), with every page pinned to ONE block
   *  — `opts.blockNumber`, or the head sampled once — so a holder entering or
   *  leaving mid-walk can neither be missed nor double-counted. The result
   *  carries `asOfBlock`; feed it into {@link getBankruptcyPrice}'s
   *  `opts.blockNumber` (and the other side's call) to keep a sweep on one
   *  consistent snapshot — the other position/health reads answer at head only.
   *
   *  The indexed counterpart, {@link listPerpPositions}, answers the inverse
   *  question (one account's positions across pools) and lags head.
   *
   *  @param opts.blockNumber - pin to this block instead of the current head
   *  @param opts.pageSize - holders per contract call (default 1000)
   */
  getPerpSideHolders(ref: PerpSideHoldersRef, opts?: GetPerpSideHoldersOptions): Promise<PerpSideHolders>;

  /**
   *  The MarginBank's OWN bankruptcy price for an account's position in one perp
   *  pool (raw quote units per whole base) — the contract-computed price at which
   *  the position's allocated equity is exhausted. What a liquidation keeper
   *  prices a bankrupt position against.
   *
   *  A different quantity from {@link getLiquidationPrice}, not a better version
   *  of it: that is the SDK's client-side estimate of where liquidation
   *  *triggers* (use it for UI/monitoring); this is the contract's figure for
   *  where there is nothing left (use it for anything that settles or bids).
   *
   *  Reverts rather than returning a sentinel — a {@link ContractRevertError}
   *  with `errorName: "NoOpenPosition"` when the account is flat in that pool
   *  (branch on `errorName`, never message text).
   *
   *  @param opts.blockNumber - read at this block instead of head. Pricing an
   *  enumerated holder? Pass the enumeration's `asOfBlock` — at head, a holder
   *  that closed after the snapshot reverts `NoOpenPosition`.
   */
  getBankruptcyPrice(ref: PerpPositionRef, opts?: GetBankruptcyPriceOptions): Promise<bigint>;

  /**
   *  How the perps stack is wired — the address book for every other contract in the
   *  plane (collateral token, pool factory, liquidation engine, insurance fund, fee
   *  recipient), plus the protocol-wide leverage ceiling and a `fullyWired` flag.
   *
   *  Read this first: the addresses here are what the other protocol-state reads
   *  should be pointed at, so nothing is hardcoded per chain, and they are the bank's
   *  own view — the addresses it will actually call.
   *
   *  `liquidationEngine` is the PROXY. An implementation address answers reads with
   *  unset defaults (zero bidders, zero penalty), which looks like a configured-but-idle
   *  engine rather than the wrong address.
   */
  getPerpSystemConfig(marginBank: Address): Promise<PerpSystemConfig>;

  /**
   *  The InsuranceFund's per-tier balances and the total bad debt it can absorb.
   *  Point it at `insuranceFund` from {@link getPerpSystemConfig}.
   */
  getInsuranceFundState(fund: Address): Promise<InsuranceFundState>;

  /**
   *  The LiquidationEngine's configured bounds — penalty, spread range, per-block
   *  volume cap, registered backstop bidders. Not its history, which is indexed as
   *  `LiquidationEvent`.
   *
   *  `bidderCount === 0n` is an operational signal: with no registered bidders the
   *  takeover stage has nobody to take a position over, so the waterfall reaches ADL
   *  sooner than the configuration implies.
   */
  getLiquidationEngineConfig(engine: Address): Promise<LiquidationEngineConfig>;

  /**
   *  An account's equity, or `null` when it could not be computed.
   *
   *  {@link getAccountHealth} propagates an oracle failure, which is exactly when a
   *  health sweep most needs an answer. Null means "not computable right now" — an
   *  unpriceable market in the account's set — never "zero equity".
   */
  tryGetPerpAccountEquity(marginBank: Address, account: Address): Promise<bigint | null>;

  /**
   *  Collateral BACKING an account: `max(0, unlocked + locked)`, raw units.
   *
   *  Deliberately unlike equity — one storage pair, no market walk, no oracle, and it
   *  cannot revert. A solvency floor that survives a dead price feed; use equity when
   *  you need mark-to-market truth.
   */
  getPerpCollateralBasis(marginBank: Address, account: Address): Promise<bigint>;

  /**
   *  Every perp market the factory has deployed, in deployment order, with the two
   *  independent gates that decide whether it is tradeable: `restricted`
   *  (close-only) and `registered` (activated on the MarginBank).
   *
   *  **Do not build a market list from the factory's raw pool list** — that is the
   *  deployment history and includes markets wound down to close-only, so listing it
   *  unfiltered presents dead markets as tradeable.
   *
   *  Chain-sourced, which makes it complete and available when the indexer is not:
   *  the indexer's perp set comes from a curated manifest, so a market deployed after
   *  that manifest was written is invisible there and present here.
   *
   *  You do not pass a MarginBank. It is a per-network singleton in practice, but
   *  each pool names its own and that is the bank its settlement path uses — so it is
   *  read per pool and returned on every row, ready for the
   *  {@link getMarginAccount} / {@link getPerpPosition} reads that follow.
   *
   *  Feature-detects the factory's one-call status view and falls back to a per-pool
   *  fan-out on a factory that predates it, returning the same shape either way.
   */
  listPerpPoolStatuses(p: { factory: Address }): Promise<PerpPoolStatus[]>;

  /** Just the tradeable perp pools, filtered from {@link listPerpPoolStatuses}. */
  listTradeablePerpPools(p: { factory: Address }): Promise<Address[]>;

  /**
   *  Whether the MarginBank has one perp pool registered — the activation gate on
   *  its own. Coming from the factory only proves a pool is authentic; registration
   *  is what makes it usable.
   *
   *  Not interchangeable with `getPoolTier`, which is itself gated on registration
   *  and so returns 0 for an uncovered-but-registered market and an unregistered one
   *  alike.
   */
  isPerpPoolRegistered(p: { marginBank: Address; pool: Address }): Promise<boolean>;

  /**
   *  A perp market's static risk configuration — initial / maintenance / close-out
   *  margin in bps, the OI and position caps, and the maker/taker fee rates.
   *
   *  This is what makes a **projected** liquidation price possible.
   *  `maintenanceMarginBps` is exposed nowhere else — the indexed market row carries
   *  only `initialMarginBps` — so without it a client can show the real liquidation
   *  price of an open position but not the prospective one for an order it has not
   *  yet placed.
   *
   *  Reads frozen storage, so unlike {@link getPerpHealthSnapshot} it cannot revert
   *  on a stale oracle. Note `initialMarginBps` is only the curve's FLOOR when
   *  dynamic IMF is on — see {@link getEffectiveImfBps}.
   */
  /**
   *  What a perp order will lock and whether the pool will accept it, computed BEFORE
   *  sending — the read behind an order form's "margin required" row and submit gate.
   *
   *  Ports `PerpPool._computeLockAmount` plus the MarginBank gate it feeds, so the
   *  number shown is the number actually reserved.
   *
   *  **Why not a contract pre-check.** `quoteMeetsIMForOrder` looks right and is not:
   *  it runs with the order's base margin treated as already reserved, because on the
   *  real path the lock has run first. Called cold it counts the order's margin
   *  nowhere and returns true for almost any size. `meetsIMForFill` does charge base
   *  margin but models neither the lock nor its adverse mark-to-entry reserve — the
   *  term that rejects a naively-sized "max" order.
   *
   *  Reports **two gates** separately, because they fail for different reasons and
   *  imply different fixes: `hasCollateralForLock` (the lock can be taken at all) vs
   *  `meetsInitialMargin` (what remains still covers the requirement) — "deposit
   *  more" vs "close something".
   *
   *  Every read is pinned to one block; a preview is a statement about that block, so
   *  re-quote near send time for anything close to the edge.
   *
   *  **Pass `autoPull` when the transaction sender will be the order owner** — the pool's
   *  whole gate for topping the account up from its wallet (T70). With it on, both gates
   *  describe the post-pull balance and `topUpRequired` is the wallet spend to show
   *  beside the margin figure. Off, they describe the in-bank balance alone, which is
   *  what an operator- or registry-routed placement actually faces.
   */
  previewPerpOrderMargin(p: {
    pool: Address;
    marginBank: Address;
    account: Address;
    isBid: boolean;
    quantity: bigint;
    price: bigint;
    autoPull?: boolean;
    builderFeeBpsTimes1k?: bigint;
  }): Promise<PerpOrderMarginPreview>;

  /**
   *  The MarginBank's initial-margin probe for an order not yet locked — the closest
   *  single contract call to a pre-trade gate. Charges the increasing leg's base
   *  margin against free equity, but does not model the lock's adverse
   *  mark-to-entry reserve; {@link previewPerpOrderMargin} is the accurate gate.
   *
   *  `additionalSize` is the INCREASING quantity, not necessarily the whole order.
   */
  meetsPerpImForFill(p: {
    marginBank: Address;
    account: Address;
    pool: Address;
    additionalSize: bigint;
    price: bigint;
  }): Promise<boolean>;

  /**
   *  The MarginBank's placement-time initial-margin check, verbatim.
   *
   *  **Not a pre-trade gate, despite the name** — it treats the order's base margin as
   *  already reserved, so called cold it answers true for almost any size. Correct only
   *  for a caller that has already taken the lock, i.e. for mirroring the placement
   *  check itself. For "will my order be accepted", use
   *  {@link previewPerpOrderMargin}.
   */
  quoteMeetsPerpImForOrder(p: {
    marginBank: Address;
    account: Address;
    pool: Address;
    additionalSize: bigint;
    price: bigint;
  }): Promise<boolean>;

  /**
   *  The MarginBank's auto-pull sizing, verbatim — how much placing an order would take
   *  from the owner's wallet.
   *
   *  **For an order form use `previewPerpOrderMargin` with `autoPull` instead.** It
   *  derives `lockAmount`, `feeHeadroom` and `increasingQuantity` from the order, which
   *  is the awkward part: they come from the POOL, not the bank, so calling this directly
   *  means reproducing the same three numbers the pool would pass. This is the
   *  cross-check on that port.
   *
   *  Returns `0n` both when no pull is needed and in the three cases where a pull would
   *  be wrong rather than unnecessary — a purely reducing order, an account already in
   *  debt, and a voucher-blocked increase — so read it beside the unlocked balance.
   */
  quotePerpOrderTopUp(p: {
    marginBank: Address;
    pool: Address;
    account: Address;
    lockAmount: bigint;
    feeHeadroom: bigint;
    increasingQuantity: bigint;
    price: bigint;
  }): Promise<bigint>;

  getPerpRiskParams(pool: Address): Promise<PerpRiskParams>;

  /**
   *  A perp market's live health inputs in one call — mark price, projected
   *  cumulative funding, the effective (OI-scaled) IMF, and the maintenance /
   *  close-out thresholds. The contract exposes this precisely so a cross-margin
   *  health walk reads a market once instead of making five getter calls.
   *
   *  Returns a discriminated union: an unpriceable market (stale or zero mark)
   *  arrives as `{ priceable: false }` rather than an all-zero struct, so a
   *  `maintenanceMarginBps` of 0 cannot be mistaken for "no maintenance
   *  requirement". Narrow on `priceable` before reading any field.
   */
  getPerpHealthSnapshot(pool: Address): Promise<PerpHealthSnapshot>;

  /**
   *  The initial-margin factor a perp market is charging right now, in bps —
   *  OI-scaled when dynamic IMF is enabled, otherwise the static base.
   *
   *  Sizing an order off `initialMarginBps` instead under-margins it whenever open
   *  interest has pushed the curve above its floor, and the pool rejects an order
   *  the client believed fit. Reverts if dynamic IMF is on and the index is stale.
   *  {@link getPerpHealthSnapshot} returns this alongside the rest for one
   *  round-trip.
   */
  getEffectiveImfBps(pool: Address): Promise<bigint>;

  /**
   *  LIVE claimable balance an owner can withdraw from a pool's internal
   *  ERC20Vault for `token`, raw units — the value behind the append-only
   *  {@link getVaultPayoutFallbacks} history.
   */
  getVaultBalance(p: GetVaultBalanceParams): Promise<bigint>;

  /**
   *  Whether `user` has opted out of wallet auto-pull on this SpotPool, at chain
   *  head — see `trader.setManualVaultMode`. True means their orders draw only on
   *  pre-deposited vault balance and their payouts stay as vault credit.
   */
  getManualVaultMode(p: GetManualVaultModeParams): Promise<boolean>;

  /**
   *  What an order of this shape would consume from `owner`, and how far short
   *  their vault balance falls (`delta`) — the pool's own worst-case funding
   *  envelope. In auto-pull mode `delta` is what the wallet gets pulled for; under
   *  manual vault mode it is what must be deposited first.
   */
  getAutoPullRequirement(p: GetAutoPullRequirementParams): Promise<AutoPullRequirement>;

  /**
   *  Whether `owner` authorized `operator` for `selector` on this SpotPool, at
   *  chain head — resolved through the pool's OperatorPermissionsRegistry, so no
   *  indexer lag.
   */
  isOperatorAuthorized(p: IsOperatorAuthorizedParams): Promise<boolean>;

  /**
   *  Whether a GLOBAL operator grant is on record for this owner/operator/selector,
   *  at chain head — the raw slot `trader.setOperatorApprovalGlobal` writes.
   *
   *  Independent of pool registration and of denials, so `true` here does not mean
   *  the operator can act on a given pool. For that, use
   *  {@link isOperatorAuthorized}.
   */
  isGloballyApproved(p: IsGloballyApprovedParams): Promise<boolean>;

  /**
   *  Whether a PER-POOL operator grant is on record, at chain head — the read-back
   *  for `trader.setOperatorApprovalForPool`.
   *
   *  Ignores any global grant and any denial. For the pool's resolved decision, use
   *  {@link isOperatorAuthorized}.
   */
  isApprovedForPool(p: IsApprovedForPoolParams): Promise<boolean>;

  /**
   *  Base/quote `owner` has locked in this pool's resting orders. Pair with
   *  {@link getVaultBalance} to account for everything the pool holds for them.
   */
  getOwnLockedBalance(p: { pool: Address; owner: Address }): Promise<LockedBalance>;

  /**
   *  How the pool's reserves of each token split between resting orders and
   *  leftover — venue-health introspection, not a portfolio read.
   */
  getLockedTokenBreakdown(pool: Address): Promise<LockedTokenBreakdown>;

  /**
   *  Base→quote at a price using the pool's OWN ceil rounding — for interpreting
   *  {@link getLockedTokenBreakdown} without reimplementing it.
   */
  convertToQuoteAtPriceCeil(p: { pool: Address; baseQuantity: bigint; price: bigint }): Promise<bigint>;

  /**
   *  A binary market's full wiring + state (tokens, pool + nonce, status,
   *  expiry, resolution, finalized, decimals) straight from chain — authoritative
   *  for write eligibility, and works before the indexer has seen the market.
   *
   *  BREAKING (0.13.0): takes the bytes32 `marketId` (resolved through the
   *  BinaryMarketsModule), NOT the BinaryMarket contract address — pools are
   *  recycled across successive markets in v2, so market identity is the module
   *  id. Post-finalize, `backing` falls back to the settlement record's net
   *  backing. Requires `addresses.binaryModule` in the config.
   */
  getMarketOnchain(marketId: Hex): Promise<MarketOnchain>;

  /**
   *  A pool's creator — its first-deploy market creator, the only party that
   *  can reuse it — straight from chain (`BinaryMarketsModule.poolCreator`).
   *  Zero address for a pool the module never deployed. No signer needed;
   *  requires `addresses.binaryModule`.
   */
  getPoolCreator(pool: Address): Promise<Address>;

  /**
   *  A creator's free (finalized + released, reusable) pools for `collateral`,
   *  LIFO order (the LAST entry is popped first on the creator's next
   *  createMarket), straight from chain (`BinaryMarketsModule.getFreePools`).
   *  No signer needed; requires `addresses.binaryModule`.
   */
  getFreePools(creator: Address, collateral: Address): Promise<Address[]>;

  /**
   *  A pool's full pool→market binding history from the indexer, newest
   *  (highest nonce) first — every market the pool has served. A row with
   *  `toBlock === null` is the pool's CURRENT binding; `closedBy` says whether
   *  a past binding ended by `PoolReleased` ("Released") or by the next
   *  `MarketCreated` recycling the pool onward ("Rotated").
   */
  getPoolBindings(pool: string): Promise<PoolBindingRecord[]>;

  /**
   *  The indexer's per-pool aggregate (creator, collateral, current binding,
   *  generation count) for a long-lived, recycled BinaryPool — null if the
   *  indexer has never seen a `MarketCreated` on that address.
   */
  getPool(address: string): Promise<IndexedPool | null>;

  /**
   *  ERC-20 `balanceOf(account)`, raw units. For outcome positions use
   *  {@link getOutcomeBalance} (ERC-6909), not this.
   */
  getErc20Balance(token: Address, account: Address): Promise<bigint>;

  /**
   *  ERC-20 `symbol`/`name`/`decimals` in one fan-out — label a token the
   *  indexer hasn't denormalized.
   */
  getErc20Metadata(token: Address): Promise<Erc20Metadata>;

  /**
   *  ERC-20 `allowance(owner, spender)`, raw units — gate a write that pulls
   *  ERC-20 collateral (outcome tokens use per-operator approval instead).
   */
  getErc20Allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;

  /**
   *  ERC-6909 `balanceOf(account, id)` on the outcome-token singleton, raw
   *  units. `p.outcomeToken` is the singleton (from {@link getMarketOnchain});
   *  `p.id` is the market's `yesId`/`noId`.
   */
  getOutcomeBalance(p: GetOutcomeBalanceParams): Promise<bigint>;

  /**
   *  Batch-read many balances for one `account` in a single fan-out. Each entry
   *  is read as a plain ERC-20 `balanceOf(account)` when `id` is omitted, or as
   *  an ERC-6909 outcome position `balanceOf(account, id)` on the singleton
   *  `token` when `id` is set. Results are returned positionally, aligned to
   *  `tokens`. The explorer uses this to read a portfolio's collateral +
   *  outcome positions in one round-trip instead of N calls.
   */
  getBalances(tokens: readonly BalanceQuery[], account: Address): Promise<bigint[]>;

  /**
   *  SOMI a SpotStopOrderRegistry charges per pending stop order (funds the
   *  trigger gas; refunded on cancel). Raw wei.
   */
  getStopOrderSomiPayment(registry: Address): Promise<bigint>;

  /**
   *  A pool's protocol-wide per-order builder-fee ceiling (pool bps×1000).
   *  Read-only — no signer — for the order form's routing-fee ceiling hint.
   */
  getMaxBuilderFeeBpsTimes1k(pool: Address): Promise<bigint>;

  /** A user's raw per-builder approval cap on a pool (pool bps×1000; 0 = none). */
  getBuilderApproval(ref: BuilderApprovalRef): Promise<bigint>;

  /**
   *  The ENFORCED per-builder approval on a pool: the user's raw cap
   *  clamped by the pool's protocol-wide ceiling — the limit a `builderFeeBpsTimes1k`
   *  must not exceed. Drives the order form's "approve builder first" gate.
   */
  getEffectiveBuilderApproval(ref: BuilderApprovalRef): Promise<bigint>;

  /**
   *  owner / EIP-1967 implementation / native balance for a deployed contract —
   *  the /system dashboard diagnostics. `proxy: true` reads the impl slot.
   */
  getContractMeta(address: Address, opts?: { proxy?: boolean }): Promise<ContractMeta>;

  /** Native (SOMI/STT) balance, raw wei. */
  getNativeBalance(address: Address): Promise<bigint>;

  /** Latest block number as the RPC sees it. */
  getHeadBlock(): Promise<number>;

  /**
   *  Deployed protocol state (impl pointers, oracle, collateral) for ops
   *  dashboards. Needs `config.addresses`.
   */
  getSystemInfo(): Promise<SystemInfo>;

  // ------------------------------------------------------------------
  // Control plane — operators + venues (indexer-backed, like the market list)
  // ------------------------------------------------------------------

  /**
   *  List operators, newest-first by id, paginated. Pass `owner` to scope to
   *  one owner's operators (the indexed "my operators", no log scan), `enabled`
   *  to filter by the kill switch, `limit`/`offset` to page. Indexer read.
   */
  listOperators(opts?: OperatorFilter & { limit?: number; offset?: number }): Promise<IndexedOperator[]>;
  /**
   *  Server-side COUNT of operators matching a filter (for directory
   *  pagination). Needs the privileged `_aggregate` role (server-only), like
   *  {@link countBinaryMarkets}.
   */
  countOperators(opts?: OperatorFilter): Promise<number>;
  /** One operator by id, or null if never registered. Indexer read. */
  getOperator(operatorId: number): Promise<IndexedOperator | null>;
  /**
   *  List venues, creation-order, optionally scoped to one operator and/or
   *  market type and/or the venue-level creation flag. Paginated. Indexer read.
   */
  listVenues(opts?: {
    operatorId?: number;
    marketType?: string;
    creationEnabled?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<IndexedVenue[]>;
  /**
   *  Server-side COUNT of venues matching a filter (for per-operator venue
   *  pagination). Needs the privileged `_aggregate` role (server-only).
   */
  countVenues(opts?: { operatorId?: number; marketType?: string }): Promise<number>;
  /** One venue by its opaque bytes32 id, or null. Indexer read. */
  getVenue(venueId: string): Promise<IndexedVenue | null>;
  /**
   *  Build a BINARY_V1 venue's `feeParams` bytes from plain-bps rates via the
   *  deployed BinaryMarketsModule's `encodeVenueFeeParams` — the on-chain
   *  ground truth for the version tag + struct shape (used by the create/edit
   *  venue forms). Needs `config.addresses.binaryModule`.
   */
  encodeBinaryVenueFeeParams(vp: BinaryVenueParams): Promise<Hex>;
  /**
   *  The module's protocol-level ceiling on any single venue fee rate, in plain
   *  bps (e.g. 1_000 = 10%). Needs `config.addresses.binaryModule`.
   */
  getMaxVenueFeeBps(): Promise<number>;

  // ------------------------------------------------------------------
  // Operator "market machinery" — MarketCreators + oracle adapters + series
  // (indexer-backed directory, like the operator/venue list). On-chain point
  // reads + writes live on the machinery admins (createMarketCreatorAdmin /
  // createOracleHubAdmin / createGovernanceAdmin).
  // ------------------------------------------------------------------

  /**
   *  List MarketCreators, newest-first, paginated. Pass `owner` for "my
   *  machinery", `operatorId`/`venueId` to scope. Each row carries its nested
   *  `series`. Indexer read.
   */
  listMarketCreators(opts?: MarketCreatorFilter & { limit?: number; offset?: number }): Promise<IndexedMarketCreator[]>;
  /** One MarketCreator by address (with its series), or null. Indexer read. */
  getMarketCreator(creator: string): Promise<IndexedMarketCreator | null>;
  /**
   *  List oracle adapters, newest-first, paginated. Pass `owner` to scope,
   *  `approved` to filter by the module-approval gate. Oracle v2: the one
   *  approved adapter is the OracleHub — this directory tracks
   *  `AdapterApproved` history. Indexer read.
   */
  listOracleAdapters(opts?: { owner?: string; approved?: boolean; limit?: number; offset?: number }): Promise<IndexedOracleAdapter[]>;
  /** One oracle adapter by address, or null. Indexer read. */
  getOracleAdapter(adapter: string): Promise<IndexedOracleAdapter | null>;
  /** List series, creation-order, optionally scoped to one creator. Indexer read. */
  listSeries(opts?: { creator?: string; limit?: number; offset?: number }): Promise<IndexedSeries[]>;

  // ------------------------------------------------------------------
  // Oracle v2 hub §8e — quote reads (chain) + hub entities (indexer). The §8e
  // user-side rule: every create attaches `getSchedulingCost(def) +
  // resolveReserve()` native — the reserve is EARMARKED per-market at onBind
  // (no separate prepaid pre-fund). Surplus accrues to the operator's
  // withdrawable credit (`withdrawableOf`), drawn via credit-only `withdraw`.
  // ------------------------------------------------------------------

  /**
   *  The hub's MARGINAL scheduling cost for `def` — 0 when an identical
   *  template definition is already scheduled (the call would dedup), the full
   *  oracle submission cost otherwise. Chain read; needs
   *  `config.addresses.oracleHub`.
   */
  getSchedulingCost(def: QuestionDefinitionInput): Promise<bigint>;
  /**
   *  Native LOCKED for an operator's outstanding markets (wei; never
   *  withdrawable). Chain read; needs `config.addresses.oracleHub`.
   */
  earmarkedOf(operatorId: number): Promise<bigint>;
  /**
   *  An operator's accrued WITHDRAWABLE surplus credit on the hub (wei). Chain
   *  read; needs `config.addresses.oracleHub`.
   */
  creditOf(operatorId: number): Promise<bigint>;
  /**
   *  Count of an operator's bound-but-unresolved markets. Chain read; needs
   *  `config.addresses.oracleHub`.
   */
  outstandingOf(operatorId: number): Promise<bigint>;
  /**
   *  Wei an operator's owner may withdraw right now (== `creditOf`). Chain read;
   *  needs `config.addresses.oracleHub`.
   */
  withdrawableOf(operatorId: number): Promise<bigint>;
  /**
   *  A1: the withdrawable surplus credited to a reserve-PAYER (an open-venue
   *  creator, or the autonomous MarketCreator on its rolls) rather than the
   *  operator; drawn by that account via `createOracleHubAdmin().withdrawMyCredit`.
   *  Chain read; needs `config.addresses.oracleHub`.
   */
  payerCreditOf(payer: Address): Promise<bigint>;
  /**
   *  A1: the reserve-payer recorded for a market at onBind (surplus recipient);
   *  zero-address once settled + swept. Chain read; needs `config.addresses.oracleHub`.
   */
  payerOf(marketId: Hex): Promise<Address>;
  /**
   *  The hub's `resolveReserve()` — the per-market reserve attached+locked at
   *  onBind (wei). Chain read; needs `config.addresses.oracleHub`.
   */
  resolveReserve(): Promise<bigint>;
  /**
   *  THE §8e create-market value quote: `getSchedulingCost(def) +
   *  resolveReserve()` (the reserve is attached to the create). Attach exactly
   *  this to `scheduleAndCreateMarket` (excess refunds). Chain read; needs
   *  `config.addresses.oracleHub`.
   */
  quoteCreateMarketValue(def: QuestionDefinitionInput): Promise<bigint>;
  /**
   *  One hub-scheduled oracle question (dedup key, scheduler, bind count) by
   *  its oracleQuestionId, or null. Indexer read.
   */
  getOracleQuestion(oracleQuestionId: string): Promise<OracleQuestionRecord | null>;
  /**
   *  Hub-scheduled questions, newest first — filter by `scheduler` /
   *  `questionKey`, paginate. Indexer read.
   */
  listOracleQuestions(
    opts?: { scheduler?: string; questionKey?: string; limit?: number; offset?: number },
  ): Promise<OracleQuestionRecord[]>;
  /**
   *  One operator's hub account (earmarked / credit / outstanding) by
   *  operatorId, or null. Indexer read.
   */
  getOperatorHubAccount(operatorId: string | number): Promise<OperatorHubAccountRecord | null>;
  /**
   *  Operator hub-account records, most-recently-updated first, paginated.
   *  Indexer read.
   */
  listOperatorHubAccounts(
    opts?: { limit?: number; offset?: number },
  ): Promise<OperatorHubAccountRecord[]>;
  /**
   *  Bind records (operator attribution → exact metered resolve charge +
   *  subsidy per market, §8e), newest first — filter by `operatorId` /
   *  `oracleQuestionId` / `resolved`, paginate. Indexer read.
   */
  listOracleBinds(
    opts?: { operatorId?: number; oracleQuestionId?: string; resolved?: boolean; limit?: number; offset?: number },
  ): Promise<OracleBindRecord[]>;
  /**
   *  Resolution-callback conservation records (`CallbackAccounted`), newest
   *  first, paginated (a callback drains across many questions, so no
   *  per-question filter). Indexer read.
   */
  listOracleCallbacks(
    opts?: { limit?: number; offset?: number },
  ): Promise<OracleCallbackRecord[]>;

  // ------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------

  /**
   * Build a {@link Trader} bound to a signer and this client's chain, store,
   * and socket. With a `privateKey`/local `account` the trader signs locally
   * (fixed fees, locally-tracked nonce — zero pre-send RPCs) and confirms in
   * one round-trip via `realtime_sendRawTransaction`; with a browser
   * `walletClient` it sends through the wallet and confirms off the newHeads
   * subscription. Every write resolves only once mined, with its receipt.
   */
  createTrader(traderConfig: TraderConfig): Trader;

  /**
   * Build an {@link OperatorAdmin} bound to a signer — registers/updates
   * operators and creates/updates venues on MarketsCore. Same signer doctrine
   * as {@link createTrader} (privateKey/local account, or a browser walletClient).
   */
  createOperatorAdmin(config: OperatorAdminConfig): OperatorAdmin;

  /**
   * Build an {@link OracleHubAdmin} bound to a signer — the OracleHub surface
   * (Oracle v2 §8e): quote reads (`quoteCreateMarketValue` = the §8e create
   * value = scheduling cost + resolveReserve), the credit-only `withdraw`
   * (owner-gated — draws accrued surplus credit only), and the protocol-admin
   * writes (fundHub, gas + drain params, enableReactivity/migrateSubscription —
   * precompile, testnet/mainnet only). Same signer doctrine as
   * {@link createOperatorAdmin}. Needs `config.addresses.oracleHub`.
   */
  createOracleHubAdmin(config: OracleHubAdminConfig): OracleHubAdmin;

  /**
   * Build a {@link GovernanceAdmin} bound to a signer — the protocol-admin-only
   * surface that approves oracle adapters on the module (`setAdapterApproved`;
   * in Oracle v2 the ONE approved adapter is the OracleHub — deploy wiring +
   * emergency revoke). Gate its UI on {@link GovernanceAdmin.isModuleOwner}.
   */
  createGovernanceAdmin(config: GovernanceAdminConfig): GovernanceAdmin;

  /**
   * Build a {@link MarketCreatorAdmin} bound to a signer — stamps MarketCreators
   * (+ policies) from the factory, registers rolling series under them, funds
   * them, and triggers rolls. Same signer doctrine as {@link createOperatorAdmin}.
   */
  createMarketCreatorAdmin(config: MarketCreatorAdminConfig): MarketCreatorAdmin;
}
