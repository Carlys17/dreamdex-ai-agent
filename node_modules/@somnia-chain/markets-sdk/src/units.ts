// Unit helpers. Money crosses this SDK as raw integers (bigint on the write side,
// decimal strings from the indexer) scaled by a token's decimals — never as
// human floats. These convert at the edges so callers stop hand-rolling
// `value / 10 ** decimals` and `BigInt(Math.round(x * 1e6))` (which silently lose
// precision or overflow). Prefer `fromHuman` for input and `toHuman` for display.

import { formatUnits, parseUnits } from "viem";
import { InvalidInputError } from "./errors.js";
import type { BinarySide } from "./store.js";
import * as Store from "./store.js";
import type { OutcomeBalances, PortfolioTrade } from "./binary/portfolio.js";
import type { BinaryMarket } from "./markets.js";
import type { FillRow } from "./fills.js";

/**
 *  Raw integer (string or bigint) → human number for DISPLAY ONLY. Lossy past
 *  ~15 significant digits (it's an IEEE double) — never round-trip money through
 *  this; use it for labels/charts. `decimals` defaults to the demo's 6 (tUSDC),
 *  but pass the market's real `quoteDecimals`/`baseDecimals` when you have them.
 */
export function toHuman(raw: bigint | string, decimals: number = Store.DECIMALS): number {
  return Number(formatUnits(BigInt(raw), decimals));
}

/**
 *  Raw integer → exact human STRING (no precision loss). For display where you
 *  want the full value, or to feed another decimal library.
 */
export function toHumanString(raw: bigint | string, decimals: number = Store.DECIMALS): string {
  return formatUnits(BigInt(raw), decimals);
}

/**
 *  Human amount (number or decimal string) → raw bigint at `decimals`, for the
 *  write API (`placeOrder` price/quantity, `mintSet` amount, …). Accepts a string
 *  to avoid float rounding (`fromHuman("0.1")`), or a number for convenience.
 *
 *  **Gotchas**
 *
 *  A number carrying more fraction digits than `decimals` is ROUNDED to scale
 *  (half-away-from-zero, via `toFixed`): `fromHuman(0.1234567, 6)` is
 *  `123457n`. That is a deliberate, long-standing choice — the alternative
 *  (throwing) would reject ordinary computed values like a mid price. Pass a
 *  string when you need the exact value preserved or rejected instead.
 */
export function fromHuman(human: number | string, decimals: number = Store.DECIMALS): bigint {
  if (typeof human === "number" && !Number.isFinite(human)) {
    // Otherwise "Infinity"/"NaN" reaches parseUnits and surfaces as viem's
    // InvalidDecimalNumberError — a third-party error crossing our boundary.
    throw new InvalidInputError(`amount must be a finite number, got ${human}`);
  }
  return parseUnits(typeof human === "number" ? humanToDecimalString(human, decimals) : human, decimals);
}

/**
 *  A JS number → a plain decimal string at most `decimals` places wide, which is
 *  what `parseUnits` accepts (it rejects "1e-7" exponent notation and mantissas
 *  longer than `decimals`).
 *
 *  Use this for every number → raw conversion in the SDK, so the write path has
 *  ONE definition of "the value the caller typed". `toFixed(decimals)` alone is
 *  not that: it prints the float's binary expansion rather than the number the
 *  caller wrote, so at 18 decimals `(0.05).toFixed(18)` is
 *  "0.050000000000000003". Three wei is enough to miss a 1e15 tick and have the
 *  pool reject the order with `InvalidPrice` — so on an 18-decimal venue almost
 *  every ordinary probability was unplaceable through the number path, while a
 *  6-decimal venue (where the expansion rounds away) never showed it.
 *
 *  `String(n)` gives the shortest representation that round-trips to the same
 *  double, i.e. the number the caller meant ("0.05"). Prefer it whenever it fits
 *  the scale, and keep `toFixed` for the two cases it exists for: exponent
 *  notation, and a mantissa longer than the token's decimals (which it rounds to
 *  scale — see `fromHuman`'s Gotchas).
 *
 *  Note this fixes only conversion, not arithmetic done before it: a caller who
 *  computes `3 * 0.05` hands over `0.15000000000000002`, a genuinely different
 *  number, and gets it converted faithfully. Snapping a COMPUTED price onto the
 *  venue's grid is `exchange.priceToPrecision`'s job.
 */
