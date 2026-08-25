// Derived reads — the P1 analytics bundle a frontend needs for a full-lifecycle
// up/down prediction-market product. Everything here is DERIVED from data the
// SDK already surfaces (the live book, candles, fills, portfolio) — no new
// indexer field. The pure kernels live here (testable in isolation over plain
// inputs); createClient.ts wires them to the live store + indexer reads.
//
// Unit conventions match the rest of the read surface: RAW integer units
// (collateral/outcome-token base units) as bigints; the caller formats with the
// market's `quoteDecimals` (never a hard-coded 6). YES/NO price inversion:
// a binary book is quoted in YES terms; the NO price is `oneCollateral − yesPrice`.

import type { BookLevel } from "./store.js";
import type { BinaryOrderBook } from "./orders.js";
import type { BinarySide } from "./store.js";
import type { BinaryMarket } from "./markets.js";
import type { RouterActionRecord } from "./router.js";
import type { Candle } from "./candles.js";
import type { FillRow } from "./fills.js";
import * as Units from "./units.js";
import type { YesBookTop } from "./units.js";

// ============================================================================
// B1 — quoteBinaryOrder: market-order preview over the live book
// ============================================================================

/**
 *  The result of quoting a market order against the live book — the
 *  "you'll pay ~$X, average Y, slippage Z" preview. All prices/amounts are RAW
 *  units in the OUTCOME's own terms (a BUY_NO quote is priced in NO terms).
 */
export interface BinaryOrderQuote {
  /**
   *  Volume-weighted average fill price (raw units per whole outcome token),
   *  in the quoted outcome's terms. `0n` if nothing fills.
   */
  avgPrice: bigint;
  /**
   *  Total cost for a BUY (raw collateral paid) / total proceeds for a SELL
   *  (raw collateral received) = Σ(levelQty × levelPrice) / oneCollateral.
   */
  cost: bigint;
  /**
   *  How much of `quantity` actually crosses the resting book (raw outcome
   *  units). Less than `quantity` when the book is too thin to fill it all.
   */
  filledQuantity: bigint;
  /**
   *  The unfilled remainder that would rest as a maker order (raw outcome
   *  units) — `quantity − filledQuantity`.
   */
  wouldRest: bigint;
  /** Number of price levels the order consumed (partially or fully). */
  levelsConsumed: number;
  /**
   *  Signed slippage of `avgPrice` vs the book mid, in raw price units
   *  (avgPrice − mid for a buy; mid − avgPrice for a sell — positive = worse
   *  than mid). `0n` if the book has no mid (a side is empty) or nothing fills.
   */
  slippageVsMid: bigint;
}

/**
 *  Pick the resting levels a market order on `side` crosses, in the outcome's
 *  own price terms. A BUY consumes the opposite side's ASKS; a SELL consumes the
 *  BIDS. The book already carries the NO sides pre-inverted (`toBinaryBook`), so
 *  BUY_NO simply consumes `noAsks` — no per-level inversion needed here.
 */
function levelsToCross(book: BinaryOrderBook, side: BinarySide): BookLevel[] {
  switch (side) {
    case "BUY_YES":
      return book.yesAsks;
    case "SELL_YES":
      return book.yesBids;
    case "BUY_NO":
      return book.noAsks;
    case "SELL_NO":
      return book.noBids;
  }
}

/**
 *  The book mid in the outcome's own terms: (bestBid + bestAsk) / 2. `null` if
 *  either side is empty (no two-sided market → no meaningful mid).
 */
function bookMid(book: BinaryOrderBook, side: BinarySide): bigint | null {
  const isNo = side === "BUY_NO" || side === "SELL_NO";
  const bids = isNo ? book.noBids : book.yesBids;
  const asks = isNo ? book.noAsks : book.yesAsks;
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  if (bestBid == null || bestAsk == null) return null;
  return (bestBid + bestAsk) / 2n;
}

/**
 *  Walk the live book crossing the opposite side for a market order of
 *  `quantity` on `side` — the pure kernel behind `client.quoteBinaryOrder`.
 *  `oneCollateral = 10^quoteDecimals` (full collateral = a share worth 1).
 */
export function quoteBinaryOrderOverBook(
  book: BinaryOrderBook,
  side: BinarySide,
  quantity: bigint,
  oneCollateral: bigint,
): BinaryOrderQuote {
  const levels = levelsToCross(book, side);
  let remaining = quantity > 0n ? quantity : 0n;
  let cost = 0n;
  let filled = 0n;
  let levelsConsumed = 0;
  for (const lvl of levels) {
    if (remaining <= 0n) break;
    const take = lvl.quantity < remaining ? lvl.quantity : remaining;
    if (take <= 0n) continue;
    // Cost in collateral = qty × price / oneCollateral (price is collateral per
    // WHOLE token; qty is raw token units).
    cost += (take * lvl.price) / oneCollateral;
    filled += take;
    remaining -= take;
    levelsConsumed++;
  }
  const avgPrice = filled > 0n ? (cost * oneCollateral) / filled : 0n;
  const mid = bookMid(book, side);
  const isBuy = side === "BUY_YES" || side === "BUY_NO";
  const slippageVsMid = mid != null && filled > 0n ? (isBuy ? avgPrice - mid : mid - avgPrice) : 0n;
  return {
    avgPrice,
    cost,
    filledQuantity: filled,
    wouldRest: quantity > filled ? quantity - filled : 0n,
    levelsConsumed,
    slippageVsMid,
  };
}

