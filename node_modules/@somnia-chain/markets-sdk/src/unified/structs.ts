// The exchange API's data structures + the human↔raw conversion helpers.
//
// Field names and shapes follow the conventions exchange bots already speak
// (markets keyed by symbol, books as [price, amount] pairs, orders with
// filled/remaining/status, trades with cost — ccxt-compatible down to the
// field names). Numbers are HUMAN units — right for strategy and display
// code. Every struct carries `info` with the raw SDK/native payload
// (bigints, addresses) for exact math; all escrow arithmetic happens in the
// native engine, never on these floats.

import { formatUnits } from "viem";
import type { Market } from "../markets.js";
import { InvalidInputError } from "../errors.js";
import * as Units from "../units.js";

/**
 *  Market kind in ccxt vocabulary: "swap" is a linear perp; "binary" /
 *  "categorical" are outcome markets ("categorical" is reserved — no market
 *  carries it yet).
 */
export type UnifiedMarketType = "spot" | "swap" | "binary" | "categorical";

/** A unified market object. `info` is the native `Market` union row. */
export interface UnifiedMarket {
  /** Venue-internal id (the native market id: bytes32 for binary, pool for spot). */
  id: string;
  /**
   *  Canonical MARKET symbol (no outcome suffix), e.g. "SOMI/USDC" or
   *  "BTC-95000-31DEC26/USDC". Key into `exchange.markets`.
   */
  symbol: string;
  /** Market kind — see {@link UnifiedMarketType}. */
  type: UnifiedMarketType;
  /**
   *  Base currency code — for outcome markets, the market's asset-strike-expiry
   *  stem (everything before the slash).
   */
  base: string;
  /** Quote currency code (outcome markets: the collateral token's code). */
  quote: string;
  /**
   *  Settlement currency code. Set on swap (== quote for a linear perp) and
   *  outcome markets; absent on spot.
   */
  settle?: string;
  /** Derived from live/indexed lifecycle — false once trading is impossible. */
  active: boolean;
  /** ccxt's derivative flag: true only for swap (perp) markets. */
  contract: boolean;
  /**
   *  Decimal places implied by the market's tick (price) and lot (amount)
   *  grids — what {@link SomniaMarkets.priceToPrecision} snaps to.
   */
  precision: {
    /** Price decimal places (from the tick grid). */
    price: number;
    /** Amount decimal places (from the lot grid). */
    amount: number;
  };
  /** Order-size floors, human units; `min` is absent when the pool sets none. */
  limits: {
    /** Amount (order size) bounds. */
    amount: {
      /** Minimum order size, human base units. */
      min?: number;
    };
  };
  /** Outcome tradables (binary/categorical). Absent on spot/swap. */
  outcomes?: {
    /** The outcome's tradable symbol, e.g. "BTC-95000-31DEC26/USDC#YES". */
    symbol: string;
    /** Outcome label ("YES" / "NO"). */
    label: string;
    /** Outcome index on the ERC-6909 singleton (0 = YES, 1 = NO). */
    index: number;
  }[];
  /** The native `Market` union row (raw strings/bigint-scale fields). */
  info: Market;
}

/** An L2 book: [price, amount] pairs, best first, human units. */
export interface UnifiedOrderBook {
  /**
   *  The tradable symbol this book view addresses (a NO book is the YES book
   *  inverted into NO terms).
   */
  symbol: string;
  /** Buy side, best (highest) bid first. */
  bids: [number, number][];
  /** Sell side, best (lowest) ask first. */
  asks: [number, number][];
  /** When this view was assembled (ms) — local clock, not a block timestamp. */
  timestamp?: number;
  /** The native book (raw bigint levels; YES terms for binary). */
  info?: unknown;
}