export function humanToDecimalString(n: number, decimals: number): string {
  const shortest = String(n);
  if (!shortest.includes("e") && !shortest.includes("E")) {
    const fractionDigits = shortest.split(".")[1]?.length ?? 0;
    if (fractionDigits <= decimals) return shortest;
  }
  return n.toFixed(decimals);
}

// ---- binary-market price <-> probability ----
// A binary YES limit price is raw collateral per whole outcome token: full
// collateral (10^decimals) buys a share worth 1, so price / 10^decimals is the
// YES probability in [0, 1]. NO probability is the complement.

/** Raw YES price → YES probability in [0, 1]. */
export function priceToProbability(rawPrice: bigint | string, decimals: number = Store.DECIMALS): number {
  return toHuman(rawPrice, decimals);
}

/** YES probability in [0, 1] → raw YES price (the `price` field of placeOrder). */
export function probabilityToPrice(probability: number, decimals: number = Store.DECIMALS): bigint {
  // Stated as "in range" rather than "out of range" so NaN — false for both
  // `< 0` and `> 1` — is rejected here instead of falling through.
  if (!(probability >= 0 && probability <= 1)) {
    throw new InvalidInputError(`probability must be in [0, 1], got ${probability}`);
  }
  return fromHuman(probability, decimals);
}

// ---- binary mark price (book-clamped last) ----

/**
 *  Best YES bid/ask of a binary book (raw quote units), for marking a position.
 *  Either side may be absent on a one-sided book. Feed it the top level of
 *  `getBinaryOrderBook` / `getLiveBinaryOrderBook`.
 */
export interface YesBookTop {
  /** Best resting YES bid (raw), if any. */
  bestBid?: bigint;
  /** Best resting YES ask (raw), if any. */
  bestAsk?: bigint;
}

/**
 *  Mark-to-market YES price (raw): the book mid when two-sided, otherwise the
 *  last trade clamped into the surviving side's bound. The clamp reconciles the
 *  two failure modes of a one-sided book: marking to the lone quote outright
 *  flashes the full bid-ask spread as a loss right after a taker clears the top
 *  of the book, while marking to the last trade alone freezes the mark at a
 *  stale print when the market genuinely runs away — a resting quote BEYOND the
 *  last print is live, executable information and supersedes it. With no last
 *  trade the lone side is all there is; `null` only when the book is empty and
 *  nothing has traded.
 */
export function markYesPrice(top: YesBookTop, lastPrice: bigint | string | null | undefined): bigint | null {
  const { bestBid, bestAsk } = top;
  if (bestBid != null && bestAsk != null) return (bestBid + bestAsk) / 2n;
  const last = lastPrice != null ? BigInt(lastPrice) : null;
  if (last == null) return bestAsk ?? bestBid ?? null;
  if (bestBid != null && last < bestBid) return bestBid;
  if (bestAsk != null && last > bestAsk) return bestAsk;
  return last;
}

// ---- binary PnL (pure, avg-cost basis) ----

/**
 *  One outcome leg's slice of a {@link BinaryPnl}. HUMAN numbers
 *  (quote/collateral units) throughout — display-grade, like {@link toHuman}.
 */
export interface BinaryOutcomePnl {
  /** Realized on this outcome's sells: proceeds − avg cost of the tokens sold. */
  realized: number;
  /** The remaining balance marked to `mark`, minus its avg cost. */
  unrealized: number;
  /** Average cost per token of the fills-derived holding; 0 when none held. */
  avgCost: number;
  /**
   *  The price this leg is valued at: the book-clamped last while trading (see
   *  {@link markYesPrice}; the NO leg at its complement), or the settlement
   *  payout (1 / 0, or 0.5 voided) once resolved.
   */
  mark: number;
  /** Mark value of the current balance: `balance × mark`. */
  value: number;
}

/**
 *  Realized + unrealized PnL for one account in one binary market, computed
 *  purely from its fills + current outcome balances + the market row. Returns
 *  HUMAN numbers (quote/collateral units), keyed per outcome (YES/NO) plus a
 *  combined total — display-grade, like {@link toHuman}.
 */