// ============================================================================
// B2 — getMarketStats24h: rolling 24h stats from candles
// ============================================================================

/**
 *  A market's trailing-24h activity, derived from OHLCV candle buckets. Prices
 *  are RAW quote units; volume is RAW quote (collateral) units.
 */
export interface MarketStats24h {
  /** Σ quote volume over the window (raw collateral units). */
  volume24h: bigint;
  /** Σ base/outcome-token volume over the window (raw base units). */
  baseVolume24h: bigint;
  /** Σ trade count over the window. */
  trades24h: number;
  /**
   *  closePrice(last) − openPrice(first) over the window (raw, signed). `0n`
   *  if fewer than one candle in-window.
   */
  priceChange24h: bigint;
  /** Max high across the window (raw). `null` if no candles in-window. */
  high24h: bigint | null;
  /** Min low across the window (raw). `null` if no candles in-window. */
  low24h: bigint | null;
  /** openPrice of the first in-window candle (raw). `null` if none. */
  openPrice24h: bigint | null;
}

/**
 *  Fold candle buckets whose `bucketStart >= nowSec − 86400` into a
 *  {@link MarketStats24h}. `candles` are oldest-first (as `getCandles` returns).
 *  Pure — the wiring in createClient just fetches the candles first.
 */
export function marketStats24hFromCandles(candles: Candle[], nowSec: number): MarketStats24h {
  const cutoff = nowSec - 86_400;
  const win = candles.filter((c) => Number(c.bucketStart) >= cutoff);
  const first = win[0];
  const last = win[win.length - 1];
  if (first === undefined || last === undefined) {
    return {
      volume24h: 0n,
      baseVolume24h: 0n,
      trades24h: 0,
      priceChange24h: 0n,
      high24h: null,
      low24h: null,
      openPrice24h: null,
    };
  }
  let volume24h = 0n;
  let baseVolume24h = 0n;
  let trades24h = 0;
  let high = BigInt(first.high);
  let low = BigInt(first.low);
  for (const c of win) {
    volume24h += BigInt(c.quoteVolume);
    baseVolume24h += BigInt(c.baseVolume);
    trades24h += c.tradeCount;
    const h = BigInt(c.high);
    const l = BigInt(c.low);
    if (h > high) high = h;
    if (l < low) low = l;
  }
  const openPrice24h = BigInt(first.openPrice);
  const closeLast = BigInt(last.closePrice);
  return {
    volume24h,
    baseVolume24h,
    trades24h,
    priceChange24h: closeLast - openPrice24h,
    high24h: high,
    low24h: low,
    openPrice24h,
  };
}

// ============================================================================
// B4 — getBinaryPositionPnL: avg-cost position PnL over a market's fills
// ============================================================================

/**
 *  An account's position + cost basis + PnL in one binary market, RAW units.
 *  ACCOUNTING ASSUMPTION: weighted-average cost. Cost basis is reconstructed
 *  from the account's order-book fills on the market (buys add cost at the
 *  fill's outcome price; sells realize against the running average) folded with
 *  mint/merge router actions (a complete-set mint adds one YES + one NO at the
 *  split cost `oneCollateral` total; a merge removes a pair at avg cost).
 *  `markValue`/`unrealizedPnl` mark the CURRENT balances to the book-clamped
 *  last price while trading (see {@link markYesPrice}), or to the settlement
 *  payout once resolved.
 */
export interface BinaryPositionPnL {
  /** Current YES outcome-token balance (raw). */
  balanceYes: bigint;
  /** Current NO outcome-token balance (raw). */
  balanceNo: bigint;
  /** Total remaining cost basis across both outcomes (raw collateral). */
  costBasis: bigint;
  /**
   *  Blended average cost per whole outcome token held (raw collateral per
   *  token). `0n` when nothing is held.
   */
  avgCost: bigint;
  /** Mark value of the current balances (raw collateral). */
  markValue: bigint;
  /** markValue − costBasis (raw, signed). */
  unrealizedPnl: bigint;
  /**
   *  Realized PnL from sells (proceeds − avg cost of tokens sold), raw signed.
   *  Best-effort over indexed order-book sell fills (see accounting note).
   */
  realizedPnl: bigint;
}

/**
 *  One position-affecting event for the PnL fold, in the account's perspective,
 *  RAW units. Buys/sells are per-outcome; a mint/merge touches BOTH outcomes.
 */
export interface PnLEvent {
  /** Order-book buy/sell of one outcome, or a router mint/merge of a complete set. */
  kind: "buy" | "sell" | "mint" | "merge";
  /** 0 = YES, 1 = NO. Ignored for mint/merge (they touch both). */
  outcomeIndex: 0 | 1;
  /** Token quantity (raw). For mint/merge this is the pair (set) amount. */
  quantity: bigint;
  /** Fill price for the fill's own outcome, raw. Ignored for mint/merge. */
  price: bigint;
}

/**
 *  Derive the {@link PnLEvent} stream for `account` from raw {@link FillRow}s
 *  (order-book fills) + {@link RouterActionRecord}s (mint/merge complete sets),
 *  merged into ONE oldest-first timeline by timestamp (so the avg-cost roll sees
 *  mints and fills in the order they happened). Fills whose side isn't bridged
 *  yet are skipped (can't attribute an outcome). Mint/merge use the record's
 *  `amount` (each outcome's set size). Redeem actions are ignored (they settle
 *  the position at payout, they don't change cost basis of a still-open book).
 */
