// SomniaMarkets — the exchange class, the SDK's ONLY entry point. The full
// didactic story lives in the class doc below (it's what TypeDoc publishes).

import { privateKeyToAccount } from "viem/accounts";
import { InvalidInputError, RpcError, SignerRequiredError } from "../errors.js";
import { unreachable } from "../raise.js";
import type { Address, Hex } from "viem";
import * as CreateClient from "../createClient.js";
import type { SomniaMarketsClient } from "../somniaMarketsClient.js";
import type { ClientConfig } from "../config.js";
import type { WatchHandle } from "../liveTail.js";
import type { PriceWatchHandle } from "../priceFeed/priceFeed.js";
import type { LivePrice, PriceCandle, PriceCandleResolution } from "../priceFeed/types.js";
import * as Markets from "../markets.js";
import * as ReadsAbi from "../readsAbi.js";
import type { PerpPortfolioOrder, PerpPortfolioTrade } from "../perp/portfolio.js";
import type { SpotPortfolioOrder, SpotPortfolioTrade } from "../spot/portfolio.js";
import type { PortfolioOrder } from "../binary/portfolio.js";
import type { FillRow } from "../fills.js";
import type { BinaryMarket, Market, PerpMarket, SpotMarket } from "../markets.js";
import type { BookLevel, LiveFill, LiveOrder } from "../store.js";
import { fundingRate8h } from "../funding.js";
import { perpMarkForPnl } from "../perp/state.js";
import type { BinaryBookParams, BinaryOrderBook } from "../orders.js";
import type { BinarySide, TailStatus } from "../store.js";
import type { Trader, TraderConfig, PlaceOrderResult, TxResult } from "../trade.js";
import * as Trade from "../trade.js";
import type { Tradable } from "./symbols.js";
import { AsyncCache } from "../asyncCache.js";
import * as Symbols from "./symbols.js";
import type {
  UnifiedBalances,
  UnifiedFundingRate,
  UnifiedMarket,
  UnifiedOHLCV,
  UnifiedOrder,
  UnifiedOrderBook,
  UnifiedPosition,
  UnifiedPrice,
  UnifiedStopOrder,
  UnifiedTicker,
  UnifiedTrade,
} from "./structs.js";
import * as Structs from "./structs.js";
import * as DerivedReads from "../derivedReads.js";
import * as PortfolioAnalytics from "./portfolioAnalytics.js";
import type {
  MarkSeries,
  PortfolioAnalytics as PortfolioAnalyticsResult,
  PortfolioFlowEvent,
  PortfolioTimeframe,
} from "./portfolioAnalytics.js";

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

interface Channel {
  last: unknown;
  waiters: { resolve: (v: unknown) => void }[];
  getNative: () => unknown;
  map: (native: unknown) => unknown;
}

const UNSET = Symbol("unset");

/** ccxt-style timeframe aliases → the price feed's candle resolutions. */
const PRICE_TIMEFRAMES: Record<string, PriceCandleResolution> = { "1m": "M1", "1h": "H1", "1d": "D1" };
const VALID_RESOLUTIONS = new Set<PriceCandleResolution>(["M1", "H1", "D1"]);

// fetchMyTrades pages the fill tape until it has enough RESOLVABLE rows. The
// page size is a floor, not the caller's limit: rows whose pool is not in the
// registry are dropped after the query returns, so asking for exactly `limit`
// would under-deliver. The budget bounds the pathological case — a wallet whose
// fills are all unresolvable — so the loop cannot spin on a registry gap.
const TRADE_PAGE = 200;
const MAX_TRADE_PAGES = 20;

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
export class SomniaMarkets {
  /** The native engine — bigint-exact, address-keyed. The escape hatch. */
  readonly client: SomniaMarketsClient;
  /** Unified markets keyed by MARKET symbol (populated by loadMarkets). */
  markets: Record<string, UnifiedMarket> = {};
  /** All market symbols (populated by loadMarkets). */
  symbols: string[] = [];
  /**
   *  Capability map — which unified verbs this venue supports (the ccxt
   *  `exchange.has` convention, for capability-probing bot code). Every listed
   *  verb is implemented here, so every flag is `true`.
   */
  readonly has = {
    /** {@link SomniaMarkets.fetchMarkets} */
    fetchMarkets: true,
    /** {@link SomniaMarkets.fetchOrderBook} */
    fetchOrderBook: true,
    /** {@link SomniaMarkets.fetchTrades} */
    fetchTrades: true,
    /** {@link SomniaMarkets.fetchOHLCV} */
    fetchOHLCV: true,
    /** {@link SomniaMarkets.fetchBalance} */
    fetchBalance: true,
    /** {@link SomniaMarkets.fetchOpenOrders} */
    fetchOpenOrders: true,
    /** {@link SomniaMarkets.fetchMyTrades} */
    fetchMyTrades: true,
    /** {@link SomniaMarkets.fetchStatus} */
    fetchStatus: true,
    /** {@link SomniaMarkets.createOrder} */
    createOrder: true,
    /** {@link SomniaMarkets.cancelOrder} */
    cancelOrder: true,
    /** {@link SomniaMarkets.watchOrderBook} */
    watchOrderBook: true,
    /** {@link SomniaMarkets.watchTrades} */
    watchTrades: true,
    /** {@link SomniaMarkets.watchOrders} */
    watchOrders: true,
    /** {@link SomniaMarkets.watchMyTrades} */
    watchMyTrades: true,
    /** {@link SomniaMarkets.fetchPositions} */
    fetchPositions: true,
    /** {@link SomniaMarkets.fetchFundingRate} */
    fetchFundingRate: true,
    /**
     *  {@link SomniaMarkets.fetchFundingRateHistory} — the key did not previously exist
     *  in this map, so it had to be ADDED rather than flipped.
     */
    fetchFundingRateHistory: true,
    /** {@link SomniaMarkets.watchPrice} */
    watchPrice: true,
    /** {@link SomniaMarkets.fetchPrice} */
    fetchPrice: true,
    /** {@link SomniaMarkets.fetchPriceOHLCV} */
    fetchPriceOHLCV: true,
  } as const;

  private readonly registry = new Symbols.SymbolRegistry();
  // Not readonly: setSigner() rebinds this after construction (wallet connect /
  // disconnect), which also drops the memoized trader.
  private signerConfig: Pick<TraderConfig, "privateKey" | "account" | "walletClient">;
  private traderInstance: Trader | null = null;
  /** token address (lowercased) -> { code, decimals } for symbols + balances. */
  private currencies = new Map<Address, { code: string; decimals: number }>();
  /**
   *  binary pool (lowercased) -> the tick/lot/minQuantity grid the pool
   *  enforces. Binary rows come off the indexer with these fields undefined
   *  (the indexer never sees them), so loadMarkets() reads them from the pool;
   *  the precision helpers are synchronous and read only from here.
   */
  private bookParams = new Map<Address, BinaryBookParams>();
  private watches = new AsyncCache<string, WatchHandle>();
  private priceWatches = new AsyncCache<string, PriceWatchHandle>();
  private channels = new Map<string, Channel>();
  private unsubscribe: (() => void) | null = null;
  private unsubscribePrices: (() => void) | null = null;

  constructor(config: SomniaMarketsConfig) {
    const { privateKey, account, walletClient, ...clientConfig } = config;
    this.client = CreateClient.createClient(clientConfig as ClientConfig);
    this.signerConfig = { privateKey, account, walletClient };
  }

  // ------------------------------------------------------------- signer bits

  /**
   *  The raw write tier bound to this exchange's signer — bigint-exact
   *  `placeOrder`/`mintSet`/`faucet`/… for anything the unified verbs don't
   *  cover.
   *
   *  **Gotchas**
   *
   *  Built lazily; throws if no signer was configured.
   */
  get trader(): Trader {
    this.traderInstance ??= this.client.createTrader(this.signerConfig);
    return this.traderInstance;
  }

  /**
   *  Bind (or replace) the exchange's signer after construction. Browser apps
   *  construct the exchange at boot for public reads, then call this when the
   *  user's wallet connects — and again with `{}` on disconnect, which returns
   *  the exchange to unauthenticated reads. Replaces the trader every
   *  authenticated verb and `walletAddress` resolve against; live watches and
   *  market data are unaffected.
   */
  setSigner(
    signer: Pick<TraderConfig, "privateKey" | "account" | "walletClient">,
  ): void {
    this.signerConfig = {
      account: signer.account,
      privateKey: signer.privateKey,
      walletClient: signer.walletClient,
    };
    this.traderInstance = null;
  }

  /** The authenticated wallet address, if a signer was configured. */
  get walletAddress(): Address | undefined {
    const { privateKey, account, walletClient } = this.signerConfig;
    if (walletClient?.account) return walletClient.account.address;
    if (typeof account === "object") return account.address;
    if (typeof account === "string") return account;
    if (privateKey) return privateKeyToAccount(privateKey).address;
    return undefined;
  }

  /**
   *  The wallet address, or {@link SignerRequiredError} naming the caller.
   *
   *  @param operation - The public method requiring the signer; it appears in the
   *  error so the caller sees which call needs a signer, not just "a method".
   */
  private requireAddress(operation: string): Address {
    const a = this.walletAddress;
    if (!a) throw new SignerRequiredError(operation);
    return a;
  }

  // ------------------------------------------------------------- markets