/** A fill, in the tradable's own terms (prices/amounts human units). */
export interface UnifiedTrade {
  /** Native fill id — unique per fill, stable across reads. */
  id: string;
  /** The tradable symbol the fill is viewed on. */
  symbol: string;
  /** Fill price, human units (binary: this outcome's probability). */
  price: number;
  /** Filled quantity, human base units. */
  amount: number;
  /** price × amount, in quote units. */
  cost: number;
  /** Taker direction on this tradable's book; undefined when unresolved. */
  side?: "buy" | "sell";
  /** Tx hash the fill landed in, when known. */
  txHash?: string;
  /** Fill block timestamp (ms). */
  timestamp: number;
  /** ISO-8601 of `timestamp`. */
  datetime: string;
  /** The native fill row (raw units, maker/taker addresses). */
  info: unknown;
}

/**
 *  Unified order lifecycle: "closed" = fully filled; "canceled" covers both
 *  explicit cancels and an IOC/market remainder that couldn't rest.
 */
export type UnifiedOrderStatus = "open" | "closed" | "canceled" | "expired";

/** An order, in the tradable's own terms (prices/amounts human units). */
export interface UnifiedOrder {
  /**
   *  On-chain order id (decimal string) — pass to {@link SomniaMarkets.cancelOrder}.
   *  Falls back to the tx hash for a write that left nothing resting.
   */
  id: string;
  /** The tradable symbol the order is viewed on. */
  symbol: string;
  /** Requested execution style ("market" computed a crossing IOC limit). */
  type: "limit" | "market";
  /** Direction on this tradable's book (a NO buy is a YES sell internally). */
  side: "buy" | "sell";
  /** Limit price, human units; absent when unknown. */
  price?: number;
  /** Full order size, human base units. */
  amount: number;
  /** Quantity filled so far, human base units. */
  filled: number;
  /** Quantity still open (`amount − filled`), human base units. */
  remaining: number;
  /** Lifecycle state — see {@link UnifiedOrderStatus}. */
  status: UnifiedOrderStatus;
  /** Tx hash the order was placed in, when known. */
  txHash?: string;
  /** Placement time (ms); write results stamp the local clock. */
  timestamp?: number;
  /** ISO-8601 of `timestamp`. */
  datetime?: string;
  /** The native order row / {@link PlaceOrderResult}. */
  info: unknown;
}

/** A pending stop order's lifecycle, unified vocabulary. */
export type UnifiedStopOrderStatus =
  | "pending"
  | "triggered"
  | "canceled"
  | "failed";

/**
 *  A stop / take-profit order resting OFF the book on the market's
 *  SpotStopOrderRegistry, human units. Fires as a market or limit order when
 *  the pool's mark price crosses `triggerPrice`.
 */
export interface UnifiedStopOrder {
  /** Registry order id (decimal string) — pass to {@link SomniaMarkets.cancelStopOrder}. */
  id: string;
  /** The spot tradable the stop targets. */
  symbol: string;
  /** Execution style at trigger time. */
  type: "limit" | "market";
  /** Direction of the triggered order. */
  side: "buy" | "sell";
  /** Order size, human base units. */
  amount: number;
  /** Mark price that arms the trigger, human quote units. */
  triggerPrice: number;
  /** Which side of the mark the trigger arms on. */
  triggerDirection: "above" | "below";
  /** Limit price of the triggered order (limit stops only), human quote units. */
  price?: number;
  /** Lifecycle state — see {@link UnifiedStopOrderStatus}. */
  status: UnifiedStopOrderStatus;
  /** The spot order id the trigger produced, once it fired. */
  triggeredOrderId?: string;
  /** Creation time (ms). */
  timestamp?: number;
  /** ISO-8601 of `timestamp`. */
  datetime?: string;
  /** Tx hash of the create, when known (write results only). */
  txHash?: string;
  /** The native registry row / write result. */
  info: unknown;
}

/**
 *  One currency's balance, human units (ccxt shape). For spot/binary, funds
 *  escrowed in resting orders live in the pools — not the wallet — so `used`
 *  is 0 and `free === total`. NOTE: this "used is 0" property is a fact about
 *  wallet-held tokens, not a law of the venue — perp collateral IS locked
 *  (MarginBank margin against open positions), and a margin-aware
 *  `fetchBalance` arm must report it through `used` rather than pretending
 *  the invariant generalizes.
 */