export function pnlEventsFor(
  account: string,
  fills: FillRow[],
  routerActions: RouterActionRecord[],
): PnLEvent[] {
  const acct = account.toLowerCase();
  type Stamped = PnLEvent & { ts: number };
  const out: Stamped[] = [];
  for (const f of fills) {
    const isMaker = (f.maker ?? "").toLowerCase() === acct;
    // The account can occupy the taker seat two ways. `Fill.taker` is a
    // denormalized copy the PendingTakerFill bridge writes; the taker ORDER is
    // what the indexer has from the moment BinaryOrderPlaced lands. Matching on
    // the copy alone drops a fill the account genuinely took — silently, out of
    // its own COST BASIS — on any row the bridge has not finished.
    const isTaker =
      (f.taker ?? "").toLowerCase() === acct ||
      (f.takerOrder?.owner ?? "").toLowerCase() === acct;
    if (!isMaker && !isTaker) continue;
    // Same precedence as the taker seat above: the order is authoritative, the
    // fill's `takerSide` is the lagging copy.
    const side: BinarySide | null = isMaker ? f.makerSide : (f.takerOrder?.side ?? f.takerSide);
    if (side == null) continue; // side not bridged — skip rather than guess
    const outcomeIndex: 0 | 1 = side === "BUY_NO" || side === "SELL_NO" ? 1 : 0;
    const isBuy = side === "BUY_YES" || side === "BUY_NO";
    out.push({
      kind: isBuy ? "buy" : "sell",
      outcomeIndex,
      quantity: BigInt(f.quantity),
      price: BigInt(f.fillPrice), // YES-terms; inverted per-outcome in the fold
      ts: Number(f.timestamp),
    });
  }
  for (const a of routerActions) {
    if (a.account.toLowerCase() !== acct) continue;
    if (a.kind === "MintCompleteSet")
      out.push({ kind: "mint", outcomeIndex: 0, quantity: BigInt(a.amount), price: 0n, ts: Number(a.timestamp) });
    else if (a.kind === "MergeCompleteSet")
      out.push({ kind: "merge", outcomeIndex: 0, quantity: BigInt(a.amount), price: 0n, ts: Number(a.timestamp) });
    // Redeem: settles the position at payout — no cost-basis change; ignored.
  }
  out.sort((x, y) => x.ts - y.ts);
  return out.map(({ ts: _ts, ...e }) => e);
}

/**
 *  Fold a {@link PnLEvent} stream (oldest-first) + current balances into a
 *  {@link BinaryPositionPnL}, avg-cost basis, RAW units. `oneCollateral =
 *  10^quoteDecimals`. Prices arrive in YES terms; a NO event is re-expressed to
 *  NO terms (`oneCollateral − yesPrice`) here so the two books stay separate.
 */
export function computePositionPnL(
  events: PnLEvent[],
  balances: { balanceYes: bigint; balanceNo: bigint },
  market: Pick<BinaryMarket, "quoteDecimals" | "lastPrice" | "winningOutcome" | "voided">,
  oneCollateral: bigint,
  opts?: {
    /** Top of the YES book — clamps the mark to live quotes (see {@link markYesPrice}). */
    bookTop?: YesBookTop;
  },
): BinaryPositionPnL {
  // Per-outcome running book: qty held, total cost, realized (all raw).
  // A [yes, no] tuple indexed by 0 | 1 keeps lookups exact under
  // noUncheckedIndexedAccess.
  type SideBook = { qty: bigint; cost: bigint; realized: bigint };
  const book: [SideBook, SideBook] = [
    { qty: 0n, cost: 0n, realized: 0n },
    { qty: 0n, cost: 0n, realized: 0n },
  ];
  const applyBuy = (idx: 0 | 1, qty: bigint, price: bigint) => {
    book[idx].qty += qty;
    book[idx].cost += (qty * price) / oneCollateral;
  };
  const applySell = (idx: 0 | 1, qty: bigint, price: bigint) => {
    const b = book[idx];
    const avg = b.qty > 0n ? (b.cost * oneCollateral) / b.qty : 0n;
    const sold = qty < b.qty ? qty : b.qty;
    const proceeds = (sold * price) / oneCollateral;
    const costOut = (sold * avg) / oneCollateral;
    b.realized += proceeds - costOut;
    b.qty -= sold;
    b.cost -= costOut;
  };
  for (const e of events) {
    if (e.kind === "mint") {
      // A complete set: one YES + one NO for `oneCollateral` total → split evenly.
      const each = oneCollateral / 2n;
      applyBuy(0, e.quantity, each);
      applyBuy(1, e.quantity, each);
      continue;
    }
    if (e.kind === "merge") {
      const each = oneCollateral / 2n;
      applySell(0, e.quantity, each);
      applySell(1, e.quantity, each);
      continue;
    }
    // Order-book fill: price is YES-terms, re-express to the traded outcome.
    const price = e.outcomeIndex === 1 ? oneCollateral - e.price : e.price;
    if (e.kind === "buy") applyBuy(e.outcomeIndex, e.quantity, price);
    else applySell(e.outcomeIndex, e.quantity, price);
  }

  const held: [bigint, bigint] = [balances.balanceYes, balances.balanceNo];
  const yesMark = Units.markYesPrice(opts?.bookTop ?? {}, market.lastPrice) ?? 0n;
  const markFor = (idx: 0 | 1): bigint => {
    if (market.voided) return oneCollateral / 2n;
    if (market.winningOutcome != null) return market.winningOutcome === idx ? oneCollateral : 0n;
    return idx === 0 ? yesMark : oneCollateral - yesMark; // still trading → book-clamped last
  };

  let costBasis = 0n;
  let markValue = 0n;
  let realizedPnl = 0n;
  for (const idx of [0, 1] as const) {
    const b = book[idx];
    realizedPnl += b.realized;
    // Cost basis of the CURRENT balance: scale the fills-derived cost by the
    // actual held fraction (they can diverge if tokens moved outside the book).
    const avg = b.qty > 0n ? (b.cost * oneCollateral) / b.qty : 0n;
    const heldCost = (held[idx] * avg) / oneCollateral;
    costBasis += heldCost;
    markValue += (held[idx] * markFor(idx)) / oneCollateral;
  }

  const totalHeld = held[0] + held[1];
  const avgCost = totalHeld > 0n ? (costBasis * oneCollateral) / totalHeld : 0n;
  return {
    balanceYes: balances.balanceYes,
    balanceNo: balances.balanceNo,
    costBasis,
    avgCost,
    markValue,
    unrealizedPnl: markValue - costBasis,
    realizedPnl,
  };
}

