import type { Address } from "viem";
import type { SomniaMarketsClient } from "../somniaMarketsClient.js";
import type { ClientConfig } from "../config.js";
import type { TailStatus } from "../store.js";
import type { Trader, TraderConfig } from "../trade.js";
import type { Tradable } from "./symbols.js";
import type { UnifiedBalances, UnifiedFundingRate, UnifiedMarket, UnifiedOHLCV, UnifiedOrder, UnifiedOrderBook, UnifiedPosition, UnifiedPrice, UnifiedStopOrder, UnifiedTicker, UnifiedTrade } from "./structs.js";
import * as PortfolioAnalytics from "./portfolioAnalytics.js";
import type { PortfolioTimeframe } from "./portfolioAnalytics.js";
/**
 *  Config for {@link SomniaMarkets}: the native client config plus (optionally) a
 *  signer — authenticated methods throw without one.
 */
export type SomniaMarketsConfig = ClientConfig & Pick<TraderConfig, "privateKey" | "account" | "walletClient">;
/**
 *  The optional trailing params bag of {@link SomniaMarkets.createOrder} —
 *  time-in-force, market-order slippage, and builder-fee attribution.
 *  Everything here has a working default.
 */
export interface CreateOrderParams {
    /** "IOC" | "FOK" | "PO" (post-only). Default GTC (rest). */
    timeInForce?: "GTC" | "IOC" | "FOK" | "PO";
    /** Alias for timeInForce: "PO". */
    postOnly?: boolean;
    /** Market-order slippage bound vs the best opposite level (default 0.01 = 1%). */
    slippage?: number;
    /**
     *  Routing/builder frontend to attribute the order to. Requires a prior
     *  `client.createTrader().approveBuilder(...)` opt-in on the pool, else a
     *  non-zero `builderFeeBpsTimes1k` reverts. Works on binary, spot and perp.
     */
    builder?: Address;
    /**
     *  Per-order builder/routing fee in the pool's native bps×1000 unit
     *  (must not exceed the effective approval / the pool's max builder fee).
     */
    builderFeeBpsTimes1k?: bigint;
}
/**
 * The exchange — the SDK's single entry point. One instance per chain; wraps
 * the native engine (watches, local books, one-round-trip writes) behind
 * symbols, `fetch*`/`watch*` verbs, and human-unit structs — the idioms every
 * exchange bot already speaks (ccxt users will feel at home, down to the
 * field names).
 *
 * **When to use**
 *
 * Use as the entry point for strategy and display code — numbers are human
 * units, which is what that code wants. Reach past it to the native engine at
 * {@link SomniaMarkets.client} (bigint-exact reads) and
 * {@link SomniaMarkets.trader} (raw writes) for everything the unified surface
 * doesn't cover.
 *
 * **Details**
 *
 * Verb conventions:
 * - `fetch*` — one-shot (a chain or indexer round-trip).
 * - `watch*` — streaming: each await resolves on the NEXT update of that
 *   channel, served from the zero-round-trip local store (the first call
 *   hydrates the ref-counted market watch).
 * - `create*` / `cancel*` — writes (fixed fees, one-round-trip confirm).
 *
 * Every struct carries the raw native payload under `info` for exact math.
 *
 * Each instance is fully isolated — its own config, live store, and lazily
 * opened WebSocket (an indexer-only exchange never opens one) — so one
 * process can run several: a bot per chain, per-request servers, parallel
 * tests.
 *
 * **Gotchas**
 *
 * Call {@link SomniaMarkets.close} to release the watches when done. The native
 * engine is not separately constructible — it is only reachable through an
 * exchange instance.
 *
 * @example
 * Load the market registry, stream a book, place a limit order.
 * ```ts
 * import { SomniaMarkets } from "@somnia-chain/markets-sdk";
 *
 * const exchange = new SomniaMarkets({
 *   chain,        // a viem Chain
 *   wsRpcUrl,     // wss:// RPC of that chain
 *   indexerUrl,   // the Envio/Hasura GraphQL endpoint
 *   addresses,    // contract addresses (e.g. from @somnia-chain/deployments)
 *   privateKey,   // optional — only createOrder & friends need a signer
 * });
 * await exchange.loadMarkets();
 *
 * const book  = await exchange.watchOrderBook("BTC-95000-31DEC26/USDC#YES"); // live, zero RTT
 * const order = await exchange.createOrder("BTC-95000-31DEC26/USDC#YES", "limit", "buy", 10, 0.62);
 * await exchange.close();
 * ```
 */