export interface BinaryPnl {
  /** PnL attributable to the YES outcome (human quote units). */
  yes: BinaryOutcomePnl;
  /** PnL attributable to the NO outcome (human quote units). */
  no: BinaryOutcomePnl;
  /** yes.realized + no.realized. */
  realized: number;
  /** yes.unrealized + no.unrealized. */
  unrealized: number;
  /** realized + unrealized. */
  total: number;
}

/**
 *  One account-perspective fill for {@link computeBinaryPnl}: which outcome, how
 *  many tokens, at what raw YES-terms price, and whether the account BOUGHT.
 */
export interface BinaryPnlFill {
  /** 0 = YES, 1 = NO. */
  outcomeIndex: number;
  /** True = the account bought (added) this outcome; false = sold (reduced). */
  isBuy: boolean;
  /** Fill quantity, raw outcome-token units (decimal string or bigint). */
  quantity: string | bigint;
  /** Fill price for the fill's own outcome, raw quote units (0..10^decimals). */
  price: string | bigint;
}

/**
 *  Derive per-account {@link BinaryPnlFill}s from the raw {@link FillRow}s the
 *  indexer returns (as from `getUserFills`), from `account`'s perspective.
 *  Skips fills whose side/kind the indexer hasn't fully bridged (unknown side),
 *  and re-expresses the fill's price into the outcome the account traded (the
 *  book is YES-terms; a NO trade prices at `1 − yesPrice`).
 */
export function binaryFillsFor(
  account: string,
  fills: FillRow[],
  decimals: number = Store.DECIMALS,
): BinaryPnlFill[] {
  const acct = account.toLowerCase();
  const one = 10n ** BigInt(decimals);
  const out: BinaryPnlFill[] = [];
  for (const f of fills) {
    const isMaker = (f.maker ?? "").toLowerCase() === acct;
    // Two ways to hold the taker seat on binary: `taker` is a denormalized copy
    // the PendingTakerFill bridge writes, while the taker ORDER is authoritative
    // from the moment BinaryOrderPlaced lands. Matching the copy alone drops a
    // fill the account genuinely took — out of its own PnL, silently.
    const isTaker =
      (f.taker ?? "").toLowerCase() === acct ||
      (f.takerOrder?.owner ?? "").toLowerCase() === acct;
    if (!isMaker && !isTaker) continue;
    // Same precedence: the order is authoritative, the fill's copy lags it.
    const side: BinarySide | null = isMaker ? f.makerSide : (f.takerOrder?.side ?? f.takerSide);
    if (side == null) continue; // side not yet bridged — skip rather than guess
    // BinarySide encodes BOTH the outcome and the direction (BUY_YES / SELL_NO / …).
    const outcomeIndex = side === "BUY_NO" || side === "SELL_NO" ? 1 : 0;
    const isBuy = side === "BUY_YES" || side === "BUY_NO";
    const yesPrice = BigInt(f.fillPrice);
    const price = outcomeIndex === 1 ? one - yesPrice : yesPrice;
    out.push({ outcomeIndex, isBuy, quantity: f.quantity, price: price.toString() });
  }
  return out;
}

/**
 *  Derive {@link BinaryPnlFill}s from one market's slice of a portfolio's
 *  trades (as from `getPortfolio`). The portfolio view already resolves the
 *  account's own side per fill, so this only re-expresses the YES-terms
 *  `fillPrice` into the traded outcome (a NO trade prices at `1 − yesPrice`)
 *  and skips fills whose side the indexer hasn't bridged yet.
 */
export function binaryFillsFromPortfolio(
  trades: PortfolioTrade[],
  decimals: number = Store.DECIMALS,
): BinaryPnlFill[] {
  const one = 10n ** BigInt(decimals);
  const out: BinaryPnlFill[] = [];
  for (const t of trades) {
    if (t.side == null) continue; // side not yet bridged — skip rather than guess
    const outcomeIndex = t.side === "BUY_NO" || t.side === "SELL_NO" ? 1 : 0;
    const isBuy = t.side === "BUY_YES" || t.side === "BUY_NO";
    const yesPrice = BigInt(t.fillPrice);
    const price = outcomeIndex === 1 ? one - yesPrice : yesPrice;
    out.push({ outcomeIndex, isBuy, quantity: t.quantity, price: price.toString() });
  }
  return out;
}