// ============================================================================
// B5 — getClaimable: redeemable positions in resolved/voided markets
// ============================================================================

/**
 *  One redeemable outcome position in a settled market — shaped to feed
 *  straight into `trader.redeemMany({ entries: [...] })`.
 */
export interface ClaimablePosition {
  /** Market id (bytes32 hex) — `entries[].marketId` for redeemMany. */
  marketId: string;
  /** The market's pool address (lowercased). */
  pool: string;
  /** 0 = YES, 1 = NO — `entries[].outcomeIdx` for redeemMany. */
  outcomeIdx: 0 | 1;
  /** Redeemable outcome-token balance (raw) — `entries[].amount` for redeemMany. */
  amount: bigint;
  /**
   *  Estimated collateral payout net of the settlement fee (raw). Winner:
   *  amount × (1 − fee); voided: amount / 2 (both sides). Loser side: 0.
   */
  estPayout: bigint;
  /** Market lifecycle status driving the claim ("Resolved" | "Voided" | …). */
  status: string;
}

/** A settled binary position to evaluate for claimability. */
export interface ClaimableInput {
  /** Market id (bytes32 hex), passed through to the output. */
  marketId: string;
  /** The market's pool address, passed through to the output. */
  pool: string;
  /** 0 = YES, 1 = NO — which outcome this position holds. */
  outcomeIdx: 0 | 1;
  /** Held outcome-token balance (raw). Non-positive positions are dropped. */
  amount: bigint;
  /** Winning outcome (0/1) when resolved; null when voided/unresolved. */
  winningOutcome: number | null;
  /** True when the market voided — both sides then redeem at half. */
  voided: boolean;
  /** Market lifecycle status ("Resolved" | "Voided" | …), passed through to the output. */
  status: string;
  /** Settlement fee in bps (1 = 0.01%); the winner payout skims this. */
  settlementFeeBps: bigint;
}

/**
 *  Compute the estimated payout for one settled position (raw collateral).
 *  Winner: `amount × (10_000 − feeBps) / 10_000`; voided: `amount / 2`; loser: 0.
 */
export function estPayoutFor(input: ClaimableInput): bigint {
  if (input.voided) return input.amount / 2n;
  if (input.winningOutcome != null && input.winningOutcome === input.outcomeIdx) {
    const fee = input.settlementFeeBps < 0n ? 0n : input.settlementFeeBps;
    return (input.amount * (10_000n - fee)) / 10_000n;
  }
  return 0n; // loser side (or unresolved) → nothing to claim
}

/**
 *  Filter + shape settled positions into {@link ClaimablePosition}s. A position
 *  is claimable when the market is voided (both sides redeem at half) OR the
 *  position holds the winning outcome (redeem at 1 − fee). Loser-side and
 *  still-trading positions are dropped (nothing to claim).
 */
export function claimableFrom(inputs: ClaimableInput[]): ClaimablePosition[] {
  const out: ClaimablePosition[] = [];
  for (const i of inputs) {
    if (i.amount <= 0n) continue;
    const isWinner = i.winningOutcome != null && i.winningOutcome === i.outcomeIdx;
    if (!i.voided && !isWinner) continue; // loser or unresolved → skip
    out.push({
      marketId: i.marketId,
      // The type promises a lowercased pool; enforce it rather than relying on
      // the indexer wiring happening to feed lowercase rows.
      pool: i.pool.toLowerCase(),
      outcomeIdx: i.outcomeIdx,
      amount: i.amount,
      estPayout: estPayoutFor(i),
      status: i.status,
    });
  }
  return out;
}


// ============================================================================
// B6 — stake/sell market-order builders: size a crossing IOC from a collateral
// stake (buy) or unwind a position (sell), with a protective tick-aligned limit
// ============================================================================

/** Basis-point denominator (100% = 10,000 bps). */
const BPS_DENOMINATOR = 10_000n;

/** Default market-order slippage cushion, in bps of the crossing price. */
export const DEFAULT_SLIPPAGE_BPS = 300n;