export declare class SomniaMarkets {
    /** The native engine — bigint-exact, address-keyed. The escape hatch. */
    readonly client: SomniaMarketsClient;
    /** Unified markets keyed by MARKET symbol (populated by loadMarkets). */
    markets: Record<string, UnifiedMarket>;
    /** All market symbols (populated by loadMarkets). */
    symbols: string[];
    /**
     *  Capability map — which unified verbs this venue supports (the ccxt
     *  `exchange.has` convention, for capability-probing bot code). Every listed
     *  verb is implemented here, so every flag is `true`.
     */
    readonly has: {
        /** {@link SomniaMarkets.fetchMarkets} */
        readonly fetchMarkets: true;
        /** {@link SomniaMarkets.fetchOrderBook} */
        readonly fetchOrderBook: true;
        /** {@link SomniaMarkets.fetchTrades} */
        readonly fetchTrades: true;
        /** {@link SomniaMarkets.fetchOHLCV} */
        readonly fetchOHLCV: true;
        /** {@link SomniaMarkets.fetchBalance} */
        readonly fetchBalance: true;
        /** {@link SomniaMarkets.fetchOpenOrders} */
        readonly fetchOpenOrders: true;
        /** {@link SomniaMarkets.fetchMyTrades} */
        readonly fetchMyTrades: true;
        /** {@link SomniaMarkets.fetchStatus} */
        readonly fetchStatus: true;
        /** {@link SomniaMarkets.createOrder} */
        readonly createOrder: true;
        /** {@link SomniaMarkets.cancelOrder} */
        readonly cancelOrder: true;
        /** {@link SomniaMarkets.watchOrderBook} */
        readonly watchOrderBook: true;
        /** {@link SomniaMarkets.watchTrades} */
        readonly watchTrades: true;
        /** {@link SomniaMarkets.watchOrders} */
        readonly watchOrders: true;
        /** {@link SomniaMarkets.watchMyTrades} */
        readonly watchMyTrades: true;
        /** {@link SomniaMarkets.fetchPositions} */
        readonly fetchPositions: true;
        /** {@link SomniaMarkets.fetchFundingRate} */
        readonly fetchFundingRate: true;
        /**
         *  {@link SomniaMarkets.fetchFundingRateHistory} — the key did not previously exist
         *  in this map, so it had to be ADDED rather than flipped.
         */
        readonly fetchFundingRateHistory: true;
        /** {@link SomniaMarkets.watchPrice} */
        readonly watchPrice: true;
        /** {@link SomniaMarkets.fetchPrice} */
        readonly fetchPrice: true;
        /** {@link SomniaMarkets.fetchPriceOHLCV} */
        readonly fetchPriceOHLCV: true;
    };
    private readonly registry;
    private signerConfig;
    private traderInstance;
    /** token address (lowercased) -> { code, decimals } for symbols + balances. */
    private currencies;
    /**
     *  binary pool (lowercased) -> the tick/lot/minQuantity grid the pool
     *  enforces. Binary rows come off the indexer with these fields undefined
     *  (the indexer never sees them), so loadMarkets() reads them from the pool;
     *  the precision helpers are synchronous and read only from here.
     */
    private bookParams;
    private watches;
    private priceWatches;
    private channels;
    private unsubscribe;
    private unsubscribePrices;
    constructor(config: SomniaMarketsConfig);
    /**
     *  The raw write tier bound to this exchange's signer — bigint-exact
     *  `placeOrder`/`mintSet`/`faucet`/… for anything the unified verbs don't
     *  cover.
     *
     *  **Gotchas**
     *
     *  Built lazily; throws if no signer was configured.
     */
    get trader(): Trader;
    /**
     *  Bind (or replace) the exchange's signer after construction. Browser apps
     *  construct the exchange at boot for public reads, then call this when the
     *  user's wallet connects — and again with `{}` on disconnect, which returns
     *  the exchange to unauthenticated reads. Replaces the trader every
     *  authenticated verb and `walletAddress` resolve against; live watches and
     *  market data are unaffected.
     */
    setSigner(signer: Pick<TraderConfig, "privateKey" | "account" | "walletClient">): void;
    /** The authenticated wallet address, if a signer was configured. */
    get walletAddress(): Address | undefined;
    /**
     *  The wallet address, or {@link SignerRequiredError} naming the caller.
     *
     *  @param operation - The public method requiring the signer; it appears in the
     *  error so the caller sees which call needs a signer, not just "a method".
     */
    private requireAddress;
    /**
     *  Load (or reload) the market registry: every market as a unified,
     *  symbol-keyed market object. Call once before anything symbol-based.
     */
    loadMarkets(reload?: boolean): Promise<Record<string, UnifiedMarket>>;
    private toUnifiedMarket;
    /**
     *  Resolve any handle (symbol, tradable symbol, pool/market address, market
     *  id) to its tradable. Requires loadMarkets().
     */
    market(ref: string): Tradable;
    /**
     *  Snap a price to the market's tick grid (rounds down; binary prices are
     *  also clamped inside (0, 1)).
     *
     *  **When to use**
     *
     *  Use before createOrder with computed prices.
     *
     *  Spot/perp ticks come from the market row; binary ticks come from the pool,
     *  read once by {@link loadMarkets} — so a pool recycled mid-session keeps the
     *  grid captured at load time until `loadMarkets(true)` refreshes it.
     *
     *  @throws {@link InvalidInputError} if the market is binary and its pool's
     *  parameters could not be read — quantizing against a guessed grid is what
     *  produced off-tick rejections, so this fails loudly instead.
     */
    priceToPrecision(ref: string, price: number): number;
    /**
     *  Snap an amount to the market's lot grid (rounds down).
     *
     *  Spot/perp lots come from the market row; binary lots come from the pool,
     *  read once by {@link loadMarkets} — so a pool recycled mid-session keeps the
     *  grid captured at load time until `loadMarkets(true)` refreshes it.
     *
     *  @throws {@link InvalidInputError} if the market is binary and its pool's
     *  parameters could not be read. Previously such a market fell back to a
     *  one-whole-token lot, silently flooring every sub-token amount to 0.
     */
    amountToPrecision(ref: string, amount: number): number;
    /**
     *  Every market as an array — {@link loadMarkets} (called if needed), minus
     *  the symbol keying.
     *
     *  **When to use**
     *
     *  Use as the ccxt-shaped sibling for list-style consumers.
     */
    fetchMarkets(): Promise<UnifiedMarket[]>;
    /**
     *  The market's price grid in RAW quote units. Binary ticks come from the pool
     *  (and throw when that read failed, rather than quantizing against a guess);
     *  spot/perp ticks come from the market row, falling back to the venue's
     *  `10 ** (decimals - 3)` convention when the row carries none.
     *
     *  One definition shared by {@link priceToPrecision} and the write path, so a
     *  caller who pre-snaps and a caller who does not cannot be aligned against
     *  different grids.
     */
    private tickOf;
    /** The market's amount grid in RAW base units. See {@link tickOf}. */
    private lotOf;
    private decimalsOf;
    /**
     *  The binary pool's enforced grid, or a throw. Only loadMarkets() populates
     *  the map, so an absent entry means that pool's read failed during the last
     *  load — not that the caller passed a bad ref.
     */
    private requireBookParams;
    /** Native book → this tradable's [price, amount][] view, human units. */
    private bookView;
    /** Taker direction on this tradable's book from a binary side. */
    private sideView;
    /** YES-terms raw price for this tradable's human price (NO inverts). */
    private toNativePrice;
    private priceView;
    /**
     *  An OHLC row through this tradable's lens. NO-outcome tradables mirror the
     *  price axis (p → 1−p), which also SWAPS high and low — the trap every
     *  candle-shaped read must avoid. RULE for new verbs: never invert prices,
     *  sides, or OHLC inline — go through {@link priceView} / {@link sideView} /
     *  this, so a verb cannot forget the lens. (The 1−p mirror is inherently
     *  BINARY: a categorical N-outcome book has no such pairwise mirror, so
     *  outcome views there will need a real per-outcome book, not a wider lens.)
     */
    private ohlcView;
    /**
     *  One-shot book read from the contract (head-fresh; no watch needed).
     *
     *  **When to use**
     *
     *  Use when one book snapshot is enough. For a continuously-current
     *  zero-round-trip book, use {@link watchOrderBook}.
     */
    fetchOrderBook(ref: string, limit?: number): Promise<UnifiedOrderBook>;
    /** Recent public trades (indexer, newest first). */
    fetchTrades(ref: string, since?: number, limit?: number): Promise<UnifiedTrade[]>;
    /**
     * OHLCV candles (indexer), oldest first as [ms,o,h,l,c,vol] rows.
     * Timeframes: 1m 5m 15m 1h 4h 1d.
     *
     * @example
     * The last 24 hourly candles, destructured per row.
     * ```ts
     * const candles = await exchange.fetchOHLCV("SOMI/USDC", "1h", undefined, 24);
     * for (const [ts, open, high, low, close, volume] of candles) {
     *   console.log(new Date(ts).toISOString(), open, high, low, close, volume);
     * }
     * ```
     */
    fetchOHLCV(ref: string, timeframe?: string, since?: number, limit?: number): Promise<UnifiedOHLCV[]>;
    /**
     * Rolling 24h ticker (indexer): OHLC + base/quote volume folded from the
     * hourly candles, `last` from the freshest fill. NO-outcome tradables view
     * prices through the 1−p lens like every other read.
     *
     * @example
     * Drive a price strip off one call.
     * ```ts
     * const tk = await exchange.fetchTicker("SOMI/USDC");
     * console.log(tk.last, tk.percentage, tk.baseVolume);
     * ```
     */
    fetchTicker(ref: string): Promise<UnifiedTicker>;
    /**
     * Wallet balances for every currency the loaded markets use (+ native).
     *
     * **Gotchas**
     *
     * `free === total`: funds escrowed in resting orders live in the pools, not
     * the wallet, so they simply don't appear here.
     *
     * @example
     * ERC-20s key by currency code; binary outcome holdings key by TRADABLE symbol.
     * ```ts
     * const bal = await exchange.fetchBalance();
     * console.log(bal.USDC?.total);                              // collateral in the wallet
     * console.log(bal["BTC-95000-31DEC26/USDC#YES"]?.total);     // YES shares held
     * ```
     *
     * @throws {@link SignerRequiredError} - balances are per-account, so this needs
     * a signer (or an `account`) even though it only reads.
     * @throws {@link IndexerError} - `loadMarkets()` needed the indexer and it was
     * unreachable. Distinct from an empty result: no balances is `{}`, not a throw.
     * @throws {@link RpcError} - a chain balance read did not complete.
     */
    fetchBalance(): Promise<UnifiedBalances>;
    /**
     *  Open orders (indexer view).
     *
     *  **When to use**
     *
     *  Use for an occasional snapshot; a trading loop should prefer
     *  {@link watchOrders}.
     *
     *  **Details**
     *
     *  `limit` is applied BY THE QUERY, per venue — not to the merged result. An
     *  unscoped call reads all three venues, so it can return up to 3 × `limit`
     *  rows; a `ref`-scoped call reads only that venue. The default is 200 per
     *  venue.
     *
     *  **Gotchas**
     *
     *  The indexer view lags the chain slightly.
     *
     *  On SPOT the same limit also bounds the PENDING STOP ORDERS the underlying
     *  portfolio read returns — one query variable caps both sets. That list is
     *  not part of this verb's result, so the coupling is invisible here, but a
     *  caller reading `client.getSpotPortfolio` directly with a small
     *  `ordersLimit` will see a correspondingly short `pendingStopOrders`.
     *
     *  @param ref - Restrict to one tradable (symbol or address). Omit for all.
     *  @param limit - Max orders PER VENUE the query returns (default 200).
     */
    fetchOpenOrders(ref?: string, limit?: number): Promise<UnifiedOrder[]>;
    /**
     * The wallet's orders across every lifecycle status (indexer), newest
     * first — the history counterpart to {@link fetchOpenOrders}. Scope to one
     * tradable with `ref`; page with `limit`/`params.offset`, both forwarded to
     * the query as a true offset window over one ordered set. (Its siblings page
     * differently: {@link fetchMyTrades} pages a fill tape to satisfy `limit`,
     * and {@link fetchOpenOrders} applies its limit per venue.)
     *
     * @example
     * The last 50 orders on one book, whatever became of them.
     * ```ts
     * const orders = await exchange.fetchOrders("SOMI/USDC", undefined, 50);
     * for (const o of orders) console.log(o.status, o.side, o.amount, o.txHash);
     * ```
     */
    fetchOrders(ref?: string, since?: number, limit?: number, params?: {
        offset?: number;
    }): Promise<UnifiedOrder[]>;
    private mapPortfolioOrder;
    private mapSpotPortfolioOrder;
    /**
     * The wallet's portfolio metrics plane over a timeframe: equity curve
     * (cumulative realized + unrealized PnL), per-bucket PnL, money-weighted
     * return, volume, and fees saved versus a comparison taker rate. Computed
     * client-side from the wallet's indexed fills (avg-cost basis) marked to
     * candle closes — no server aggregate involved.
     *
     * SPOT-scoped today: binary outcomes settle rather than mark, and the perp
     * account plane (funding, margin) joins the fold as new event kinds when
     * perp analytics land. Fills are paged to exhaustion — truncating would
     * drop the OLDEST fills and silently corrupt the carried-in cost basis,
     * not just undercount volume. Fills whose taker direction the indexer has
     * not resolved (`takerIsBid` null), or where the wallet's role (maker vs
     * taker) is unknowable, are skipped rather than guessed.
     *
     * @example
     * ```ts
     * const p = await exchange.fetchPortfolioAnalytics("7d");
     * console.log(p.pnl.totalUsd, p.mwrr.return, p.equity.length);
     * ```
     */
    fetchPortfolioAnalytics(timeframe: PortfolioTimeframe, params?: {
        sessionSince?: number;
        cexRateBps?: number;
    }): Promise<PortfolioAnalytics.PortfolioAnalytics>;
    /**
     *  My historical trades, newest-first across every venue.
     *
     *  **Details**
     *
     *  Reads the unified fill tape (`getUserFills`), so the scope, the window and
     *  the limit are applied by the INDEXER rather than to an already-truncated
     *  page. This is what makes a narrow question answerable: a `ref`-scoped call
     *  returns that market's fills however old they are, where a per-venue read
     *  would have capped at its newest 50 across all markets first and left
     *  nothing to filter.
     *
     *  `limit` counts rows YOU receive. Fills whose pool is not in the loaded
     *  registry are unresolvable and are skipped, so the read pages until it has
     *  `limit` resolvable rows or the tape runs out — asking the query for exactly
     *  `limit` would under-deliver by however many it then dropped.
     *
     *  @param ref - Restrict to one tradable (symbol or address). Omit for all.
     *  @param since - Lower time bound, **milliseconds** — same clock as
     *  {@link UnifiedTrade.timestamp}, so a value read off a previous row can be
     *  passed straight back. Converted to the indexer's unix seconds internally.
     *  @param limit - Max rows to return (default 50).
     */
    fetchMyTrades(ref?: string, since?: number, limit?: number): Promise<UnifiedTrade[]>;
    /**
     *  One fill row through the asking tradable's lens, or null when the row's
     *  pool is not in the registry or falls outside `scope`.
     *
     *  Binary rows carry the account's YES/NO side, which selects the outcome
     *  tradable — and NO mirrors both price and side, so both go through
     *  {@link priceView} / {@link sideView} rather than being read raw.
     */
    private fillToUnifiedTrade;
    /** Spot/perp direction FROM THIS ACCOUNT's seat: the maker is the taker's mirror. */
    private takerSideView;
    /**
     * Exchange health.
     *
     * **Details**
     *
     * "ok" unless a live watch is missing its socket — "connecting" while the
     * first WS handshake is still in flight (~1s after a watch opens), "error"
     * once a previously-live socket is lost.
     */
    fetchStatus(): Promise<{
        /**
         * "ok" — healthy (or no watches held). "connecting" — a watch is open but
         * the subscription handshake hasn't delivered a head yet (transient,
         * boot-time). "error" — a live watch LOST its socket.
         */
        status: "ok" | "connecting" | "error";
        /** When this snapshot was taken (ms). */
        updated: number;
        /** The native live-tail status (watch count, socket + resync state). */
        info: TailStatus;
    }>;
    private tryResolvePool;
    private tryResolveByMarketAddress;
    /** Hold the ref-counted market watch behind a symbol (idempotent). */
    private ensureWatch;
    /**
     *  Streaming semantics: resolves with the channel's current value on first
     *  call, then each subsequent call resolves when the underlying (memoized)
     *  native ref CHANGES — reference equality is the change detector.
     */
    private nextTick;
    private ensureListener;
    /**
     * Streaming book off the local store: zero round-trips, current to the last
     * block; each await resolves on the next book change.
     *
     * @example
     * A quoting loop: wake on every book change, read the touch.
     * ```ts
     * while (true) {
     *   const book = await exchange.watchOrderBook("SOMI/USDC", 5);
     *   const [bestBid] = book.bids[0] ?? [];
     *   const [bestAsk] = book.asks[0] ?? [];
     *   console.log(`bid ${bestBid} / ask ${bestAsk}`);
     * }
     * ```
     */
    watchOrderBook(ref: string, limit?: number): Promise<UnifiedOrderBook>;
    /**
     * Streaming public trades (the live tape), newest first.
     *
     * @example
     * Print each fill as it lands (`[0]` is always the latest).
     * ```ts
     * while (true) {
     *   const [latest] = await exchange.watchTrades("SOMI/USDC", 1);
     *   if (latest) console.log(`${latest.side ?? "?"} ${latest.amount} @ ${latest.price}`);
     * }
     * ```
     */
    watchTrades(ref: string, limit?: number): Promise<UnifiedTrade[]>;
    /**
     * Streaming view of MY orders on this tradable (authenticated).
     *
     * **When to use**
     *
     * Use to learn that a resting order filled: its status flips to "closed".
     *
     * @example
     * Place a limit order, then block until it fully fills (or dies).
     * ```ts
     * const placed = await exchange.createOrder(symbol, "limit", "buy", 10, 0.62);
     * while (placed.status === "open") {
     *   const orders = await exchange.watchOrders(symbol); // resolves on the next change
     *   const mine = orders.find((o) => o.id === placed.id);
     *   if (!mine || mine.status !== "open") break; // filled, canceled, or expired
     * }
     * ```
     */
    watchOrders(ref: string, limit?: number): Promise<UnifiedOrder[]>;
    /** Streaming view of MY fills on this tradable (authenticated). */
    watchMyTrades(ref: string, limit?: number): Promise<UnifiedTrade[]>;
    /** Hold the ref-counted price watch behind an asset (idempotent). */
    private ensurePriceWatch;
    private toUnifiedPrice;
    /**
     *  Streaming price off the local price store: zero round-trips, current to the
     *  last pushed tick; each await resolves on the next price change.
     *
     *  **Details**
     *
     *  First call hydrates the ref-counted feed watch.
     *
     *  **Gotchas**
     *
     *  Requires `config.priceFeed` to be set.
     */
    watchPrice(asset: string): Promise<UnifiedPrice>;
    /**
     *  One-shot current price (indexer HTTP read; no watch needed), or null if the
     *  feed has no observations yet.
     */
    fetchPrice(asset: string): Promise<UnifiedPrice | null>;
    /**
     *  OHLC price candles (EMA oracle), oldest first as [ms,o,h,l,c,vol] rows.
     *
     *  **Details**
     *
     *  Timeframes: 1m 1h 1d (aliases for the feed's M1/H1/D1).
     *
     *  **Gotchas**
     *
     *  `vol` is the oracle update count for the bucket (NOT trade volume).
     */
    fetchPriceOHLCV(asset: string, timeframe?: string, since?: number, limit?: number): Promise<UnifiedOHLCV[]>;
    /**
     * Place an order.
     *
     * **Details**
     *
     * Works identically for every market kind: the tradable symbol carries the
     * outcome, `side` is plain buy/sell, prices and amounts are human units in the
     * tradable's own terms. `type: "market"` computes a crossing limit from the
     * best opposite level ± `params.slippage` (default 1%) and sends it IOC.
     * Resolves once mined, with fills decoded from the same round-trip.
     *
     * **Gotchas**
     *
     * A NO price is the NO probability — the YES-terms complement is handled
     * internally.
     *
     * The price and quantity are ALIGNED to the market's tick and lot grids before
     * they are sent, because the pool rejects an off-grid value outright. Alignment
     * never moves a value against you: a buy price rounds down, a sell price rounds
     * up, and a quantity always rounds down, so the order is never larger or worse
     * priced than you asked for. The returned {@link UnifiedOrder} carries what was
     * actually placed, which may differ from the arguments by up to one tick or lot
     * — read `price` and `amount` back from it rather than assuming your inputs.
     * Pre-aligning with {@link priceToPrecision} / {@link amountToPrecision} makes
     * this a no-op, since aligning an aligned value changes nothing.
     *
     * Note {@link priceToPrecision} always rounds DOWN, for either side; this path
     * is side-aware instead, so for a sell the two can differ by one tick.
     *
     * A quantity below one whole lot throws {@link InvalidInputError} rather than
     * silently placing a zero-quantity order.
     *
     * @example
     * Rest a bid at 62% on YES, then take the NO book at market.
     * ```ts
     * const rested = await exchange.createOrder("BTC-95000-31DEC26/USDC#YES", "limit", "buy", 25, 0.62);
     * console.log(rested.status, rested.filled); // "open" 0 — or "closed" if it crossed
     *
     * const taken = await exchange.createOrder("BTC-95000-31DEC26/USDC#NO", "market", "sell", 10, undefined, {
     *   slippage: 0.02, // accept up to 2% past the best bid
     * });
     * ```
     *
     * @throws {@link SignerRequiredError} - the exchange was built without a
     * `privateKey` / `account` / `walletClient`.
     * @throws {@link InvalidInputError} - unknown symbol (call `loadMarkets()`
     * first), a `"limit"` order with no price, or a `"market"` order whose
     * opposite book side is empty so no crossing price exists.
     * @throws {@link ContractRevertError} - the chain rejected the order. Branch on
     * `errorName` for the protocol's own reason (e.g. `InsufficientBalance`,
     * `ExpiredOrderMustBeCancelled`).
     * @throws {@link RpcError} - the send never got an answer from the node.
     * @throws {@link IndexerError} - a symbol lookup needed the indexer and it was
     * unreachable.
     */
    createOrder(ref: string, type: "limit" | "market", side: "buy" | "sell", amount: number, price?: number, params?: CreateOrderParams): Promise<UnifiedOrder>;
    private crossingPrice;
    /**
     * Cancel a resting order by id (from createOrder / watchOrders).
     *
     * @example
     * ```ts
     * const placed = await exchange.createOrder("SOMI/USDC", "limit", "buy", 10, 0.55);
     * if (placed.status === "open") await exchange.cancelOrder(placed.id, "SOMI/USDC");
     * ```
     *
     * @throws {@link SignerRequiredError} - no signer on this exchange.
     * @throws {@link InvalidInputError} - unknown symbol.
     * @throws {@link ContractRevertError} - the cancel did not land; `errorName` says
     * why (an already-filled or already-canceled order reverts).
     * @throws {@link RpcError} - the send never got an answer from the node.
     */
    cancelOrder(id: string, ref: string): Promise<{
        /** The canceled order's id, echoed back. */
        id: string;
        /** The tradable symbol the order lived on. */
        symbol: string;
        /** Always "canceled" — the call throws if the cancel didn't land. */
        status: "canceled";
        /** The native {@link TxResult}. */
        info: unknown;
    }>;
    /** The spot tradable + its stop registry, or a loud error naming the gap. */
    private requireStopVenue;
    /**
     * Place a stop / take-profit order: rests OFF the book on the market's
     * stop registry and fires as a market or limit order when the pool's mark
     * price crosses `triggerPrice`. The trigger direction is inferred from
     * which side of the current mark the trigger sits on; pass
     * `params.triggerDirection` to pin it explicitly.
     *
     * **Gotchas**
     *
     * The trigger, limit price and quantity are aligned to the market's grids, and
     * the trigger aligns AWAY from the mark so it cannot land on it (a trigger equal
     * to the mark fires the instant it is armed). The limit price aligns like any
     * order price — a buy down, a sell up — so it never becomes worse than stated.
     *
     * Those two rules are independent, so a limit set exactly EQUAL to the trigger
     * can end up one tick inside it: a buy stop at trigger `0.5004`, limit `0.5004`
     * on a `0.001` grid arms at `0.501` and rests a `0.500` bid, which may not fill.
     * That is deliberate — pulling the limit up to meet the trigger would make you
     * pay more than you asked. Set the limit a tick or two past the trigger when you
     * want the triggered order to cross.
     *
     * @example
     * A stop-loss: sell 5 if the mark drops to 1.10.
     * ```ts
     * const stop = await exchange.createStopOrder("SOMI/USDC", "market", "sell", 5, 1.10);
     * // …later: await exchange.cancelStopOrder(stop.id, "SOMI/USDC");
     * ```
     */
    createStopOrder(ref: string, type: "limit" | "market", side: "buy" | "sell", amount: number, triggerPrice: number, price?: number, params?: {
        triggerDirection?: "above" | "below";
    }): Promise<UnifiedStopOrder>;
    /**
     * The wallet's pending (armed, untriggered) stop orders, newest first.
     * Scope to one tradable with `ref`.
     */
    fetchOpenStopOrders(ref?: string): Promise<UnifiedStopOrder[]>;
    /**
     * Cancel a pending stop order on its registry (refunds the keeper
     * payment). `id` comes from {@link fetchOpenStopOrders}.
     */
    cancelStopOrder(id: string, ref: string): Promise<{
        /** The canceled stop order's id, echoed back. */
        id: string;
        /** The tradable symbol the stop targeted. */
        symbol: string;
        /** Always "canceled" — the call throws if the cancel didn't land. */
        status: "canceled";
        /** The native {@link TxResult}. */
        info: unknown;
    }>;
    /** Live funding-rate + mark/index snapshot for a perp market (chain read). */
    fetchFundingRate(ref: string): Promise<UnifiedFundingRate>;
    /**
     *  Historical funding rates for a perp market, oldest first (ccxt-standard shape).
     *
     *  Reads the INDEXED series rather than the chain: only one funding value is readable
     *  on chain at a time. Positional `(symbol, since, limit)` follows the ccxt convention
     *  set by `fetchOHLCV`, unlike the object-options readers on the client.
     *
     *  `fundingRate` is normalized to a per-8h fraction using each row's own
     *  `fundingWindowSec`, so the series stays consistent across a parameter change. The
     *  raw indexed row is on `info` for anything more specific — including `spanStart` /
     *  `spanEnd`, which matter because a row's accrual reaches BACKWARDS from its timestamp
     *  and a lazily-settled one can cover hours.
     *
     *  `since` is a CURSOR, not just a window bound: passing it walks FORWARD from that
     *  point, so the ccxt pagination idiom terminates.
     *
     *  ```ts
     *  let since = startOfHistory;
     *  for (;;) {
     *    const page = await exchange.fetchFundingRateHistory("BTC/USDSO:USDSO", since, 100);
     *    if (page.length === 0) break;
     *    consume(page);
     *    since = page[page.length - 1].timestamp + 1;   // advances
     *  }
     *  ```
     *
     *  Without the forward ordering this loop spins: the underlying read pages newest-first,
     *  so narrowing the window from below still returns the newest N and `since` never gets
     *  past the tail. Omitting `since` keeps the newest-first behaviour, which is what a
     *  "latest funding" read wants — `fetchOHLCV` has the same split.
     *
     *  @param ref - market symbol or pool address
     *  @param since - unix MILLISECONDS (ccxt convention), inclusive; acts as a forward cursor
     *  @param limit - max rows (default 100)
     */
    fetchFundingRateHistory(ref: string, since?: number, limit?: number): Promise<UnifiedFundingRate[]>;
    /**
     *  Open perp positions (authenticated; on-chain MarginBank reads). Pass
     *  symbols to scope; defaults to every loaded perp market.
     */
    fetchPositions(refs?: string[]): Promise<UnifiedPosition[]>;
    /**
     *  Deposit collateral into the perp MarginBank (human quote units, e.g.
     *  USDso). One cross-margin balance covers every perp market.
     */
    depositMargin(ref: string, amount: number): Promise<{
        /** Hash of the mined deposit transaction. */
        hash: string;
        /** The native {@link TxResult}. */
        info: unknown;
    }>;
    /** Withdraw free collateral from the perp MarginBank (human quote units). */
    withdrawMargin(ref: string, amount: number): Promise<{
        /** Hash of the mined withdrawal transaction. */
        hash: string;
        /** The native {@link TxResult}. */
        info: unknown;
    }>;
    private requirePerpMarket;
    /**
     * Mint complete sets: `amount` collateral → `amount` of EVERY outcome.
     *
     * @example
     * Mint 100 sets (100 USDC → 100 YES + 100 NO), then sell the side you don't want.
     * ```ts
     * await exchange.mintSet("BTC-95000-31DEC26/USDC", 100);
     * await exchange.createOrder("BTC-95000-31DEC26/USDC#NO", "limit", "sell", 100, 0.38);
     * ```
     */
    mintSet(ref: string, amount: number): Promise<{
        /** Hash of the mined mint transaction. */
        hash: string;
        /** The native {@link TxResult}. */
        info: unknown;
    }>;
    /** Burn complete sets back to collateral. */
    burnSet(ref: string, amount: number): Promise<{
        /** Hash of the mined burn transaction. */
        hash: string;
        /** The native {@link TxResult}. */
        info: unknown;
    }>;
    /**
     * Redeem winning outcome tokens for collateral (post-resolution). Settlement-
     * extraction v2: module-routed by `marketId` (the winning outcome is read off
     * the BinaryMarket contract when not resolved yet in the indexed row).
     *
     * @example
     * After resolution, redeem the winning side found in the balance map.
     * ```ts
     * const bal = await exchange.fetchBalance();
     * const winning = bal["BTC-95000-31DEC26/USDC#YES"]?.total ?? 0;
     * if (winning > 0) await exchange.redeem("BTC-95000-31DEC26/USDC", winning);
     * ```
     */
    redeem(ref: string, amount: number): Promise<{
        /** Hash of the mined redeem transaction. */
        hash: string;
        /** The native {@link TxResult}. */
        info: unknown;
    }>;
    private requireOutcomeMarket;
    /**
     *  Release every watch + channel this exchange holds and stop the client's
     *  live machinery.
     *
     *  **Details**
     *
     *  The instance stays usable for one-shot fetch calls.
     */
    close(): Promise<void>;
}