  /**
   *  Load (or reload) the market registry: every market as a unified,
   *  symbol-keyed market object. Call once before anything symbol-based.
   */
  async loadMarkets(reload = false): Promise<Record<string, UnifiedMarket>> {
    if (!reload && this.symbols.length > 0) return this.markets;

    // Full live-registry sweep: every spot/perp market plus the binary
    // series still live. A single newest-first page would crowd the older
    // spot/perp pools out behind thousands of series markets.
    const rows = await this.client.listRegistryMarkets();

    // Currency codes: prefer indexed symbols; read ERC-20 symbol() for the
    // rest (binary collateral, unlabeled spot tokens) — pipelined, cached.
    const need = new Set<Address>();
    for (const m of rows) {
      if (m.marketType === "BINARY") need.add(Markets.lower0x(m.collateral));
      else {
        if (!m.baseSymbol && !m.baseIsNative) need.add(Markets.lower0x(m.baseToken));
        if (!m.quoteSymbol) need.add(Markets.lower0x(m.quoteToken));
      }
    }
    for (const t of this.currencies.keys()) need.delete(t);
    await Promise.all(
      [...need].map(async (token) => {
        // Read BOTH symbol and decimals on-chain. A currency seen only via this
        // path (never as a market's base/quote row) keeps whatever we set here,
        // so hardcoding 6 gave wrong human balances for any non-6dp token. Fall
        // back to the ERC-20 spec default (18) only if decimals() reverts.
        // Plain ERC-20 metadata on tokens the protocol does not own, and both
        // reads swallow their error — so the viem client is the honest door here
        // (same socket; nothing branches on a decoded revert).
        const viem = this.client.getViemClient();
        const [code, decimals] = await Promise.all([
          viem
            .readContract({ address: token, abi: ReadsAbi.erc20ReadAbi, functionName: "symbol" })
            .then((s) => String(s))
            .catch(() => token.slice(2, 8).toUpperCase()),
          viem
            .readContract({ address: token, abi: ReadsAbi.erc20ReadAbi, functionName: "decimals" })
            .then((d) => Number(d))
            .catch(() => 18),
        ]);
        this.currencies.set(token, { code, decimals });
      }),
    );
    const codeOf = (token: Address) => this.currencies.get(Markets.lower0x(token))?.code ?? token.slice(2, 8).toUpperCase();

    // Binary book grids: the indexer stores tick/lot/minQuantity as undefined
    // for binary rows, so read each distinct pool's real parameters here —
    // pipelined, and cached again in the client for its own quote path. A pool
    // that fails to answer is simply absent from the map; the precision helpers
    // throw on it rather than quantize against a guess.
    const pools = new Set<Address>();
    for (const m of rows) if (m.marketType === "BINARY") pools.add(Markets.lower0x(m.poolAddress));
    if (reload) this.bookParams.clear();
    for (const p of this.bookParams.keys()) pools.delete(p);
    await Promise.all(
      [...pools].map(async (pool) => {
        const params = await this.client.getBinaryBookParams(pool).catch(() => null);
        if (params) this.bookParams.set(pool, params);
      }),
    );

    const canonical = this.registry.build(rows, codeOf);
    this.markets = {};
    for (const m of rows) {
      const symbol = canonical.get(m.id) ?? unreachable(`registry.build omitted market ${m.id}`);
      this.markets[symbol] = this.toUnifiedMarket(m, symbol, codeOf);
      // Register currency decimals per market for balances.
      if (m.marketType === "BINARY") {
        this.currencies.set(Markets.lower0x(m.collateral), { code: codeOf(m.collateral), decimals: m.quoteDecimals });
      } else {
        if (!m.baseIsNative) this.currencies.set(Markets.lower0x(m.baseToken), { code: m.baseSymbol ?? codeOf(m.baseToken), decimals: m.baseDecimals });
        this.currencies.set(Markets.lower0x(m.quoteToken), { code: m.quoteSymbol ?? codeOf(m.quoteToken), decimals: m.quoteDecimals });
      }
    }
    this.symbols = Object.keys(this.markets).sort();
    return this.markets;
  }

  private toUnifiedMarket(m: Market, symbol: string, codeOf: (t: Address) => string): UnifiedMarket {
    if (m.marketType === "SPOT") {
      const s = m;
      return {
        id: m.id,
        symbol,
        type: "spot",
        base: s.baseSymbol ?? codeOf(s.baseToken),
        quote: s.quoteSymbol ?? codeOf(s.quoteToken),
        active: true,
        contract: false,
        precision: {
          price: Structs.precisionFromStep(s.tickSize, s.quoteDecimals),
          amount: Structs.precisionFromStep(s.lotSize, s.baseDecimals),
        },
        limits: { amount: { min: s.minQuantity ? Structs.toHumanNum(s.minQuantity, s.baseDecimals) : undefined } },
        info: m,
      };
    }
    if (m.marketType === "PERP") {
      const p = m;
      const quote = p.quoteSymbol ?? codeOf(p.quoteToken);
      return {
        id: m.id,
        symbol,
        type: "swap",
        base: p.baseSymbol ?? codeOf(p.baseToken),
        quote,
        // A linear perp settles in its quote (collateral) currency.
        settle: quote,
        active: true,
        contract: true,
        precision: {
          price: Structs.precisionFromStep(p.tickSize, p.quoteDecimals),
          amount: Structs.precisionFromStep(p.lotSize, p.baseDecimals),
        },
        limits: { amount: { min: p.minQuantity ? Structs.toHumanNum(p.minQuantity, p.baseDecimals) : undefined } },
        info: m,
      };
    }
    const b = m;
    // Active = inside the trading window and not settled. Derived from
    // timestamps, not the indexed status: markets flip Listed → Trading
    // implicitly on-chain (no event), so the indexed status lags reality.
    const now = Math.floor(Date.now() / 1000);
    const inWindow = Number(b.tradingStart) <= now && now < Number(b.expiry);
    // Grid from the pool itself (hydrated in loadMarkets), not the row: the
    // indexer leaves binary tick/lot/minQuantity undefined. Absent params (pool
    // read failed) leave full decimal precision and no minimum — the helpers
    // throw on such a market rather than quantize against a guess.
    const bp = this.bookParams.get(Markets.lower0x(b.poolAddress));
    return {
      id: m.id,
      symbol,
      type: "binary",
      base: symbol.split("/")[0] ?? symbol,
      quote: codeOf(b.collateral),
      settle: codeOf(b.collateral),
      active: inWindow && b.status !== "Resolved" && b.status !== "Voided",
      contract: false,
      precision: {
        price: bp ? Structs.precisionFromStep(bp.tickSize.toString(), b.quoteDecimals) : b.quoteDecimals,
        amount: bp ? Structs.precisionFromStep(bp.lotSize.toString(), b.baseDecimals) : b.baseDecimals,
      },
      limits: { amount: { min: bp ? Structs.toHumanNum(bp.minQuantity, b.baseDecimals) : undefined } },
      outcomes: Symbols.outcomesOf(m).map((o) => ({ symbol: Symbols.tradableSymbol(symbol, o.label), label: o.label, index: o.index })),
      info: m,
    };
  }

  /**
   *  Resolve any handle (symbol, tradable symbol, pool/market address, market
   *  id) to its tradable. Requires loadMarkets().
   */
  market(ref: string): Tradable {
    return this.registry.resolve(ref);
  }

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
  priceToPrecision(ref: string, price: number): number {
    const t = this.market(ref);
    const decimals = this.decimalsOf(t).price;
    const tickRaw = this.tickOf(t, "priceToPrecision");
    // Binary prices are probabilities — they may not rest at 0 or 1.
    return Structs.snapToGrid(price, tickRaw, decimals, {
      clamp: t.market.marketType === "BINARY",
    });
  }

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
  amountToPrecision(ref: string, amount: number): number {
    const t = this.market(ref);
    // strict: an amount is usually bounded by a balance, and a lot-aligned value
    // one wei over it reverts. A price has no such ceiling, so it keeps the nudge.
    return Structs.snapToGrid(amount, this.lotOf(t, "amountToPrecision"), this.decimalsOf(t).amount, {
      strict: true,
    });
  }

  /**
   *  Every market as an array — {@link loadMarkets} (called if needed), minus
   *  the symbol keying.
   *
   *  **When to use**
   *
   *  Use as the ccxt-shaped sibling for list-style consumers.
   */
  async fetchMarkets(): Promise<UnifiedMarket[]> {
    await this.loadMarkets();
    return Object.values(this.markets);
  }

  // ------------------------------------------------------------- helpers

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
  private tickOf(t: Tradable, operation: string): bigint {
    if (t.market.marketType === "BINARY") {
      return this.requireBookParams(t, operation).tickSize;
    }
    const decimals = this.decimalsOf(t).price;
    return t.market.tickSize ? BigInt(t.market.tickSize) : 10n ** BigInt(decimals - 3);
  }

  /** The market's amount grid in RAW base units. See {@link tickOf}. */
  private lotOf(t: Tradable, operation: string): bigint {
    if (t.market.marketType === "BINARY") {
      return this.requireBookParams(t, operation).lotSize;
    }
    const decimals = this.decimalsOf(t).amount;
    return t.market.lotSize ? BigInt(t.market.lotSize) : 10n ** BigInt(decimals);
  }

  private decimalsOf(t: Tradable): { price: number; amount: number } {
    return { price: t.market.quoteDecimals, amount: t.market.baseDecimals };
  }

  /**
   *  The binary pool's enforced grid, or a throw. Only loadMarkets() populates
   *  the map, so an absent entry means that pool's read failed during the last
   *  load — not that the caller passed a bad ref.
   */
  private requireBookParams(t: Tradable, operation: string): BinaryBookParams {
    const bp = this.bookParams.get(Markets.lower0x(t.pool));
    if (!bp) {
      throw new InvalidInputError(
        `${operation}: no book parameters for binary market ${t.symbol} (pool ${t.pool}). ` +
          `The pool's getOrderBookParameters read failed during loadMarkets(); retry with loadMarkets(true).`,
      );
    }
    return bp;
  }

  /** Native book → this tradable's [price, amount][] view, human units. */
  private bookView(t: Tradable, native: BinaryOrderBook | { bids: BookLevel[]; asks: BookLevel[] }): { bids: [number, number][]; asks: [number, number][] } {
    const d = this.decimalsOf(t);
    const lvl = (l: BookLevel): [number, number] => [Structs.toHumanNum(l.price, d.price), Structs.toHumanNum(l.quantity, d.amount)];
    if (t.market.marketType === "BINARY") {
      const b = native as BinaryOrderBook;
      return t.outcomeIndex === 1
        ? { bids: b.noBids.map(lvl), asks: b.noAsks.map(lvl) }
        : { bids: b.yesBids.map(lvl), asks: b.yesAsks.map(lvl) };
    }
    const s = native as { bids: BookLevel[]; asks: BookLevel[] };
    return { bids: s.bids.map(lvl), asks: s.asks.map(lvl) };
  }