/**
 *  Default minimum slippage cushion in ticks — keeps long-shot (low-priced)
 *  outcomes, where the bps fraction rounds to almost nothing, from getting
 *  near-zero slack.
 */
export const DEFAULT_SLIPPAGE_MIN_TICKS = 10n;

/**
 *  The price/quantity grid a BinaryPool enforces on orders, plus the slippage
 *  policy the stake/sell builders pad their protective limit with. `tickSize`
 *  and `lotSize` come from the pool's on-chain order-book parameters
 *  (`client.getBinaryBookParams`) — the pool rejects any price off the tick
 *  grid and any quantity off the lot grid (`InvalidQuantity`).
 */
export interface BinaryCrossingParams {
  /** Price increment (raw collateral units) — limits must be a multiple. */
  tickSize: bigint;
  /** Quantity increment (raw outcome-token units) — sizes must be a multiple. */
  lotSize: bigint;
  /**
   *  Smallest order size the pool accepts (raw outcome-token units) — a lot
   *  multiple that may exceed a single lot; the pool rejects anything smaller
   *  (`QuantityBelowMinimum`). Quotes that land below it return `null`.
   *  @defaultValue `0n` (no floor beyond the lot grid)
   */
  minQuantity?: bigint;
  /**
   *  Slippage cushion in bps of the crossing price.
   *  @defaultValue {@link DEFAULT_SLIPPAGE_BPS} (300 = 3%)
   */
  slippageBps?: bigint;
  /**
   *  Minimum slippage cushion in ticks.
   *  @defaultValue {@link DEFAULT_SLIPPAGE_MIN_TICKS} (10)
   */
  slippageMinTicks?: bigint;
}

/**
 *  Slippage cushion for a crossing `price` (raw, same units): the larger of the
 *  bps fraction and the fixed tick floor. A market IOC only crosses at or
 *  better than its protective limit, so pinning that limit to the exact
 *  crossing price means any tick of book churn between the quote and on-chain
 *  execution leaves it uncrossable — the order fills nothing. The cushion only
 *  widens how far the sweep will chase a moving book; fills still land at each
 *  resting level's own price.
 */
export function slippageForCrossing(
  price: bigint,
  tickSize: bigint,
  opts?: Pick<BinaryCrossingParams, "slippageBps" | "slippageMinTicks">,
): bigint {
  const bps = opts?.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const minTicks = opts?.slippageMinTicks ?? DEFAULT_SLIPPAGE_MIN_TICKS;
  const percent = (price * bps) / BPS_DENOMINATOR;
  const floor = minTicks * tickSize;
  return percent > floor ? percent : floor;
}

/** The buy sides of {@link BinarySide} — what a stake converts into. */
export type BinaryBuySide = "BUY_YES" | "BUY_NO";

/** The sell sides of {@link BinarySide} — what unwinds a position. */
export type BinarySellSide = "SELL_YES" | "SELL_NO";

/**
 *  A stake-sized market BUY, shaped to feed straight into
 *  `trader.placeOrder({ pool, side, price: yesPrice, quantity, orderType: ORDER_TYPE.MARKET })`.
 *  All values RAW units.
 */
export interface BinaryStakeQuote {
  /** The buy side quoted ("BUY_YES" | "BUY_NO"). */
  side: BinaryBuySide;
  /**
   *  Protective limit in YES terms (raw, tick-aligned) — what `placeOrder`
   *  takes. The deepest level the sweep touched plus the slippage cushion.
   */
  yesPrice: bigint;
  /**
   *  The same protective limit in the traded outcome's OWN terms (raw) — equals
   *  `yesPrice` for BUY_YES, `oneCollateral − yesPrice` for BUY_NO. Display this.
   */
  limitPrice: bigint;
  /**
   *  Outcome-token quantity bought (raw, lot-aligned) — the payout if this
   *  side wins.
   */
  quantity: bigint;
  /**
   *  Collateral the order escrows (raw) — `quantity × limitPrice`, rounded up.
   *  The max loss; never above the stake.
   */
  escrow: bigint;
}

/**
 *  Convert a collateral stake into a market BUY by walking the live book — so
 *  the quoted shares and payout match what the order will actually fill, not an
 *  optimistic top-of-book estimate. The inverse of
 *  {@link quoteBinaryOrderOverBook}: that sizes cost from a quantity; this
 *  sizes quantity from a collateral budget.
 *
 *  The sweep buys down the asks cheapest-first, accumulating shares while the
 *  escrow at the running protective price (the worst level touched) stays
 *  within the stake — the max loss never exceeds it. A pricier level lowers
 *  that ceiling, so the sweep naturally stops once the next level can't fit.
 *  The protective limit is then padded with a slippage cushion (so the IOC
 *  still crosses if the book ticks up before it lands), aligned UP to the tick
 *  grid, capped a tick below one collateral; the quantity is re-fit to the
 *  stake at the padded price and snapped DOWN to a whole lot, so the escrow
 *  can never exceed the stake.
 *
 *  Returns `null` when nothing is fillable — empty book, a stake too small to
 *  buy a single lot (or the pool's `minQuantity`), or degenerate grid params
 *  (`tickSize`/`lotSize`/`oneCollateral`/`stake` ≤ 0).
 *
 *  @param book - The live four-sided book (NO sides pre-inverted).
 *  @param side - "BUY_YES" (Up) or "BUY_NO" (Down).
 *  @param stake - Collateral budget, raw units.
 *  @param oneCollateral - `10^quoteDecimals` — one whole outcome share.
 *  @param params - The pool's tick/lot grid + slippage policy.
 */