export interface UnifiedBalance {
  /** Spendable balance. */
  free: number;
  /** Locked balance (0 for wallet-held spot/binary tokens; perp margin when reported). */
  used: number;
  /** `free + used`, human units. */
  total: number;
}

/** Balances keyed by currency code, plus the raw reads under `info`. */
export interface UnifiedBalances {
  [code: string]: UnifiedBalance;
}

/** An OHLCV row: [timestampMs, open, high, low, close, volume(base)]. */
export type UnifiedOHLCV = [number, number, number, number, number, number];

/**
 *  A rolling 24h market snapshot (ccxt ticker shape), human units. Absent
 *  fields mean the window had no trades to derive them from.
 */
export interface UnifiedTicker {
  /** The tradable symbol the ticker describes. */
  symbol: string;
  /** When this snapshot was computed (ms, local clock). */
  timestamp: number;
  /** ISO-8601 of `timestamp`. */
  datetime: string;
  /** Highest fill price in the window. */
  high?: number;
  /** Lowest fill price in the window. */
  low?: number;
  /** First fill price in the window. */
  open?: number;
  /** Most recent fill price (may predate the window on quiet markets). */
  last?: number;
  /** `last − open`, when both are known. */
  change?: number;
  /** `change / open` as a plain fraction (0.05 = +5%), when derivable. */
  percentage?: number;
  /** Σ base-asset volume over the window. */
  baseVolume: number;
  /** Σ quote-asset volume over the window. */
  quoteVolume: number;
  /**
   *  PERP ONLY — mark price, human quote units.
   *
   *  Undefined on spot/binary, and undefined on a perp whose mark is unusable —
   *  either the feed reported stale, or the price is zero. A zero mark is never
   *  published: flattened to a number it reads as a real price, and downstream an
   *  unguarded `markPrice - entryPrice` becomes a 100% loss on every open position.
   */
  markPrice?: number;
  /** PERP ONLY — oracle index price, human quote units. Undefined on spot/binary. */
  indexPrice?: number;
  /**
   *  PERP ONLY — funding rate per **8 HOURS** as a plain fraction (0.0001 = 0.01%).
   *
   *  The same axis {@link UnifiedFundingRate.fundingRate} and `fetchFundingRateHistory`
   *  use, deliberately: a header reading one basis while the chart beside it reads
   *  another is a wrong number that looks right. NOT the amount charged per settlement —
   *  that is this divided by `fundingWindowSec / fundingIntervalSec` (96 on testnet,
   *  expected 8 on mainnet), and `info.perp` carries both figures.
   */
  fundingRate?: number;
  /**
   *  PERP ONLY — when funding next settles (ms). Settlement is permissionless and lazy,
   *  so a past value means a settlement is DUE, not that anything is broken.
   */
  fundingTimestamp?: number;
  /**
   *  PERP ONLY — total open interest in base units.
   *
   *  ONE counter, not a long/short pair: in a matched CLOB the short side is provably
   *  equal, so there is nothing to sum.
   */
  openInterest?: number;
  /**
   *  The raw fold this snapshot came from (raw-unit bigints). On a perp it also carries
   *  `perp`, the full on-chain state — including `fundingWindowSec` /
   *  `fundingIntervalSec` for re-basing the funding rate.
   */
  info: unknown;
}