  /** Taker direction on this tradable's book from a binary side. */
  private sideView(t: Tradable, side: BinarySide): "buy" | "sell";
  private sideView(t: Tradable, side: BinarySide | undefined): "buy" | "sell" | undefined;
  private sideView(t: Tradable, side: BinarySide | undefined): "buy" | "sell" | undefined {
    if (!side) return undefined;
    const yesBuy = side === "BUY_YES" || side === "SELL_NO";
    if (t.market.marketType === "BINARY" && t.outcomeIndex === 1) return yesBuy ? "sell" : "buy";
    return yesBuy ? "buy" : "sell";
  }

  /** YES-terms raw price for this tradable's human price (NO inverts). */
  private toNativePrice(t: Tradable, price: number): bigint {
    const d = this.decimalsOf(t);
    const raw = Structs.toRaw(price, d.price);
    // The NO complement `one - raw` preserves grid alignment because every venue's
    // tick divides one whole unit (they are all `10 ** (decimals - 3)`), so if
    // `raw` is a tick multiple the complement is too. A tick that did NOT divide
    // one unit would make the complement off-grid even from an aligned price —
    // there is no such venue, and `snapToGrid` would reject that grid for a
    // clamped binary price anyway.
    if (t.market.marketType === "BINARY" && t.outcomeIndex === 1) return 10n ** BigInt(d.price) - raw;
    return raw;
  }

  private priceView(t: Tradable, rawYesTerms: string | bigint, d: number): number {
    const p = Structs.toHumanNum(rawYesTerms, d);
    return t.market.marketType === "BINARY" && t.outcomeIndex === 1 ? 1 - p : p;
  }

  /**
   *  An OHLC row through this tradable's lens. NO-outcome tradables mirror the
   *  price axis (p → 1−p), which also SWAPS high and low — the trap every
   *  candle-shaped read must avoid. RULE for new verbs: never invert prices,
   *  sides, or OHLC inline — go through {@link priceView} / {@link sideView} /
   *  this, so a verb cannot forget the lens. (The 1−p mirror is inherently
   *  BINARY: a categorical N-outcome book has no such pairwise mirror, so
   *  outcome views there will need a real per-outcome book, not a wider lens.)
   */
  private ohlcView(
    t: Tradable,
    raw: { open: string | bigint; high: string | bigint; low: string | bigint; close: string | bigint },
    d: number,
  ): { open: number; high: number; low: number; close: number } {
    const open = this.priceView(t, raw.open, d);
    const close = this.priceView(t, raw.close, d);
    const a = this.priceView(t, raw.high, d);
    const b = this.priceView(t, raw.low, d);
    return { open, close, high: Math.max(a, b), low: Math.min(a, b) };
  }

  // ------------------------------------------------------------- fetch*

  /**
   *  One-shot book read from the contract (head-fresh; no watch needed).
   *
   *  **When to use**
   *
   *  Use when one book snapshot is enough. For a continuously-current
   *  zero-round-trip book, use {@link watchOrderBook}.
   */
  async fetchOrderBook(ref: string, limit = 10): Promise<UnifiedOrderBook> {
    const t = this.market(ref);
    const native =
      t.market.marketType === "BINARY"
        ? await this.client.getBinaryOrderBook(t.pool, { depth: limit, decimals: t.market.quoteDecimals })
        : await this.client.getSpotOrderBook(t.pool, { depth: limit });
    return { symbol: t.symbol, ...this.bookView(t, native), timestamp: Date.now(), info: native };
  }

  /** Recent public trades (indexer, newest first). */
  async fetchTrades(ref: string, since?: number, limit = 50): Promise<UnifiedTrade[]> {
    const t = this.market(ref);
    const d = this.decimalsOf(t);
    const rows = await this.client.getFills(t.pool, { limit });
    return rows
      .map((f): UnifiedTrade => {
        const price = this.priceView(t, f.fillPrice, d.price);
        const amount = Structs.toHumanNum(f.quantity, d.amount);
        const tsMs = Number(f.timestamp) * 1000;
        const takerBuysBase = f.takerIsBid ?? undefined;
        let side: "buy" | "sell" | undefined =
          takerBuysBase === undefined ? undefined : takerBuysBase ? "buy" : "sell";
        if (t.market.marketType === "BINARY" && t.outcomeIndex === 1 && side) side = side === "buy" ? "sell" : "buy";
        return { id: f.id, symbol: t.symbol, price, amount, cost: price * amount, side, txHash: f.txHash, timestamp: tsMs, datetime: Structs.toDatetime(tsMs), info: f };
      })
      .filter((tr) => since === undefined || tr.timestamp >= since);
  }

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
  async fetchOHLCV(ref: string, timeframe = "5m", since?: number, limit = 500): Promise<UnifiedOHLCV[]> {
    const t = this.market(ref);
    const interval = Structs.TIMEFRAMES[timeframe];
    if (!interval) throw new InvalidInputError(`unknown timeframe ${timeframe} (have: ${Object.keys(Structs.TIMEFRAMES).join(" ")})`);
    const d = this.decimalsOf(t);
    const rows = await this.client.getCandles(t.pool, interval, { limit });
    return rows
      .map((c): UnifiedOHLCV => {
        const v = this.ohlcView(t, { open: c.openPrice, high: c.high, low: c.low, close: c.closePrice }, d.price);
        const ts = Number(c.bucketStart) * 1000;
        return [ts, v.open, v.high, v.low, v.close, Structs.toHumanNum(c.baseVolume, d.amount)];
      })
      .filter((row) => since === undefined || row[0] >= since);
  }

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
  async fetchTicker(ref: string): Promise<UnifiedTicker> {
    const t = this.market(ref);
    const d = this.decimalsOf(t);
    const nowSec = Math.floor(Date.now() / 1000);
    const rows = await this.client.getCandles(t.pool, 3600, {
      from: nowSec - 86_400,
      limit: 25,
    });
    const stats = DerivedReads.marketStats24hFromCandles(rows, nowSec);
    const windowed =
      stats.openPrice24h !== null && stats.high24h !== null && stats.low24h !== null
        ? this.ohlcView(
            t,
            // `close` is a placeholder for the shared view; `last` below is
            // derived from the freshest fill instead.
            { open: stats.openPrice24h, high: stats.high24h, low: stats.low24h, close: stats.openPrice24h },
            d.price,
          )
        : undefined;

    const open = windowed?.open;
    const high = windowed?.high;
    const low = windowed?.low;
    // The freshest fill: the last in-window candle's close, else the market
    // row's lifetime last price (may predate the window on quiet books).
    const lastCandle = rows[rows.length - 1];
    const lastRaw = lastCandle ? lastCandle.closePrice : t.market.lastPrice;
    const last = lastRaw != null ? this.priceView(t, lastRaw, d.price) : undefined;
    const change = last !== undefined && open !== undefined ? last - open : undefined;
    const percentage = change !== undefined && open ? change / open : undefined;

    // A perp header needs mark / index / open interest / funding beside the 24h figures,
    // and none of those are derivable from candles — they are chain state. Folding them
    // in here means one call answers the whole header instead of the consumer knowing to
    // pair fetchTicker with a second read.
    //
    // Degrades to the 24h half rather than failing whole. `getPerpState` reads
    // `getIndexPrice()`, which is a BARE `IOracle.getPrice()` on the pool — the one
    // index-price path the contract does not wrap in try/catch — so a dead or rotated
    // oracle propagates its revert here. That is precisely when an operator is staring
    // at the ticker, and before this read existed the perp header cost no RPC at all
    // and could not fail. Losing the candle-derived stats to an oracle outage would be
    // a regression introduced by enriching the response.
    const perp = Markets.isPerpMarket(t.market)
      ? await this.client.getPerpState(t.pool).catch(() => undefined)
      : undefined;

    const now = Date.now();
    return {
      symbol: t.symbol,
      timestamp: now,
      datetime: Structs.toDatetime(now),
      ...(open !== undefined ? { open } : {}),
      ...(high !== undefined ? { high } : {}),
      ...(low !== undefined ? { low } : {}),
      ...(last !== undefined ? { last } : {}),
      ...(change !== undefined ? { change } : {}),
      ...(percentage !== undefined ? { percentage } : {}),
      baseVolume: Structs.toHumanNum(stats.baseVolume24h, d.amount),
      quoteVolume: Structs.toHumanNum(stats.volume24h, d.price),
      ...(perp
        ? {
            // Both conditions, matching perpMarkForPnl. `_tryMarkPrice` currently
            // returns (false, 0) on a zero price, so `ok` already implies non-zero —
            // but that is the CONTRACT's invariant, not this client's, and the cost of
            // enforcing it locally is one comparison. A zero mark reaching the wire is
            // the failure DEX-1855 fixed: downstream, an unguarded
            // `markPrice - entryPrice` reads as a 100% loss on every open position.
            ...(perp.markPriceOk && perp.markPrice > 0n
              ? { markPrice: Structs.toHumanNum(perp.markPrice, d.price) }
              : {}),
            indexPrice: Structs.toHumanNum(perp.indexPrice, d.price),
            // The SAME per-8h axis as fetchFundingRate and fetchFundingRateHistory. A
            // header on one basis beside a chart on another is a wrong number that
            // looks right.
            fundingRate: Number(fundingRate8h(perp.fundingRate, perp.fundingWindowSec)) / 1e18,
            fundingTimestamp: Number(perp.nextFundingAt) * 1000,
            openInterest: Structs.toHumanNum(perp.openInterest, d.amount),
          }
        : {}),
      info: perp ? { ...stats, perp } : stats,
    };
  }

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
  async fetchBalance(): Promise<UnifiedBalances> {
    const addr = this.requireAddress("fetchBalance");
    await this.loadMarkets();
    const out: UnifiedBalances = {};
    const reads = [...this.currencies.entries()].map(async ([token, { code, decimals }]) => {
      const raw = await this.client.getErc20Balance(token, addr).catch(() => 0n);
      const total = Structs.toHumanNum(raw, decimals);
      out[code] = { free: total, used: 0, total };
    });
    // Keyed and scaled by the configured chain's own nativeCurrency (SOMI on
    // mainnet, STT elsewhere) — the chain definition is the source of truth.
    const nativeCurrency = this.client.config.chain.nativeCurrency;
    const native = this.client
      .getNativeBalance(addr)
      .then((raw) => {
        const total = Structs.toHumanNum(raw, nativeCurrency.decimals);
        out[nativeCurrency.symbol] = { free: total, used: 0, total };
      })
      .catch(() => undefined);
    // Binary YES/NO outcome-token holdings — ERC-6909 positions the indexer
    // tracks, keyed under their TRADABLE symbol (BTC-…#YES). Degrades to nothing
    // if the indexer read fails, so a spot/perp balance is never blocked by it.
    const binary = this.client
      .getPortfolio(addr)
      .then((p) => {
        for (const pos of p.positions) {
          // Only the outcome (not direction) matters for the tradable lookup.
          const side: BinarySide = pos.outcomeIndex === 1 ? "BUY_NO" : "BUY_YES";
          const t = this.tryResolvePool(pos.market.poolAddress, side);
          if (!t) continue;
          const total = Structs.toHumanNum(pos.balance, pos.market.quoteDecimals);
          out[t.symbol] = { free: total, used: 0, total };
        }
      })
      .catch(() => undefined);
    await Promise.all([...reads, native, binary]);
    return out;
  }

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
  async fetchOpenOrders(ref?: string, limit?: number): Promise<UnifiedOrder[]> {
    const addr = this.requireAddress("fetchOpenOrders");
    const t = ref ? this.market(ref) : undefined;
    const opts = limit === undefined ? {} : { ordersLimit: limit };
    const out: UnifiedOrder[] = [];
    if (!t || t.market.marketType === "BINARY") {
      const p = await this.client.getPortfolio(addr, opts);
      for (const o of p.openOrders) out.push(...this.mapPortfolioOrder(o, t));
    }
    if (!t || t.market.marketType === "SPOT") {
      const p = await this.client.getSpotPortfolio(addr, opts);
      for (const o of p.openOrders) out.push(...this.mapSpotPortfolioOrder(o, t));
    }
    if (!t || t.market.marketType === "PERP") {
      const p = await this.client.getPerpPortfolio(addr, opts);
      for (const o of p.openOrders) out.push(...this.mapSpotPortfolioOrder(o, t));
    }
    return out;
  }

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
  async fetchOrders(
    ref?: string,
    since?: number,
    limit = 100,
    params: { offset?: number } = {},
  ): Promise<UnifiedOrder[]> {
    const addr = this.requireAddress("fetchOrders");
    const t = ref ? this.market(ref) : undefined;
    const rows = await this.client.getOrders(addr, {
      limit,
      offset: params.offset ?? 0,
      ...(t ? { pool: t.pool } : {}),
    });

    const out: UnifiedOrder[] = [];
    for (const o of rows) {
      const rt = this.tryResolvePool(o.pool, o.side ?? undefined);
      if (!rt) continue;
      if (t?.outcome && rt.outcome !== t.outcome) continue;
      const d = this.decimalsOf(rt);
      const tsMs = Number(o.placedAtTimestamp) * 1000;
      if (since !== undefined && tsMs < since) continue;
      out.push({
        id: o.orderId,
        symbol: rt.symbol,
        type: "limit",
        side:
          rt.market.marketType === "BINARY"
            ? // A null side (an unbridged row) still knows its YES-book
              // direction — derive the BinarySide from isBid and go through
              // the lens, so NO-outcome tradables don't show it inverted.
              this.sideView(rt, o.side ?? (o.isBid ? "BUY_YES" : "SELL_YES"))
            : o.isBid
              ? "buy"
              : "sell",
        price: this.priceView(rt, o.price, d.price),
        amount: Structs.toHumanNum(o.fullQuantity, d.amount),
        filled: Structs.toHumanNum(o.filledQuantity, d.amount),
        remaining: Structs.toHumanNum(o.quantityRemaining, d.amount),
        status: Structs.toUnifiedStatus(o.status),
        txHash: o.placedTxHash,
        timestamp: tsMs,
        datetime: Structs.toDatetime(tsMs),
        info: o,
      });
    }
    return out;
  }