/**
 *  Realized + unrealized binary PnL for one account, avg-cost basis — a PURE
 *  helper (no indexer/chain dependency). `fills` are the account's own trades
 *  (from {@link binaryFillsFor}); `balances` its current YES/NO holdings (from
 *  `getOutcomeBalances`); `market` supplies decimals + resolution state.
 *
 *  Realized PnL accrues on sells (proceeds − avg cost of the tokens sold).
 *  Unrealized marks the remaining position: to the book-clamped last price
 *  while trading (see {@link markYesPrice}; pass `opts.bookTop` so a live
 *  quote beyond a stale print corrects the mark), and to the settlement payout
 *  (1 for the winning outcome, 0 for the loser, 0.5 each when voided) once
 *  resolved.
 */
export function computeBinaryPnl(
  fills: BinaryPnlFill[],
  balances: OutcomeBalances,
  market: Pick<BinaryMarket, "quoteDecimals" | "lastPrice" | "winningOutcome" | "voided">,
  opts?: {
    /** Top of the YES book — clamps the mark to live quotes (see {@link markYesPrice}). */
    bookTop?: YesBookTop;
  },
): BinaryPnl {
  const decimals = market.quoteDecimals ?? Store.DECIMALS;
  const scale = 10 ** decimals;
  // Per-outcome running avg-cost book: qty held (human) + total cost (human).
  // A [yes, no] tuple indexed by a narrowed 0 | 1, so lookups stay exact under
  // noUncheckedIndexedAccess.
  type SideBook = { qty: number; cost: number; realized: number };
  const book: [SideBook, SideBook] = [
    { qty: 0, cost: 0, realized: 0 },
    { qty: 0, cost: 0, realized: 0 },
  ];
  // Fills are applied oldest-first for a correct avg-cost roll; the indexer
  // reads are newest-first, so reverse a shallow copy.
  for (const f of [...fills].reverse()) {
    const idx = f.outcomeIndex === 1 ? 1 : 0;
    const qty = Number(BigInt(f.quantity)) / scale;
    const px = Number(BigInt(f.price)) / scale;
    const b = book[idx];
    if (f.isBuy) {
      b.qty += qty;
      b.cost += qty * px;
    } else {
      const avg = b.qty > 0 ? b.cost / b.qty : 0;
      const sold = Math.min(qty, b.qty);
      b.realized += (px - avg) * sold;
      b.qty -= sold;
      b.cost -= avg * sold;
    }
  }

  const heldYes = Number(BigInt(balances.yes)) / scale;
  const heldNo = Number(BigInt(balances.no)) / scale;
  const held: [number, number] = [heldYes, heldNo];

  const resolved = market.winningOutcome != null || market.voided;
  const yesMarkRaw = markYesPrice(opts?.bookTop ?? {}, market.lastPrice);
  const yesMark = yesMarkRaw != null ? Number(yesMarkRaw) / scale : 0;
  const markFor = (idx: 0 | 1): number => {
    if (market.voided) return 0.5;
    if (market.winningOutcome != null) return market.winningOutcome === idx ? 1 : 0;
    return idx === 0 ? yesMark : 1 - yesMark; // still trading → book-clamped last
  };

  const sidePnl = (idx: 0 | 1): BinaryOutcomePnl => {
    const b = book[idx];
    const avg = b.qty > 0 ? b.cost / b.qty : 0;
    // Mark the CURRENT balance (authoritative), not the fills-derived qty — they
    // can diverge if the account moved tokens outside the order book.
    const mark = markFor(idx);
    const unrealized = resolved ? held[idx] * mark - avg * Math.min(held[idx], b.qty) : (mark - avg) * held[idx];
    return { realized: b.realized, unrealized, avgCost: avg, mark, value: held[idx] * mark };
  };

  const yes = sidePnl(0);
  const no = sidePnl(1);
  const realized = yes.realized + no.realized;
  const unrealized = yes.unrealized + no.unrealized;
  return {
    yes,
    no,
    realized,
    unrealized,
    total: realized + unrealized,
  };
}

/** Guard so a `Number` that rounded up past the balance can't loop forever. */
const MAX_NUDGE_STEPS = 8;