/** A perp funding-rate snapshot (live chain read; rates are fractions, not %). */
export interface UnifiedFundingRate {
  /** The perp's tradable symbol, e.g. "BTC/USDSO:USDSO". */
  symbol: string;
  /**
   *  Mark price, human quote units.
   *
   *  Undefined when the mark feed is stale — a live read reports that explicitly, and a
   *  historical row carries the contract's 0 sentinel, neither of which should be
   *  flattened to a price of zero.
   */
  markPrice: number | undefined;
  /** Oracle index price, human quote units. */
  indexPrice: number;
  /**
   *  Funding rate per 8 HOURS as a plain fraction (0.0001 = 0.01%).
   *
   *  Normalized to a fixed 8h axis (the Hyperliquid/Binance convention) from the
   *  chain's per-calculation-window value, so it stays comparable across a parameter
   *  change. NOT the amount charged at each settlement: that is this divided by
   *  `n = fundingWindowSec / fundingIntervalSec`, which is 96 on testnet and expected to
   *  be 8 on mainnet. `info` carries both figures.
   */
  fundingRate: number;
  /**
   *  When funding next settles, or when this row settled (ms).
   *
   *  For a live read this is the last settlement anchor plus the settlement interval;
   *  because settlement is permissionless and LAZY it can be in the past, which means a
   *  settlement is due rather than that anything is wrong.
   */
  fundingTimestamp?: number;
  /** When this snapshot was read (ms, local clock). */
  timestamp: number;
  /** ISO-8601 of `timestamp`. */
  datetime: string;
  /** The native on-chain perp state (raw 1e18/quote-unit bigints). */
  info: unknown;
}

/** An open perp position, human units. */
export interface UnifiedPosition {
  /** The perp's tradable symbol. */
  symbol: string;
  /** Position direction (from the sign of the on-chain size). */
  side: "long" | "short";
  /** Absolute position size in base units. */
  contracts: number;
  /** Average entry price, human quote units. */
  entryPrice: number;
  /** Current EMA mark price, human quote units. */
  markPrice?: number;
  /** (mark − entry) × signed size, human quote units. Excludes pending funding. */
  unrealizedPnl?: number;
  /**
   *  Estimated liquidation price, human quote units — the price at which THIS market's
   *  move alone would trip the account's cross-margin maintenance requirement.
   *  `undefined` when it can't be derived (a stale mark anywhere in the account reverts
   *  the health read this needs).
   *
   *  Solved with both sides of `equity == mmReq` moving against the mark; see
   *  `perpLiquidationPrice` for the identity and what is held constant. For the price a
   *  proposed order would move this to, use `client.previewPerpLiquidationPrice`.
   */
  liquidationPrice?: number;
  /** When the position last changed on-chain (ms). */
  timestamp?: number;
  /** ISO-8601 of `timestamp`. */
  datetime?: string;
  /** The native reads: `{ position, state }` (raw bigints). */
  info: unknown;
}

/** A realtime price snapshot for one asset (the on-chain EMA oracle feed). */
export interface UnifiedPrice {
  /** Asset symbol, e.g. "BTC", "ETH". */
  symbol: string;
  /** Latest price, human units. */
  price: number;
  /** Latest EMA (exponential moving average) price, human units. */
  ema: number;
  /** Block timestamp of the latest observation (ms). */
  timestamp: number;
  /** ISO-8601 of `timestamp`. */
  datetime: string;
  /** The native {@link LivePrice} row (raw 1e18 strings + block metadata). */
  info: unknown;
}

/** Timeframe string → seconds, matching the indexer's candle intervals. */
export const TIMEFRAMES: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

// ---------------------------------------------------------------- conversions

/**
 *  Human number → raw integer units: the value the caller typed, scaled to
 *  `decimals`. A number carrying more fraction digits than `decimals` is rounded
 *  to scale — same contract as {@link Units.fromHuman}, which does the work.
 *
 *  Rounding to scale can land ABOVE the caller's number, so a quantity that must
 *  not exceed a balance wants {@link snapToGrid}'s `strict` option, which
 *  truncates instead.
 */
export function toRaw(x: number, decimals: number): bigint {
  requireConvertibleAmount(x);
  return Units.fromHuman(x, decimals);
}

// The one definition of a convertible amount, shared by toRaw and floorToRaw so
// the two cannot drift.
function requireConvertibleAmount(x: number): void {
  if (!Number.isFinite(x) || x < 0) {
    throw new InvalidInputError(`invalid amount/price ${x}`);
  }
}