  private mapPortfolioOrder(o: PortfolioOrder, scope?: Tradable): UnifiedOrder[] {
    if (scope && o.market.poolAddress.toLowerCase() !== scope.pool.toLowerCase()) return [];
    const t = this.tryResolvePool(o.market.poolAddress, o.side ?? undefined);
    if (!t) return [];
    if (scope?.outcome && t.outcome !== scope.outcome) return [];
    const d = this.decimalsOf(t);
    const tsMs = Number(o.placedAtTimestamp) * 1000;
    return [
      {
        id: o.orderId,
        symbol: t.symbol,
        type: "limit",
        side: this.sideView(t, o.side ?? undefined) ?? "buy",
        price: this.priceView(t, o.price, d.price),
        amount: Structs.toHumanNum(o.fullQuantity, d.amount),
        filled: Structs.toHumanNum(o.filledQuantity, d.amount),
        remaining: Structs.toHumanNum(o.quantityRemaining, d.amount),
        status: "open",
        txHash: o.placedTxHash,
        timestamp: tsMs,
        datetime: Structs.toDatetime(tsMs),
        info: o,
      },
    ];
  }

  // Shared by SPOT and PERP: both are plain isBid base/quote orders and the
  // mapper only touches the fields the two portfolio rows have in common.
  private mapSpotPortfolioOrder(o: SpotPortfolioOrder | PerpPortfolioOrder, scope?: Tradable): UnifiedOrder[] {
    if (scope && o.market.poolAddress.toLowerCase() !== scope.pool.toLowerCase()) return [];
    const t = this.tryResolvePool(o.market.poolAddress);
    if (!t) return [];
    const d = this.decimalsOf(t);
    const tsMs = Number(o.placedAtTimestamp) * 1000;
    return [
      {
        id: o.orderId,
        symbol: t.symbol,
        type: "limit",
        side: o.isBid ? "buy" : "sell",
        price: Structs.toHumanNum(o.price, d.price),
        amount: Structs.toHumanNum(o.fullQuantity, d.amount),
        filled: Structs.toHumanNum(o.filledQuantity, d.amount),
        remaining: Structs.toHumanNum(o.quantityRemaining, d.amount),
        status: "open",
        txHash: o.placedTxHash,
        timestamp: tsMs,
        datetime: Structs.toDatetime(tsMs),
        info: o,
      },
    ];
  }

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
  async fetchPortfolioAnalytics(
    timeframe: PortfolioTimeframe,
    params: { sessionSince?: number; cexRateBps?: number } = {},
  ): Promise<PortfolioAnalytics.PortfolioAnalytics> {
    const addr = this.requireAddress("fetchOrders");
    const addrLc = addr.toLowerCase();
    const asOf = Date.now();

    // Page the wallet's fills to exhaustion (newest-first pages). A single
    // capped page would drop the OLDEST fills — the buys that establish the
    // carried-in cost basis — so sells would realize against a phantom zero
    // basis, a subtler corruption than missing volume.
    const PAGE = 1000;
    const fills: FillRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.client.getUserFills(addr, { limit: PAGE, offset });
      fills.push(...page);
      if (page.length < PAGE) break;
    }

    // Map indexer fills → flow events, spot markets only, account
    // perspective (taker side, or its inverse when the wallet made).
    const events: PortfolioFlowEvent[] = [];
    const touched = new Map<string, Tradable>();
    for (const f of fills) {
      const t = this.tryResolvePool(f.pool);
      if (!t || t.market.marketType !== "SPOT") continue;
      // A null takerIsBid (a row predating the taker bridge, or an unjoined
      // taker order) has no knowable direction — skip the fill rather than
      // fabricate a side and silently corrupt the avg-cost book.
      if (f.takerIsBid == null) continue;
      const takerIsBid = f.takerIsBid;
      // Pin the wallet's role explicitly: a fill whose taker is still
      // unjoined might be OURS as taker — defaulting to "maker" there would
      // invert the side. Only classify when one of the roles matches.
      const isTaker = (f.taker ?? "").toLowerCase() === addrLc;
      const isMaker = (f.maker ?? "").toLowerCase() === addrLc;
      if (!isTaker && !isMaker) continue;
      const d = this.decimalsOf(t);
      touched.set(t.symbol, t);
      events.push({
        kind: "trade",
        timestamp: Number(f.timestamp) * 1000,
        market: t.symbol,
        side: (isTaker ? takerIsBid : !takerIsBid) ? "buy" : "sell",
        baseAmount: Structs.toHumanNum(f.quantity, d.amount),
        quoteAmount: Structs.toHumanNum(f.quoteQuantity, d.price),
      });
    }

    // Marks: candle closes per touched market at the timeframe's bucket,
    // reaching back to the window start (or the first fill for "all").
    const bucketSec =
      timeframe === "24h" ? 3600 : timeframe === "7d" ? 14_400 : 86_400;
    const firstEventMs = events.length > 0 ? Math.min(...events.map((e) => e.timestamp)) : asOf;
    const windowStartMs =
      timeframe === "all"
        ? firstEventMs
        : asOf - { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 }[timeframe];

    const series = new Map<string, MarkSeries>();
    const lastPrice = new Map<string, number>();
    await Promise.all(
      [...touched.values()].map(async (t) => {
        const d = this.decimalsOf(t);
        const rows = await this.client.getCandles(t.pool, bucketSec, {
          from: Math.floor(windowStartMs / 1000) - bucketSec,
          limit: 1000,
        });
        series.set(
          t.symbol,
          rows.map((c) => [Number(c.bucketStart) * 1000, this.priceView(t, c.closePrice, d.price)] as const),
        );
        if (t.market.lastPrice != null) {
          lastPrice.set(t.symbol, this.priceView(t, t.market.lastPrice, d.price));
        }
      }),
    );