export function quoteBinaryStakeOverBook(
  book: BinaryOrderBook,
  side: BinaryBuySide,
  stake: bigint,
  oneCollateral: bigint,
  params: BinaryCrossingParams,
): BinaryStakeQuote | null {
  const { tickSize, lotSize } = params;
  // Grid values are divisors below — misconfigured market data (a zero
  // tick/lot/oneCollateral) would throw or produce garbage. Bail to null.
  if (tickSize <= 0n || lotSize <= 0n || oneCollateral <= 0n || stake <= 0n) return null;

  const levels = side === "BUY_YES" ? book.yesAsks : book.noAsks;

  // Sweep cheapest-first, adding shares at each level while the escrow at the
  // running protective price (the worst level touched) stays within the stake.
  let quantity = 0n;
  let limit = 0n;
  for (const level of levels) {
    const { price, quantity: available } = level;
    // Skip unusable levels; a price outside (0, oneCollateral) isn't a real
    // book crossing and would break the escrow/quantity math.
    if (price <= 0n || price >= oneCollateral || available <= 0n) continue;

    // Most shares the stake can escrow if this level becomes the protective
    // price. Pricier levels only shrink this ceiling, so once it's at or below
    // what we already hold the sweep is done.
    const maxQuantity = (stake * oneCollateral) / price;
    if (maxQuantity <= quantity) break;

    const headroom = maxQuantity - quantity;
    const take = available < headroom ? available : headroom;
    quantity += take;
    limit = price;

    // Escrow ceiling hit partway through this level — deeper levels are only
    // pricier, so there's nothing more to buy within the stake.
    if (take < available) break;
  }
  if (quantity <= 0n || limit <= 0n) return null;

  // Pad the protective limit with slippage headroom, then snap it back onto
  // the tick grid — the pool rejects any price that isn't a tickSize multiple.
  // Round UP so the limit stays at or above every swept level (they all still
  // cross), then cap a tick below a full share.
  const maxPrice = oneCollateral - tickSize;
  const paddedRaw = limit + slippageForCrossing(limit, tickSize, params);
  const alignedUp = ((paddedRaw + tickSize - 1n) / tickSize) * tickSize;
  const paddedLimit = alignedUp > maxPrice ? maxPrice : alignedUp;
  if (paddedLimit <= 0n) return null;

  // Re-fit the quantity to the stake at the padded price and snap DOWN to a
  // whole lot — so escrow (quantity × padded price) stays within the stake
  // (the documented max loss) and the pool can't pull more than the user
  // committed. The pool rejects a non-lot quantity (`InvalidQuantity`).
  const affordable = (stake * oneCollateral) / paddedLimit;
  const capped = affordable < quantity ? affordable : quantity;
  const finalQuantity = (capped / lotSize) * lotSize;
  // The pool also enforces a minimum order size (a lot multiple, possibly
  // > 1 lot) — a lot-aligned quote below it would revert QuantityBelowMinimum.
  if (finalQuantity <= 0n || finalQuantity < (params.minQuantity ?? 0n)) return null;

  return {
    side,
    yesPrice: side === "BUY_YES" ? paddedLimit : oneCollateral - paddedLimit,
    limitPrice: paddedLimit,
    quantity: finalQuantity,
    escrow: (finalQuantity * paddedLimit + oneCollateral - 1n) / oneCollateral,
  };
}

/**
 *  A market SELL that unwinds an outcome position, shaped to feed straight into
 *  `trader.placeOrder({ pool, side, price: yesPrice, quantity, orderType: ORDER_TYPE.MARKET })`.
 *  All values RAW units. See {@link quoteBinaryStakeOverBook} for the family's
 *  full mental model.
 */
export interface BinarySellQuote {
  /** The sell side quoted ("SELL_YES" | "SELL_NO"). */
  side: BinarySellSide;
  /** Protective floor in YES terms (raw, tick-aligned) — what `placeOrder` takes. */
  yesPrice: bigint;
  /**
   *  The same protective floor in the sold outcome's OWN terms (raw) — the
   *  cushioned best bid. Display this.
   */
  limitPrice: bigint;
  /** Outcome-token quantity to sell (raw, lot-aligned) — the size submitted. */
  quantity: bigint;
  /**
   *  How much of `quantity` the resting bids at or above the floor can absorb
   *  (raw, ≤ `quantity`). The IOC cancels the rest unfilled — when this is
   *  short of `quantity`, show the user a partial-unwind warning instead of
   *  implying the whole position exits.
   */
  fillableQuantity: bigint;
  /**
   *  Collateral proceeds if `fillableQuantity` fills at the resting bids'
   *  own prices (raw, rounded down) — an estimate: bids can churn between
   *  the quote and execution.
   */
  estProceeds: bigint;
}