/** How {@link snapToGrid} treats a value that is a hair below a grid point. */
export interface SnapToGridOptions {
  /**
   *  Which way an off-grid value moves. `"down"` (the default) is right for a
   *  quantity, and for a price the caller must not exceed — a buy limit. `"up"`
   *  is right for a price the caller must not fall below: a sell limit, or a
   *  protective limit that has to stay crossing the level it was priced against.
   *  Rounding the wrong way is a real loss, not a formatting choice, so the
   *  direction belongs to the VALUE rather than to the market. `"up"` cannot be
   *  combined with `strict`, whose contract requires the result not to exceed
   *  the input.
   */
  direction?: "down" | "up";
  /**
   *  Bound the result inside `[step, one − step]`. For binary probability
   *  prices, which may not rest at 0 or 1.
   */
  clamp?: boolean;
  /**
   *  Never return more than `x`. Set it for a quantity bounded by something the
   *  caller cannot exceed — a wallet balance, a budget — where being a hair over
   *  is an on-chain revert. Clear (the default) for a price, where losing a whole
   *  tick to float noise is the worse failure. See Gotchas.
   */
  strict?: boolean;
}

/**
 *  Human number → raw integer units, TRUNCATING anything past `decimals` rather
 *  than rounding it.
 *
 *  {@link toRaw} rounds to scale (half away from zero), so an over-precise number
 *  becomes a raw value ABOVE it: `toRaw(0.1234567, 6)` is `123457`, i.e. 0.123457.
 *  Flooring onto a grid afterwards then starts from an inflated value and can land
 *  above the caller's own number — which is the revert `strict` exists to prevent.
 */
function floorToRaw(x: number, decimals: number): bigint {
  requireConvertibleAmount(x);
  // toFixed with a wider scale, then cut: the extra digits are the ones toRaw
  // would have rounded INTO the result. 100 is toFixed's documented maximum.
  const wide = Math.min(decimals + 20, 100);
  const fixed = x.toFixed(wide);
  if (fixed.includes("e") || fixed.includes("E")) {
    // toFixed gives up and returns exponent notation at 1e21 and above, where a
    // double can no longer resolve single units anyway. The non-strict path also
    // rejects these (parseUnits refuses exponent notation) — this keeps it our
    // typed error rather than a bare SyntaxError out of BigInt().
    throw new InvalidInputError(`amount/price ${x} is too large to convert exactly at ${decimals} decimals`);
  }
  const [whole, fraction = ""] = fixed.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0").slice(0, decimals));
}

/**
 *  Snap a human number onto a raw-units grid (tick or lot), returning the aligned
 *  human number. Rounds DOWN unless `direction: "up"` is passed.
 *
 *  The alignment happens entirely in bigint space, which is the only space the
 *  answer exists in: the grid is defined in raw integer units, and a float
 *  cannot hold most of its multiples at 18 decimals. Doing it as
 *  `Math.floor(x / tick) * tick` and re-printing with `toFixed` reintroduces the
 *  binary expansion that {@link Units.humanToDecimalString} exists to avoid, and
 *  produced off-tick values 16 times out of 19 on the live venue's ladder.
 *
 *  **Gotchas**
 *
 *  By default a value a hair BELOW a grid point is treated as sitting ON it,
 *  rather than snapped down a whole step. Callers arrive here with computed
 *  prices — a book mid like `(0.001 + 0.009) / 2` is `0.004999999999999999`, and
 *  flooring that to `0.004` would quote a full tick away from what the caller
 *  asked for, silently. The tolerance is one part in `2 ** 52` of the value,
 *  the double's own resolution.
 *
 *  That rounding is right for a price and WRONG for a quantity bounded above.
 *  The tolerance is relative, so it grows with magnitude, and a balance one wei
 *  under a lot boundary would be nudged past it — the "insufficient balance"
 *  revert {@link Units.balanceFloor} exists to prevent. Pass `strict` for those
 *  callers; the result is then never greater than `x`.
 */