    return PortfolioAnalytics.computePortfolioAnalytics(events, {
      timeframe,
      asOf,
      marks: { series, lastPrice },
      ...(params.sessionSince !== undefined ? { sessionSince: params.sessionSince } : {}),
      cexRateBps: params.cexRateBps ?? PortfolioAnalytics.DEFAULT_CEX_RATE_BPS,
    });
  }

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
  async fetchMyTrades(ref?: string, since?: number, limit = 50): Promise<UnifiedTrade[]> {
    const addr = this.requireAddress("fetchMyTrades");
    await this.loadMarkets();
    const t = ref ? this.market(ref) : undefined;

    // The tape is keyed by POOL; a binary tradable's YES and NO legs share one.
    // Scoping by pool therefore returns both legs, and the per-row side view
    // below puts each on its own tradable.
    const pool = t?.pool;
    // `since` is milliseconds on this surface (UnifiedTrade.timestamp is ms, and
    // callers pass Date.now()); the fill query filters on unix SECONDS. Passing
    // ms straight through would select nothing at all — a silent empty result.
    const sinceSec = since === undefined ? undefined : Math.floor(since / 1000);

    const out: UnifiedTrade[] = [];
    const page = Math.max(limit, TRADE_PAGE);
    // Bounded: every iteration either fills the quota or advances `offset` by a
    // full page, and a short page means the tape is exhausted. The budget caps
    // the pathological case where nothing resolves (e.g. an empty registry).
    for (let offset = 0, pages = 0; out.length < limit && pages < MAX_TRADE_PAGES; pages++) {
      const rows = await this.client.getUserFills(addr, {
        ...(pool ? { pool } : {}),
        ...(sinceSec !== undefined ? { since: sinceSec } : {}),
        limit: page,
        offset,
      });
      for (const row of rows) {
        if (out.length >= limit) break;
        const trade = this.fillToUnifiedTrade(row, t);
        if (trade) out.push(trade);
      }
      if (rows.length < page) break; // tape exhausted
      offset += rows.length;
    }
    return out;
  }

  /**
   *  One fill row through the asking tradable's lens, or null when the row's
   *  pool is not in the registry or falls outside `scope`.
   *
   *  Binary rows carry the account's YES/NO side, which selects the outcome
   *  tradable — and NO mirrors both price and side, so both go through
   *  {@link priceView} / {@link sideView} rather than being read raw.
   */
  private fillToUnifiedTrade(row: FillRow, scope?: Tradable): UnifiedTrade | null {
    const account = this.walletAddress?.toLowerCase();
    const asMaker = (row.maker ?? "").toLowerCase() === account;
    // The taker's ORDER is authoritative: `row.takerSide` is a denormalized copy
    // the binary taker-bridge backfills after BinaryOrderPlaced, so it can be
    // null on a row whose taker is already stamped. Reading it alone sends such
    // a fill to the default (YES) leg — a NO buy at 0.38 reported as YES at
    // 0.62, and invisible to a #NO-scoped call.
    const side = asMaker ? row.makerSide : (row.takerOrder?.side ?? row.takerSide);

    const rt = this.tryResolvePool(row.pool, side ?? undefined);
    if (!rt) return null;
    if (scope && rt.pool.toLowerCase() !== scope.pool.toLowerCase()) return null;
    if (scope?.outcome && rt.outcome !== scope.outcome) return null;

    const d = this.decimalsOf(rt);
    const binary = rt.market.marketType === "BINARY";
    const price = binary
      ? this.priceView(rt, row.fillPrice, d.price)
      : Structs.toHumanNum(row.fillPrice, d.price);
    const amount = Structs.toHumanNum(row.quantity, d.amount);
    // Binary has no quote-quantity of its own on the tape (the row is priced in
    // YES terms), so cost is derived; spot/perp carry the executed quote value.
    const cost = binary ? price * amount : Structs.toHumanNum(row.quoteQuantity, d.price);
    const tsMs = Number(row.timestamp) * 1000;

    return {
      id: row.id,
      symbol: rt.symbol,
      price,
      amount,
      cost,
      side: binary ? this.sideView(rt, side ?? undefined) : this.takerSideView(row, asMaker),
      txHash: row.txHash,
      timestamp: tsMs,
      datetime: Structs.toDatetime(tsMs),
      info: row,
    };
  }

  /** Spot/perp direction FROM THIS ACCOUNT's seat: the maker is the taker's mirror. */
  private takerSideView(row: FillRow, asMaker: boolean): "buy" | "sell" | undefined {
    if (row.takerIsBid == null) return undefined;
    const bought = asMaker ? !row.takerIsBid : row.takerIsBid;
    return bought ? "buy" : "sell";
  }

  /**
   * Exchange health.
   *
   * **Details**
   *
   * "ok" unless a live watch is missing its socket — "connecting" while the
   * first WS handshake is still in flight (~1s after a watch opens), "error"
   * once a previously-live socket is lost.
   */
  async fetchStatus(): Promise<{
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
  }> {
    const s = this.client.getLiveStatus();
    // headBlock only ever ratchets up, so 0 with a watch active can only mean
    // "handshake not done yet" — a lost socket leaves the last head behind.
    const status =
      s.watchCount > 0 && !s.wsConnected ? (s.headBlock > 0 ? "error" : "connecting") : "ok";
    return { status, updated: Date.now(), info: s };
  }

  private tryResolvePool(pool: string, side?: BinarySide): Tradable | null {
    try {
      const base = this.registry.resolve(pool);
      if (base.market.marketType !== "BINARY" || !side) return base;
      const outcome = side === "BUY_YES" || side === "SELL_YES" ? "YES" : "NO";
      return this.registry.resolve(`${base.marketSymbol}#${outcome}`);
    } catch {
      return null;
    }
  }

  private tryResolveByMarketAddress(marketAddress: string, side?: BinarySide, scope?: Tradable): Tradable | null {
    try {
      const base = this.registry.resolve(marketAddress);
      if (scope && base.pool.toLowerCase() !== scope.pool.toLowerCase()) return null;
      const rt = side ? this.tryResolvePool(base.pool, side) : base;
      if (!rt) return null;
      if (scope?.outcome && rt.outcome !== scope.outcome) return null;
      return rt;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------- watch*

  /** Hold the ref-counted market watch behind a symbol (idempotent). */
  private async ensureWatch(t: Tradable): Promise<void> {
    await this.watches.getOrCreate(t.marketSymbol, () => this.client.watchMarket(t.pool));
  }

  /**
   *  Streaming semantics: resolves with the channel's current value on first
   *  call, then each subsequent call resolves when the underlying (memoized)
   *  native ref CHANGES — reference equality is the change detector.
   */
  private nextTick<N, T>(key: string, getNative: () => N, map: (n: N) => T): Promise<T> {
    this.ensureListener();
    const existing = this.channels.get(key);
    const ch = existing ?? { last: UNSET, waiters: [], getNative, map: map as (n: unknown) => unknown };
    if (!existing) this.channels.set(key, ch);
    const current = getNative();
    if (ch.last === UNSET || !Object.is(current, ch.last)) {
      ch.last = current;
      return Promise.resolve(map(current));
    }
    return new Promise<T>((resolve) => ch.waiters.push({ resolve: resolve as (v: unknown) => void }));
  }

  private ensureListener(): void {
    // Channels are fed by TWO stores — the order-book live tail and the price
    // feed — on independent transports. Either commit re-reads every waiting
    // channel; getNative()'s reference stays stable when nothing changed, so a
    // notification from the "wrong" store is a cheap no-op.
    const drain = () => {
      for (const ch of this.channels.values()) {
        if (ch.waiters.length === 0) continue;
        const v = ch.getNative();
        if (Object.is(v, ch.last)) continue;
        ch.last = v;
        const mapped = ch.map(v);
        for (const w of ch.waiters.splice(0)) w.resolve(mapped);
      }
    };
    this.unsubscribe ??= this.client.subscribeLive(drain);
    this.unsubscribePrices ??= this.client.subscribePrices(drain);
  }

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
  async watchOrderBook(ref: string, limit = 10): Promise<UnifiedOrderBook> {
    const t = this.market(ref);
    await this.ensureWatch(t);
    return this.nextTick(
      `ob:${t.symbol}:${limit}`,
      () =>
        t.market.marketType === "BINARY"
          ? this.client.getLiveBinaryOrderBook(t.pool, { depth: limit })
          : this.client.getLiveSpotOrderBook(t.pool, { depth: limit }),
      (native) => ({ symbol: t.symbol, ...this.bookView(t, native), timestamp: Date.now(), info: native }),
    );
  }

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
  async watchTrades(ref: string, limit = 50): Promise<UnifiedTrade[]> {
    const t = this.market(ref);
    await this.ensureWatch(t);
    const d = this.decimalsOf(t);
    return this.nextTick(
      `tr:${t.symbol}:${limit}`,
      () => this.client.getLiveFills(t.pool, { limit }),
      (fills: LiveFill[]) =>
        fills.map((f): UnifiedTrade => {
          const price = this.priceView(t, f.fillPrice, d.price);
          const amount = Structs.toHumanNum(f.quantity, d.amount);
          const tsMs = Number(f.timestamp) * 1000;
          // Binary tradables view the side through the outcome lens; spot (and
          // perp) take the taker's book direction straight off the fill.
          const side =
            t.market.marketType === "BINARY"
              ? this.sideView(t, f.takerSide)
              : f.takerIsBid === undefined
                ? undefined
                : f.takerIsBid
                  ? "buy"
                  : "sell";
          return { id: f.id, symbol: t.symbol, price, amount, cost: price * amount, side, txHash: f.txHash, timestamp: tsMs, datetime: Structs.toDatetime(tsMs), info: f };
        }),
    );
  }

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
  async watchOrders(ref: string, limit = 100): Promise<UnifiedOrder[]> {
    const t = this.market(ref);
    const addr = this.requireAddress("watchOrders");
    await this.ensureWatch(t);
    const d = this.decimalsOf(t);
    return this.nextTick(
      `ord:${t.symbol}:${addr}`,
      () => this.client.getLiveUserOrders(t.pool, addr, { limit }),
      (orders: LiveOrder[]) =>
        orders
          .filter((o) => {
            if (t.market.marketType !== "BINARY" || !t.outcome) return true;
            if (!o.side) return true;
            const oc = o.side === "BUY_YES" || o.side === "SELL_YES" ? "YES" : "NO";
            return oc === t.outcome;
          })
          .map((o): UnifiedOrder => {
            const tsMs = Number(o.createdAt) * 1000;
            return {
              id: o.orderId,
              symbol: t.symbol,
              type: "limit",
              side: (t.market.marketType === "BINARY" ? this.sideView(t, o.side) : o.isBid ? "buy" : "sell") ?? "buy",
              price: this.priceView(t, o.price, d.price),
              amount: Structs.toHumanNum(o.fullQuantity, d.amount),
              filled: Structs.toHumanNum(o.filledQuantity, d.amount),
              remaining: Structs.toHumanNum(o.quantityRemaining, d.amount),
              status: Structs.toUnifiedStatus(o.status),
              timestamp: tsMs,
              datetime: Structs.toDatetime(tsMs),
              info: o,
            };
          }),
    );
  }

  /** Streaming view of MY fills on this tradable (authenticated). */
  async watchMyTrades(ref: string, limit = 50): Promise<UnifiedTrade[]> {
    const t = this.market(ref);
    const addr = this.requireAddress("watchMyTrades");
    await this.ensureWatch(t);
    const d = this.decimalsOf(t);
    const lcAddr = addr.toLowerCase();
    return this.nextTick(
      `mytr:${t.symbol}:${addr}`,
      () => this.client.getLiveUserFills(t.pool, addr, { limit }),
      (fills: LiveFill[]) =>
        fills.map((f): UnifiedTrade => {
          const price = this.priceView(t, f.fillPrice, d.price);
          const amount = Structs.toHumanNum(f.quantity, d.amount);
          const tsMs = Number(f.timestamp) * 1000;
          const mySide = f.taker?.toLowerCase() === lcAddr ? f.takerSide : f.maker?.toLowerCase() === lcAddr ? f.makerSide : undefined;
          return { id: f.id, symbol: t.symbol, price, amount, cost: price * amount, side: this.sideView(t, mySide), timestamp: tsMs, datetime: Structs.toDatetime(tsMs), info: f };
        }),
    );
  }

  // ------------------------------------------------------------- price feeds

  /** Hold the ref-counted price watch behind an asset (idempotent). */
  private async ensurePriceWatch(asset: string): Promise<void> {
    const key = asset.toUpperCase();
    await this.priceWatches.getOrCreate(key, () => this.client.watchPrice(key));
  }

  private toUnifiedPrice(asset: string, live: LivePrice | null): UnifiedPrice | null {
    if (!live) return null;
    const tsMs = live.blockTimestamp * 1000;
    return { symbol: asset.toUpperCase(), price: live.price, ema: live.ema, timestamp: tsMs, datetime: Structs.toDatetime(tsMs), info: live };
  }

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
  async watchPrice(asset: string): Promise<UnifiedPrice> {
    const key = asset.toUpperCase();
    await this.ensurePriceWatch(key);
    return this.nextTick(
      `px:${key}`,
      () => this.client.getLivePrice(key),
      (live: LivePrice | null) => this.toUnifiedPrice(key, live) ?? { symbol: key, price: 0, ema: 0, timestamp: Date.now(), datetime: Structs.toDatetime(Date.now()), info: null },
    );
  }

  /**
   *  One-shot current price (indexer HTTP read; no watch needed), or null if the
   *  feed has no observations yet.
   */
  async fetchPrice(asset: string): Promise<UnifiedPrice | null> {
    const live = await this.client.fetchPrice(asset);
    return this.toUnifiedPrice(asset, live);
  }

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
  async fetchPriceOHLCV(asset: string, timeframe = "1m", since?: number, limit = 500): Promise<UnifiedOHLCV[]> {
    const resolution = PRICE_TIMEFRAMES[timeframe] ?? (timeframe as PriceCandleResolution);
    if (!VALID_RESOLUTIONS.has(resolution)) {
      throw new InvalidInputError(`unknown price timeframe ${timeframe} (have: ${Object.keys(PRICE_TIMEFRAMES).join(" ")})`);
    }
    const rows = await this.client.fetchPriceCandles(asset, resolution, { limit, from: since ? Math.floor(since / 1000) : undefined });
    return rows.map((c: PriceCandle): UnifiedOHLCV => [c.bucketStart * 1000, c.open, c.high, c.low, c.close, c.count]);
  }

  // ------------------------------------------------------------- writes

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
  async createOrder(
    ref: string,
    type: "limit" | "market",
    side: "buy" | "sell",
    amount: number,
    price?: number,
    params: CreateOrderParams = {},
  ): Promise<UnifiedOrder> {
    const t = this.market(ref);
    const d = this.decimalsOf(t);
    // Align to the venue's grids HERE, before the market-kind branch: all three
    // branches read these two values, so one guard covers binary, spot and perp.
    // The pool rejects an off-lot quantity (`InvalidQuantity`) or an off-tick
    // price (`InvalidPrice`), and a caller has no way to know the grid without
    // asking us. Aligning a value already on the grid returns it unchanged, so a
    // caller who pre-snapped with the helpers sees exactly what they sent.
    const lotRaw = this.lotOf(t, "createOrder");
    const quantity = (Structs.toRaw(amount, d.amount) / lotRaw) * lotRaw;
    if (quantity <= 0n) {
      // One lot is also the venue's `minQuantity`: every deployed venue sets
      // tick = lot = min = 10**(collateralDecimals-3) (see the `_note` in
      // deployments/<chain>/<env>/venues.json), so this threshold is exactly the
      // venue's own and there is no band where an order passes here and still
      // reverts as below-minimum.
      throw new InvalidInputError(
        `amount ${amount} is below one lot on ${t.symbol} (lot ${Structs.toHumanNum(lotRaw, d.amount)}) — ` +
          `it would place a zero-quantity order`,
      );
    }

    let limitPrice = price;
    if (type === "market") {
      limitPrice = await this.crossingPrice(t, side, params.slippage ?? 0.01);
    }
    if (limitPrice === undefined) {
      throw new InvalidInputError("a limit order needs a price");
    }
    // A buy must not be pushed UP and a sell must not be pushed DOWN — rounding
    // the wrong way costs the caller money on one of the two sides. A market
    // order's price already came back aligned from `crossingPrice` (rounded the
    // other way, so it still crosses), and re-aligning it is identity.
    limitPrice = Structs.snapToGrid(limitPrice, this.tickOf(t, "createOrder"), d.price, {
      direction: side === "buy" ? "down" : "up",
      clamp: t.market.marketType === "BINARY",
    });
    const orderType =
      type === "market"
        ? Trade.ORDER_TYPE.MARKET
        : params.postOnly || params.timeInForce === "PO"
          ? Trade.ORDER_TYPE.POST_ONLY
          : params.timeInForce === "FOK"
            ? Trade.ORDER_TYPE.FILL_OR_KILL
            : params.timeInForce === "IOC"
              ? Trade.ORDER_TYPE.MARKET
              : Trade.ORDER_TYPE.LIMIT;

    let result: PlaceOrderResult;
    if (t.market.marketType === "BINARY") {
      const yesish = t.outcomeIndex !== 1;
      const binarySide: BinarySide = yesish
        ? side === "buy" ? "BUY_YES" : "SELL_YES"
        : side === "buy" ? "BUY_NO" : "SELL_NO";
      result = await this.trader.placeOrder({
        pool: t.pool,
        side: binarySide,
        price: this.toNativePrice(t, limitPrice),
        quantity,
        orderType,
        builder: params.builder,
        builderFeeBpsTimes1k: params.builderFeeBpsTimes1k,
      });
    } else if (t.market.marketType === "PERP") {
      result = await this.trader.placePerpOrder({
        pool: t.pool,
        isBid: side === "buy",
        price: Structs.toRaw(limitPrice, d.price),
        quantity,
        orderType,
        builder: params.builder,
        builderFeeBpsTimes1k: params.builderFeeBpsTimes1k,
      });
    } else {
      const s = t.market;
      result = await this.trader.placeSpotOrder({
        pool: t.pool,
        isBid: side === "buy",
        price: Structs.toRaw(limitPrice, d.price),
        quantity,
        baseDecimals: s.baseDecimals,
        quoteToken: s.quoteToken,
        baseToken: s.baseToken,
        baseIsNative: s.baseIsNative,
        orderType,
        builder: params.builder,
        builderFeeBpsTimes1k: params.builderFeeBpsTimes1k,
      });
    }

    const filledRaw = result.fills.reduce((acc, f) => acc + f.quantityFilled, 0n);
    const filled = Structs.toHumanNum(filledRaw, d.amount);
    // Against the ALIGNED quantity, not the caller's: that is what was placed, so
    // it is what `filled` is a fraction of. Using the caller's number here would
    // report a phantom remainder for an amount that aligned down, and `status`
    // reads off `remaining` — an order that fully filled would look still-open.
    const placedAmount = Structs.toHumanNum(quantity, d.amount);
    const remaining = Math.max(0, placedAmount - filled);
    const rests = orderType === Trade.ORDER_TYPE.LIMIT || orderType === Trade.ORDER_TYPE.POST_ONLY;
    const now = Date.now();
    return {
      id: result.orderId?.toString() ?? result.hash,
      symbol: t.symbol,
      type,
      side,
      price: limitPrice,
      amount: placedAmount,
      filled,
      remaining,
      // fully filled → closed; resting remainder → open; IOC/market remainder → canceled
      status: remaining <= 0 ? "closed" : rests && result.orderId !== undefined ? "open" : "canceled",
      txHash: result.hash,
      timestamp: now,
      datetime: Structs.toDatetime(now),
      info: result,
    };
  }

  private async crossingPrice(t: Tradable, side: "buy" | "sell", slippage: number): Promise<number> {
    const book =
      this.client.getWatchStatus(t.pool) === "live"
        ? { symbol: t.symbol, ...this.bookView(t, t.market.marketType === "BINARY" ? this.client.getLiveBinaryOrderBook(t.pool, { depth: 1 }) : this.client.getLiveSpotOrderBook(t.pool, { depth: 1 })) }
        : await this.fetchOrderBook(t.symbol, 1);
    const best = side === "buy" ? book.asks[0]?.[0] : book.bids[0]?.[0];
    if (best === undefined) {
      throw new InvalidInputError(`cannot price a market ${side} on ${t.symbol} — the opposite side of the book is empty`);
    }
    const padded = side === "buy" ? best * (1 + slippage) : best * (1 - slippage);
    // Snap the protective limit onto the tick grid, AWAY from the caller — a buy
    // up, a sell down — so every level this order was priced to sweep still
    // crosses. Rounding it the conservative way instead could pull the limit
    // inside the best price and fill nothing. The float multiply above lands off
    // the grid for almost every input (measured: 1984 of 1998 on the live binary
    // ladder), and the pool rejects an off-tick price outright.
    //
    // Align BEFORE clamping: the clamp bounds are grid multiples, so clamping an
    // aligned value keeps it aligned, whereas clamping first could hand the
    // aligner a bound it then moves back off the range.
    return Structs.snapToGrid(padded, this.tickOf(t, "createOrder"), this.decimalsOf(t).price, {
      direction: side === "buy" ? "up" : "down",
      // Binary prices are probabilities: clamp inside (0, 1) — to a whole tick
      // either side, not the one raw unit this used before, which is not itself
      // on the grid of any venue whose tick exceeds a single unit.
      //
      // `createOrder`, the only caller, clamps again on the way out, so this is
      // redundant for that path and no test can distinguish it. Kept because the
      // pre-existing code bounded the value here, and returning an out-of-range
      // probability from a helper that computes one is a trap for the next caller.
      clamp: t.market.marketType === "BINARY",
    });
  }

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
  async cancelOrder(id: string, ref: string): Promise<{
    /** The canceled order's id, echoed back. */
    id: string;
    /** The tradable symbol the order lived on. */
    symbol: string;
    /** Always "canceled" — the call throws if the cancel didn't land. */
    status: "canceled";
    /** The native {@link TxResult}. */
    info: unknown;
  }> {
    const t = this.market(ref);
    const res = await this.trader.cancelOrder({ pool: t.pool, orderId: id });
    return { id, symbol: t.symbol, status: "canceled", info: res };
  }

  // ------------------------------------------------- stop orders

  /** The spot tradable + its stop registry, or a loud error naming the gap. */
  private requireStopVenue(ref: string): { t: Tradable; registry: Address } {
    const t = this.market(ref);
    if (t.market.marketType !== "SPOT") {
      // Dispatch point: perp stops will be margin-native (no escrow, oracle
      // mark) on their own mechanism — added here when that venue exists.
      throw new InvalidInputError(`stop orders are not available on ${t.market.marketType} markets yet`);
    }
    const registry = (t.market as SpotMarket).stopRegistry;
    if (!registry) {
      throw new InvalidInputError(`${t.symbol} has no stop-order registry`);
    }
    return { t, registry };
  }

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
  async createStopOrder(
    ref: string,
    type: "limit" | "market",
    side: "buy" | "sell",
    amount: number,
    triggerPrice: number,
    price?: number,
    params: { triggerDirection?: "above" | "below" } = {},
  ): Promise<UnifiedStopOrder> {
    const { t, registry } = this.requireStopVenue(ref);
    const s = t.market as SpotMarket;
    const d = this.decimalsOf(t);

    if (type === "limit" && price === undefined) {
      throw new InvalidInputError("a limit stop order needs a price");
    }

    // Infer the trigger direction from the freshest mark: an order arming
    // above the current mark fires on the way up (GTE), below on the way
    // down (LTE). The mark is refetched here — the loadMarkets() snapshot can
    // be arbitrarily stale, and a stale mark on the wrong side of the trigger
    // would silently invert the direction (a stop that fires instantly, or
    // never). Ambiguous (== mark, or no mark reachable) requires the caller
    // to pin it.
    let direction = params.triggerDirection;
    if (!direction) {
      const fresh = (await this.client
        .getMarketByPool(t.pool)
        .catch(() => null)) as SpotMarket | null;
      const markRaw = fresh?.markPrice ?? fresh?.lastPrice;
      const mark = markRaw != null ? Structs.toHumanNum(markRaw, d.price) : undefined;
      if (mark === undefined || mark === triggerPrice) {
        throw new InvalidInputError("cannot infer the trigger direction — pass params.triggerDirection");
      }
      direction = triggerPrice > mark ? "above" : "below";
    }

    // Align to the registry's grids, same rules as createOrder: the limit price
    // in the direction that cannot cost the caller, the quantity down to a lot.
    // Done AFTER the direction inference above, which compares the caller's
    // stated trigger against the mark — aligning first could move the trigger
    // across the mark and silently invert the direction.
    const tickRaw = this.tickOf(t, "createStopOrder");
    const lotRaw = this.lotOf(t, "createStopOrder");
    const priceDirection = side === "buy" ? "down" : "up";
    const limitPrice =
      price !== undefined
        ? Structs.toRaw(Structs.snapToGrid(price, tickRaw, d.price, { direction: priceDirection }), d.price)
        : undefined;
    const alignedQuantity = (Structs.toRaw(amount, d.amount) / lotRaw) * lotRaw;
    if (alignedQuantity <= 0n) {
      throw new InvalidInputError(
        `amount ${amount} is below one lot on ${t.symbol} (lot ${Structs.toHumanNum(lotRaw, d.amount)}) — ` +
          `it would place a zero-quantity stop order`,
      );
    }
    // The trigger arms against the pool's mark, so it aligns AWAY from the mark —
    // in the direction `direction` already established — never toward it. Aligning
    // it like an order price instead can land it exactly ON the mark, and a GTE
    // stop whose trigger equals the mark fires the instant it is armed: a caller
    // asking for a stop 0.04% out would get an immediate market order.
    const alignedTrigger = Structs.snapToGrid(triggerPrice, tickRaw, d.price, {
      direction: direction === "above" ? "up" : "down",
    });
    const result = await this.trader.placeSpotStopOrder({
      registry,
      pool: t.pool,
      isBid: side === "buy",
      quantity: alignedQuantity,
      triggerPrice: Structs.toRaw(alignedTrigger, d.price),
      // 0 = GTE (mark ≥ trigger), 1 = LTE (mark ≤ trigger).
      triggerOperator: direction === "above" ? 0 : 1,
      // 1 = MARKET at trigger, 0 = LIMIT.
      stopOrderType: type === "market" ? 1 : 0,
      ...(limitPrice !== undefined ? { limitPrice } : {}),
      quoteToken: s.quoteToken,
      baseToken: s.baseToken,
      baseIsNative: s.baseIsNative,
    });

    // The stop IS armed on-chain at this point — but without the registry id
    // the caller can never cancel it through this facade, so a silent ""
    // would break later. Fail loud, with the tx hash for manual recovery.
    if (result.stopOrderId === undefined) {
      // Same class as operatorAdmin's missing-event decode: the tx completed but
      // the receipt didn't yield what the SDK needs — an infra fault, not a revert.
      throw new RpcError(
        "createStopOrder",
        `stop order tx ${result.hash} landed but PendingOrderCreated was not in the receipt (ABI/deployment drift?) — registry id unknown; recover via the registry directly`,
      );
    }

    const now = Date.now();
    return {
      id: result.stopOrderId.toString(),
      symbol: t.symbol,
      type,
      side,
      // The ALIGNED values, not the caller's — this describes the stop that is
      // now armed on-chain, which is what a caller reconciling against it needs.
      amount: Structs.toHumanNum(alignedQuantity, d.amount),
      triggerPrice: alignedTrigger,
      triggerDirection: direction,
      ...(limitPrice !== undefined ? { price: Structs.toHumanNum(limitPrice, d.price) } : {}),
      status: "pending",
      timestamp: now,
      datetime: Structs.toDatetime(now),
      txHash: result.hash,
      info: result,
    };
  }

  /**
   * The wallet's pending (armed, untriggered) stop orders, newest first.
   * Scope to one tradable with `ref`.
   */
  async fetchOpenStopOrders(ref?: string): Promise<UnifiedStopOrder[]> {
    const addr = this.requireAddress("fetchOrders");
    const t = ref ? this.market(ref) : undefined;
    const rows = await this.client.getSpotStopOrders(addr, {
      status: "PENDING",
      ...(t ? { pool: t.pool } : {}),
    });

    const out: UnifiedStopOrder[] = [];
    for (const o of rows) {
      const rt = this.tryResolvePool(o.market.poolAddress);
      if (!rt) continue;
      const d = this.decimalsOf(rt);
      const tsMs = Number(o.createdAt) * 1000;
      out.push({
        id: o.orderId,
        symbol: rt.symbol,
        type: o.orderType === 1 ? "market" : "limit",
        side: o.isBid ? "buy" : "sell",
        amount: Structs.toHumanNum(o.quantity, d.amount),
        triggerPrice: Structs.toHumanNum(o.triggerPrice, d.price),
        triggerDirection: o.triggerOperator === 0 ? "above" : "below",
        status: "pending",
        ...(o.placedOrderId != null ? { triggeredOrderId: o.placedOrderId } : {}),
        timestamp: tsMs,
        datetime: Structs.toDatetime(tsMs),
        info: o,
      });
    }
    return out;
  }

  /**
   * Cancel a pending stop order on its registry (refunds the keeper
   * payment). `id` comes from {@link fetchOpenStopOrders}.
   */
  async cancelStopOrder(id: string, ref: string): Promise<{
    /** The canceled stop order's id, echoed back. */
    id: string;
    /** The tradable symbol the stop targeted. */
    symbol: string;
    /** Always "canceled" — the call throws if the cancel didn't land. */
    status: "canceled";
    /** The native {@link TxResult}. */
    info: unknown;
  }> {
    const { t, registry } = this.requireStopVenue(ref);
    const res = await this.trader.cancelStopOrder({ registry, orderId: id });
    return { id, symbol: t.symbol, status: "canceled", info: res };
  }

  // ------------------------------------------------- perp specifics

  /** Live funding-rate + mark/index snapshot for a perp market (chain read). */
  async fetchFundingRate(ref: string): Promise<UnifiedFundingRate> {
    const t = this.requirePerpMarket(ref);
    const m = t.market as PerpMarket;
    const s = await this.client.getPerpState(t.pool);
    const now = Date.now();
    return {
      symbol: t.symbol,
      // Gated on BOTH, matching perpMarkForPnl and fetchTicker. `tryGetMarkPrice`
      // returns (ok, price) and the price word is meaningless when ok is false;
      // `_tryMarkPrice` also maps a zero price to (false, 0), so `ok` implies non-zero
      // today — enforced here anyway rather than trusted, because a mark of 0 on the
      // wire is the sentinel mistake this whole change exists to prevent.
      markPrice: s.markPriceOk && s.markPrice > 0n ? Structs.toHumanNum(s.markPrice, m.quoteDecimals) : undefined,
      indexPrice: Structs.toHumanNum(s.indexPrice, m.quoteDecimals),
      // Normalized to the same per-8h axis as fetchFundingRateHistory. Load-bearing: the
      // chain value is per CALCULATION WINDOW, and if the live reading and the history
      // sat on different axes, a chart's newest point would jump relative to the series
      // it extends. `info` carries fundingWindowSec / fundingIntervalSec for anyone who
      // needs the per-interval or annualized form.
      fundingRate: Number(fundingRate8h(s.fundingRate, s.fundingWindowSec)) / 1e18,
      // The NEXT settlement time, which is what a ccxt consumer expects here — the last
      // anchor plus the settlement interval. Previously reported the ORACLE's updatedAt,
      // which is a different clock entirely and drifts from the funding schedule.
      // Settlement is permissionless and lazy, so this can be in the past.
      fundingTimestamp: Number(s.nextFundingAt) * 1000,
      timestamp: now,
      datetime: Structs.toDatetime(now),
      info: s,
    };
  }

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
  async fetchFundingRateHistory(
    ref: string,
    since?: number,
    limit?: number,
  ): Promise<UnifiedFundingRate[]> {
    const t = this.requirePerpMarket(ref);
    const m = t.market as PerpMarket;
    const rows = await this.client.listFundingRateHistory(t.pool, {
      limit: limit ?? 100,
      // ccxt speaks milliseconds; the indexer stores unix seconds.
      // With `since` the read ASCENDS, so the page starts at the cursor rather than at the
      // newest row — the whole point, and it means no reverse is needed below.
      ...(since != null ? { from: Math.floor(since / 1000), order: "asc" as const } : {}),
    });
    // Ascending already when `since` was given; otherwise newest-first, and ccxt series
    // are oldest-first.
    return (since != null ? rows : rows.slice().reverse())
      .map((r) => {
        const ts = Number(r.timestamp) * 1000;
        return {
          symbol: t.symbol,
          markPrice: r.markPrice == null ? undefined : Structs.toHumanNum(BigInt(r.markPrice), m.quoteDecimals),
          indexPrice: Structs.toHumanNum(BigInt(r.indexPrice), m.quoteDecimals),
          fundingRate: Number(fundingRate8h(BigInt(r.fundingRate), r.fundingWindowSec)) / 1e18,
          fundingTimestamp: ts,
          timestamp: ts,
          datetime: Structs.toDatetime(ts),
          info: r,
        };
      });
  }

  /**
   *  Open perp positions (authenticated; on-chain MarginBank reads). Pass
   *  symbols to scope; defaults to every loaded perp market.
   */
  async fetchPositions(refs?: string[]): Promise<UnifiedPosition[]> {
    const addr = this.requireAddress("fetchPositions");
    await this.loadMarkets();
    const tradables = refs
      ? refs.map((r) => this.requirePerpMarket(r))
      : Object.values(this.markets)
          .filter((m) => m.type === "swap")
          .map((m) => this.market(m.symbol));
    const out = await Promise.all(
      tradables.map(async (t): Promise<UnifiedPosition | null> => {
        const m = t.market as PerpMarket;
        const [pos, state] = await Promise.all([
          this.client.getPerpPosition({ marginBank: m.marginBank, account: addr, pool: t.pool }),
          this.client.getPerpState(t.pool),
        ]);
        if (pos.size === 0n) return null;
        const long = pos.size > 0n;
        const size = Structs.toHumanNum(long ? pos.size : -pos.size, m.baseDecimals);
        const entryPrice = Structs.toHumanNum(pos.avgEntryPrice, m.quoteDecimals);
        // Fall back to the INDEX price when the mark feed is stale.
        //
        // This guard is load-bearing because the read underneath changed. `getPerpState`
        // used to call `getMarkPrice()`, which REVERTS on a stale feed — so this whole
        // Promise.all threw and the position simply did not list. It now calls
        // `tryGetMarkPrice`, which reports staleness instead of reverting, and an
        // unguarded read would take the 0 price word and compute
        // `unrealizedPnl = (0 - entryPrice) * size` — a 100% loss on every open position,
        // from a feed hiccup. More robust read, strictly worse number, unless handled.
        //
        // The index is the right proxy rather than omitting the position: it is a
        // separate oracle the pool already trusts for funding, and dropping positions from
        // a portfolio view is its own kind of wrong. `info.markFromIndex` records which was
        // used so a caller can caveat the PnL. The decision itself lives in
        // `perpMarkForPnl`, unit-tested, so it cannot be re-broken by an inline edit.
        const mark = perpMarkForPnl(state);
        const markPrice = Structs.toHumanNum(mark.price, m.quoteDecimals);
        const tsMs = Number(pos.lastUpdatedTimestampNs / 1_000_000n);
        // Best-effort: an extra MarginBank read; degrade to undefined on failure
        // so a position still lists if the health read reverts.
        const liqRaw = await this.client
          .getLiquidationPrice({ marginBank: m.marginBank, account: addr, pool: t.pool })
          .catch(() => null);
        return {
          symbol: t.symbol,
          side: long ? "long" : "short",
          contracts: size,
          entryPrice,
          markPrice,
          unrealizedPnl: (markPrice - entryPrice) * (long ? size : -size),
          liquidationPrice: liqRaw != null ? Structs.toHumanNum(liqRaw, m.quoteDecimals) : undefined,
          timestamp: tsMs,
          datetime: Structs.toDatetime(tsMs),
          // markFromIndex says whether markPrice/unrealizedPnl came from the mark feed or
          // fell back to the index — surface it if you display PnL.
          info: { position: pos, state, markFromIndex: mark.fromIndex },
        };
      }),
    );
    return out.filter((p): p is UnifiedPosition => p !== null);
  }

  /**
   *  Deposit collateral into the perp MarginBank (human quote units, e.g.
   *  USDso). One cross-margin balance covers every perp market.
   */
  async depositMargin(ref: string, amount: number): Promise<{
    /** Hash of the mined deposit transaction. */
    hash: string;
    /** The native {@link TxResult}. */
    info: unknown;
  }> {
    const t = this.requirePerpMarket(ref);
    const m = t.market as PerpMarket;
    const res = await this.trader.depositMargin({
      marginBank: m.marginBank,
      amount: Structs.toRaw(amount, m.quoteDecimals),
    });
    return { hash: res.hash, info: res };
  }

  /** Withdraw free collateral from the perp MarginBank (human quote units). */
  async withdrawMargin(ref: string, amount: number): Promise<{
    /** Hash of the mined withdrawal transaction. */
    hash: string;
    /** The native {@link TxResult}. */
    info: unknown;
  }> {
    const t = this.requirePerpMarket(ref);
    const m = t.market as PerpMarket;
    const res = await this.trader.withdrawMargin({
      marginBank: m.marginBank,
      amount: Structs.toRaw(amount, m.quoteDecimals),
    });
    return { hash: res.hash, info: res };
  }

  private requirePerpMarket(ref: string): Tradable {
    const t = this.market(ref);
    if (t.market.marketType !== "PERP") {
      throw new InvalidInputError(`${t.marketSymbol} is not a perp market`);
    }
    return t;
  }

  // ------------------------------------------- outcome-market specifics

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
  async mintSet(ref: string, amount: number): Promise<{
    /** Hash of the mined mint transaction. */
    hash: string;
    /** The native {@link TxResult}. */
    info: unknown;
  }> {
    const t = this.requireOutcomeMarket(ref);
    const res = await this.trader.mintSet({ pool: t.pool, amount: Structs.toRaw(amount, t.market.baseDecimals) });
    return { hash: res.hash, info: res };
  }

  /** Burn complete sets back to collateral. */
  async burnSet(ref: string, amount: number): Promise<{
    /** Hash of the mined burn transaction. */
    hash: string;
    /** The native {@link TxResult}. */
    info: unknown;
  }> {
    const t = this.requireOutcomeMarket(ref);
    const res = await this.trader.burnSet({ pool: t.pool, amount: Structs.toRaw(amount, t.market.baseDecimals) });
    return { hash: res.hash, info: res };
  }

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
  async redeem(ref: string, amount: number): Promise<{
    /** Hash of the mined redeem transaction. */
    hash: string;
    /** The native {@link TxResult}. */
    info: unknown;
  }> {
    const t = this.requireOutcomeMarket(ref);
    const bm = t.market as BinaryMarket;
    const res = await this.trader.redeem({
      marketId: bm.marketId,
      market: bm.marketAddress,
      // Use the indexed winning outcome when present to skip the on-chain read.
      outcomeIdx: bm.winningOutcome == null ? undefined : (bm.winningOutcome as 0 | 1),
      amount: Structs.toRaw(amount, t.market.baseDecimals),
    });
    return { hash: res.hash, info: res };
  }

  private requireOutcomeMarket(ref: string): Tradable {
    const t = this.market(ref);
    if (t.market.marketType !== "BINARY") {
      throw new InvalidInputError(`${t.marketSymbol} is not an outcome market`);
    }
    return t;
  }

  // ------------------------------------------------------------- lifecycle

  /**
   *  Release every watch + channel this exchange holds and stop the client's
   *  live machinery.
   *
   *  **Details**
   *
   *  The instance stays usable for one-shot fetch calls.
   */
  async close(): Promise<void> {
    for (const p of this.watches.values()) {
      await p.then((h) => h.stop()).catch(() => undefined);
    }
    this.watches.clear();
    for (const p of this.priceWatches.values()) {
      await p.then((h) => h.stop()).catch(() => undefined);
    }
    this.priceWatches.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribePrices?.();
    this.unsubscribePrices = null;
    this.channels.clear();
    this.client.stopLive();
  }
}