/**
 *  Build a market SELL that unwinds `quantity` of an outcome by crossing the
 *  resting bids, with a slippage cushion below the best bid — the sell-side
 *  sibling of {@link quoteBinaryStakeOverBook}.
 *
 *  Pinning the protective limit to the exact best bid means any tick of book
 *  churn between the quote and on-chain execution leaves the IOC uncrossable —
 *  a sell into a busy book fills nothing. The limit instead sits a cushion
 *  below the best bid, aligned DOWN to the tick grid (never below one tick):
 *  the order still fills each resting bid at its own price, best-first.
 *
 *  Unlike the buy side, `quantity` is NOT sized to the book — it's the
 *  caller's position, lot-aligned. The quote walks the crossable bids and
 *  reports `fillableQuantity`/`estProceeds` so a thin book surfaces as a
 *  partial unwind up front rather than a silent IOC cancel.
 *
 *  Returns `null` when there's nothing to sell (including a position below
 *  the pool's `minQuantity`) or no bid to cross — disable the Sell control
 *  rather than sending a doomed order.
 *
 *  @param book - The live four-sided book (NO sides pre-inverted).
 *  @param side - "SELL_YES" (Up position) or "SELL_NO" (Down position).
 *  @param quantity - Outcome-token quantity to sell, raw units (snapped down to the lot grid).
 *  @param oneCollateral - `10^quoteDecimals` — one whole outcome share.
 *  @param params - The pool's tick/lot grid + slippage policy.
 */
export function quoteBinarySellOverBook(
  book: BinaryOrderBook,
  side: BinarySellSide,
  quantity: bigint,
  oneCollateral: bigint,
  params: BinaryCrossingParams,
): BinarySellQuote | null {
  const { tickSize, lotSize } = params;
  if (tickSize <= 0n || lotSize <= 0n || oneCollateral <= 0n || quantity <= 0n) return null;

  const bestBid = (side === "SELL_YES" ? book.yesBids : book.noBids)[0]?.price;
  if (bestBid == null || bestBid <= 0n) return null;

  // Lowest price (in the sold side's own terms) the sweep will accept, aligned
  // down to the tick and never below one tick.
  const slip = slippageForCrossing(bestBid, tickSize, params);
  const floorRaw = bestBid > slip ? bestBid - slip : tickSize;
  const aligned = (floorRaw / tickSize) * tickSize;
  const floor = aligned < tickSize ? tickSize : aligned;

  const yesPrice = side === "SELL_YES" ? floor : oneCollateral - floor;
  if (yesPrice <= 0n || yesPrice >= oneCollateral) return null;

  // The pool rejects a non-lot quantity — snap down rather than revert; the
  // sub-lot dust remainder isn't sellable on the book anyway. Same for a
  // position below the pool's minimum order size (QuantityBelowMinimum).
  const lotQuantity = (quantity / lotSize) * lotSize;
  if (lotQuantity <= 0n || lotQuantity < (params.minQuantity ?? 0n)) return null;

  // Walk the crossable bids (best-first, at or above the floor) so the quote
  // reports what will actually fill — the buy side's honesty mirrored. The
  // order still submits `lotQuantity`; anything past `fillableQuantity` is
  // IOC-canceled, and the caller can warn about the partial unwind up front.
  const bids = side === "SELL_YES" ? book.yesBids : book.noBids;
  let fillableQuantity = 0n;
  let estProceeds = 0n;
  for (const { price, quantity: available } of bids) {
    if (price < floor) break; // sorted best-first — nothing deeper crosses
    if (price >= oneCollateral || available <= 0n) continue;
    const headroom = lotQuantity - fillableQuantity;
    if (headroom <= 0n) break;
    const take = available < headroom ? available : headroom;
    fillableQuantity += take;
    estProceeds += (take * price) / oneCollateral;
  }

  return { side, yesPrice, limitPrice: floor, quantity: lotQuantity, fillableQuantity, estProceeds };
}


// ============================================================================
// B8 — binary position views: book marks, entry/uPnL row math, lifecycle
// classification. Upstreamed from the DreamDex web app so portfolio rows on
// any frontend mark positions identically.
// ============================================================================

/**
 *  The mid YES price (raw) from the best book levels — `(bid + ask) / 2` when
 *  both sides are quoted, otherwise whichever single side exists. `undefined`
 *  when the book is empty. For an ODDS display; positions should mark with
 *  {@link markYesPrice} instead (a lone bid/ask is not a fair mark).
 */
export function midYesPrice(
  bestYesBid: bigint | undefined,
  bestYesAsk: bigint | undefined,
): bigint | undefined {
  if (bestYesBid !== undefined && bestYesAsk !== undefined) {
    return (bestYesBid + bestYesAsk) / 2n;
  }
  return bestYesAsk ?? bestYesBid;
}

// NOTE: the mark-to-market counterpart, `Units.markYesPrice`, lives in units.ts —
// the same mid-when-two-sided rule, plus the one-sided clamp (a live quote
// beyond a stale last print supersedes it). It is re-exported from the barrel.

/** The one slice of a portfolio trade the entry-price math needs. */
export interface EntryTrade {
  /** The account's side on the fill, or null when not yet bridged. */
  side: BinarySide | null;
  /** Fill price in YES terms (raw collateral units per whole outcome token). */
  fillPrice: string;
  /** Outcome-token quantity filled (raw units). */
  quantity: string;
}

/**
 *  Average entry price for a YES/NO position, in the outcome's OWN terms (raw),
 *  derived from the wallet's BUY fills on that outcome. A binary fill's
 *  `fillPrice` is always YES-terms, so the NO leg enters at the complement.
 *  Only buys are averaged — this is the cost basis an unrealized-PnL display
 *  compares the live mark against. Returns `null` when there are no matching
 *  buys (show a dash, not a bogus 0 that reads as +100%). NOTE: complete-set
 *  mints don't appear in fills; positions built by mint+sell carry a
 *  fills-only basis here, same as {@link computePositionPnL} without router
 *  actions.
 */