/**
 *  Convert a raw balance to the largest JS number that does not exceed it —
 *  full token precision, no lot/display quantum. `Number(formatUnits(raw))`
 *  rounds to nearest, so on high-precision balances it can land a ULP above
 *  the true value; this nudges the result down until it round-trips back to
 *  ≤ `raw`. Size "max" orders against this, never against a
 *  nearest-rounded conversion — a max that exceeds the wallet by one ULP is
 *  an on-chain "insufficient balance" revert.
 */
export function balanceFloor(raw: bigint, decimals: number = Store.DECIMALS): number {
  if (raw <= 0n) return 0;

  let candidate = Number(formatUnits(raw, decimals));

  for (let step = 0; step < MAX_NUDGE_STEPS; step += 1) {
    let asRaw: bigint;
    try {
      asRaw = parseUnits(candidate.toFixed(decimals), decimals);
    } catch {
      // Round-trip verification unavailable (toFixed exponent notation on
      // huge balances, or decimals beyond toFixed's range) — back off below
      // the nearest-rounding error bound so the result provably sits under
      // the true balance rather than trusting an unverified candidate.
      return candidate * (1 - 2 * Number.EPSILON);
    }
    if (asRaw <= raw) return candidate;
    candidate -= Math.max(Math.abs(candidate) * Number.EPSILON, Number.MIN_VALUE);
  }

  // Nudges exhausted without a verified round-trip — same provable back-off.
  return candidate * (1 - 2 * Number.EPSILON);
}

/**
 *  Floor a raw on-chain balance to a whole multiple of `quantum` (a human
 *  decimal string — the market's lot size for base amounts, or a display
 *  precision like "0.01" for quote) and return it as a JS number that is
 *  provably ≤ the true balance. Flooring happens in raw (bigint) space, so
 *  float rounding can never push a "max" order above the wallet.
 */
export function floorRawBalance(raw: bigint, decimals: number, quantum: string): number {
  if (raw <= 0n) return 0;

  let step: bigint;
  try {
    step = parseUnits(quantum, decimals);
  } catch {
    step = 0n;
  }

  if (step <= 0n) return balanceFloor(raw, decimals);

  return balanceFloor((raw / step) * step, decimals);
}

/**
 *  Ceil a raw on-chain amount UP to a whole multiple of `quantum` (a human
 *  decimal string — the market's lot size for base amounts, or a display
 *  precision like "0.01" for quote). The mirror of {@link floorRawBalance},
 *  for sizing a **minimum**: a minimum rounded DOWN falls below what the pool
 *  requires and the order is rejected as under the minimum — the exact mirror
 *  of the max-order revert the floors prevent. An amount below one quantum
 *  rises to one whole quantum rather than collapsing to `0` the way the floor
 *  does.
 *
 *  Returns a `bigint`, unlike the floors, which return `number`. A minimum is
 *  checked against the lot boundary exactly, and no `double` can hold one: the
 *  nearest `double` to `0.1` at 18 decimals sits tens of wei off, which puts it
 *  below the minimum itself. Convert at the edge if you need a number —
 *  `Number(formatUnits(result, decimals))`.
 */
export function ceilRawAmount(raw: bigint, decimals: number, quantum: string): bigint {
  if (raw <= 0n) return 0n;

  let step: bigint;
  try {
    step = parseUnits(quantum, decimals);
  } catch {
    step = 0n;
  }

  // `<= 0n`, not `=== 0n`: parseUnits ACCEPTS "-0.1" and returns a negative
  // step, which would quantize a minimum downward — the revert this prevents.
  if (step <= 0n) return raw;

  // Round away from zero: only add a step when `raw` is not already on the grid.
  return ((raw + step - 1n) / step) * step;
}

/**
 *  Market-implied **Up** probability in [0, 1] from a raw YES price, or `null`
 *  when the price is missing/unusable. One source for header stats and trade
 *  rails so they always agree — pass the book mid, falling back to last price.
 */
export function upProbability(
  rawYes: bigint | string | null | undefined,
  decimals: number | undefined,
): number | null {
  if (rawYes == null || decimals == null) return null;
  const probability = priceToProbability(rawYes, decimals);
  return Number.isFinite(probability) ? probability : null;
}

/** The Up probability as a whole-percent integer (e.g. `0.546` → `55`). */
export function upPercent(
  rawYes: bigint | string | null | undefined,
  decimals: number | undefined,
): number | null {
  const probability = upProbability(rawYes, decimals);
  return probability == null ? null : Math.round(probability * 100);
}