export function snapToGrid(
  x: number,
  stepRaw: bigint,
  decimals: number,
  options: SnapToGridOptions = {},
): number {
  if (stepRaw <= 0n) {
    throw new InvalidInputError(`invalid grid step ${stepRaw}`);
  }
  const { clamp = false, strict = false, direction = "down" } = options;
  if (strict && direction === "up") {
    throw new InvalidInputError('snapToGrid cannot combine strict with direction "up"');
  }
  const one = 10n ** BigInt(decimals);
  // The clamp below needs room for a step on both sides of the range.
  if (clamp && stepRaw * 2n > one) {
    throw new InvalidInputError(`grid step ${stepRaw} exceeds half of one unit (${one})`);
  }
  const raw = strict ? floorToRaw(x, decimals) : toRaw(x, decimals);
  const remainder = raw % stepRaw;
  const shortfall = stepRaw - remainder;
  // Rounding UP subsumes the near-grid nudge: any remainder at all already moves
  // to the next grid point, so there is nothing for a tolerance to rescue.
  // Rounding DOWN nudges up when `raw` is within a ULP of the next grid point, so
  // the caller's own float error cannot cost a whole step — unless `strict`,
  // which must never return more than `x`. See Gotchas.
  const nudge =
    remainder !== 0n && (direction === "up" || (!strict && shortfall <= raw / 2n ** 52n));
  const aligned = nudge ? raw + shortfall : raw - remainder;
  if (!clamp) return toHumanNum(aligned, decimals);
  if (aligned < stepRaw) return toHumanNum(stepRaw, decimals);
  // The upper bound is floored onto the grid too: `one - stepRaw` is only itself
  // a grid point when the step divides one unit evenly (every real venue's does,
  // being a power of ten), and returning an off-grid price would defeat the whole
  // helper.
  const highest = ((one - stepRaw) / stepRaw) * stepRaw;
  if (aligned > highest) return toHumanNum(highest, decimals);
  return toHumanNum(aligned, decimals);
}

/**
 *  Raw integer units → human number (display/strategy precision).
 *
 *  Scales via the exact decimal string rather than `Number(raw) / 10 ** decimals`.
 *  The division is a float operation, so it could land a few wei off the value it
 *  was given: `19000000000000000000000` came back as `19000.000000000004`, which
 *  is no longer on a 1e15 grid. That silently un-aligned every quantized price
 *  {@link snapToGrid} had just aligned in bigint space, for about a quarter of
 *  ordinary prices above ~1000. The result is still a double, so it is still
 *  display-grade past ~15 significant digits — but it is now the closest double
 *  to the true value instead of the closest double to a lossy quotient.
 *
 *  A string argument must be a raw INTEGER string, which is what every caller
 *  passes: the indexer types all of these fields as `BigInt`, so they arrive as
 *  stringified integers. A decimal or exponent string ("1.5", "1e5") now throws
 *  from `BigInt()` where the old division silently returned a rescaled number —
 *  it was never a valid raw value, and failing loudly beats scaling it twice.
 */
export function toHumanNum(raw: string | bigint | null | undefined, decimals: number): number {
  if (raw === null || raw === undefined) return 0;
  return Number(formatUnits(BigInt(raw), decimals));
}

export function toDatetime(tsMs: number): string {
  return new Date(tsMs).toISOString();
}

/** Map the native order lifecycle onto the unified status vocabulary. */
export function toUnifiedStatus(status: string): UnifiedOrderStatus {
  switch (status) {
    case "Open":
      return "open";
    case "Filled":
      return "closed";
    case "Cancelled":
      return "canceled";
    case "Expired":
      return "expired";
    default:
      return "closed"; // "Closed" (spot pre-rest terminal) and anything unknown
  }
}

/**
 *  Decimal places implied by a raw step size (tick/lot) at `decimals` scale —
 *  e.g. tick 1000 at 6dp → 3 price decimals.
 */
export function precisionFromStep(step: string | null | undefined, decimals: number): number {
  const s = Number(step ?? "1");
  if (!Number.isFinite(s) || s <= 0) return decimals;
  const human = s / 10 ** decimals;
  const places = Math.ceil(-Math.log10(human));
  return Math.min(decimals, Math.max(0, places));
}