export function averageEntryPrice(input: {
  trades: readonly EntryTrade[];
  /** 0 = YES, 1 = NO. */
  outcomeIndex: number;
  /** `10 ** decimals` — one whole outcome share in raw terms. */
  oneShare: bigint;
}): bigint | null {
  const { trades, outcomeIndex, oneShare } = input;
  const isYes = outcomeIndex === 0;
  const buySide: BinarySide = isYes ? "BUY_YES" : "BUY_NO";

  let weightedCost = 0n;
  let totalQuantity = 0n;
  for (const trade of trades) {
    if (trade.side !== buySide) continue;
    let quantity: bigint;
    let yesPrice: bigint;
    try {
      quantity = BigInt(trade.quantity);
      yesPrice = BigInt(trade.fillPrice);
    } catch {
      continue;
    }
    if (quantity <= 0n) continue;
    weightedCost += (isYes ? yesPrice : oneShare - yesPrice) * quantity;
    totalQuantity += quantity;
  }

  if (totalQuantity <= 0n) return null;
  return weightedCost / totalQuantity;
}

/**
 *  Live mark price for one outcome in its own terms (raw): YES marks at the
 *  YES mid, NO at the complement. `undefined` when there's no mid to mark to.
 */
export function outcomeMarkPrice(input: {
  outcomeIndex: number;
  /** YES mark (raw), e.g. from {@link markYesPrice}. */
  yesMid: bigint | undefined;
  oneShare: bigint;
}): bigint | undefined {
  const { outcomeIndex, yesMid, oneShare } = input;
  if (yesMid === undefined) return undefined;
  return outcomeIndex === 0 ? yesMid : oneShare - yesMid;
}

/** An outcome position marked to a live price — one portfolio row's numbers. */
export interface OutcomePositionMark {
  /** Current position value in collateral (raw): `balance × mark`. */
  value: bigint;
  /** Unrealized PnL in collateral (raw), or `null` when entry is unknown. */
  upnl: bigint | null;
  /** Unrealized PnL as a signed fraction (0.12 = +12%), or `null`. */
  upnlFraction: number | null;
}

/**
 *  Mark an outcome position: `value = balance × mark`, `upnl = balance ×
 *  (mark − avgEntry)`. When `avgEntry` is unknown (no buys indexed yet) only
 *  `value` is computed and the PnL fields stay `null` — a dash beats an
 *  invented zero basis.
 */
export function markOutcomePosition(input: {
  /** Outcome-token balance held (raw units). */
  balance: bigint;
  /** Live mark price in the outcome's own terms (raw). */
  markPrice: bigint;
  /** Average entry price in the outcome's own terms (raw), or `null`. */
  avgEntry: bigint | null;
  oneShare: bigint;
}): OutcomePositionMark {
  const { balance, markPrice, avgEntry, oneShare } = input;
  const value = (balance * markPrice) / oneShare;

  if (avgEntry === null || avgEntry <= 0n) {
    return { upnl: null, upnlFraction: null, value };
  }

  return {
    upnl: (balance * (markPrice - avgEntry)) / oneShare,
    upnlFraction: Number(markPrice - avgEntry) / Number(avgEntry),
    value,
  };
}

/**
 *  How a position should be marked, given its market's lifecycle:
 *
 *  - `"live"` — still trading; mark to the live book.
 *  - `"won"` / `"lost"` — resolved; this outcome pays 1 or 0.
 *  - `"voided"` — cancelled; collateral refunds, zero PnL.
 *  - `"settling"` — expired but unresolved; no reliable mark exists.
 */
export type PositionMarkState = "live" | "won" | "lost" | "voided" | "settling";

/**
 *  Statuses meaning the resolution is on record. The indexer supersedes
 *  on-chain `"Resolved"` with the derived terminal `"Finalized"` in the same
 *  breath as resolution — matching only `"Resolved"` leaves every concluded
 *  position stuck on "Settling".
 */
const RESOLVED_STATUSES: ReadonlySet<string> = new Set(["Resolved", "Finalized"]);

/**
 *  Classify how a position marks from its market's status/resolution: a
 *  resolved market pays its winning outcome, a voided one refunds, a
 *  still-trading one marks live, and anything expired-but-unresolved is
 *  settling (marking to a stale book there flashes phantom PnL).
 */
export function positionMarkState(input: {
  /** BinaryMarketStatus string from the market row. */
  status: string;
  voided: boolean;
  /** Winning outcome index (0 = YES, 1 = NO), or null until resolved. */
  winningOutcome: number | null | undefined;
  outcomeIndex: number;
  /** Market expiry (unix seconds). */
  expirySec: number;
  /** Reference "now" (unix seconds). */
  nowSec: number;
}): PositionMarkState {
  const { status, voided, winningOutcome, outcomeIndex, expirySec, nowSec } = input;

  if (voided || status === "Voided") return "voided";
  if (RESOLVED_STATUSES.has(status)) {
    if (winningOutcome == null) return "settling";
    return winningOutcome === outcomeIndex ? "won" : "lost";
  }
  // Not yet resolved: still live until expiry, then awaiting settlement.
  return Number.isFinite(expirySec) && expirySec <= nowSec ? "settling" : "live";
}
