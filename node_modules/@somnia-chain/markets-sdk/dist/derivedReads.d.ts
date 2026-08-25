import type { BinaryOrderBook } from "./orders.js";
import type { BinarySide } from "./store.js";
import type { BinaryMarket } from "./markets.js";
import type { RouterActionRecord } from "./router.js";
import type { Candle } from "./candles.js";
import type { FillRow } from "./fills.js";
import type { YesBookTop } from "./units.js";
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
 *  Walk the live book crossing the opposite side for a market order of
 *  `quantity` on `side` — the pure kernel behind `client.quoteBinaryOrder`.
 *  `oneCollateral = 10^quoteDecimals` (full collateral = a share worth 1).
 */
export declare function quoteBinaryOrderOverBook(book: BinaryOrderBook, side: BinarySide, quantity: bigint, oneCollateral: bigint): BinaryOrderQuote;
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
export declare function marketStats24hFromCandles(candles: Candle[], nowSec: number): MarketStats24h;
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
export declare function pnlEventsFor(account: string, fills: FillRow[], routerActions: RouterActionRecord[]): PnLEvent[];
/**
 *  Fold a {@link PnLEvent} stream (oldest-first) + current balances into a
 *  {@link BinaryPositionPnL}, avg-cost basis, RAW units. `oneCollateral =
 *  10^quoteDecimals`. Prices arrive in YES terms; a NO event is re-expressed to
 *  NO terms (`oneCollateral − yesPrice`) here so the two books stay separate.
 */
export declare function computePositionPnL(events: PnLEvent[], balances: {
    balanceYes: bigint;
    balanceNo: bigint;
}, market: Pick<BinaryMarket, "quoteDecimals" | "lastPrice" | "winningOutcome" | "voided">, oneCollateral: bigint, opts?: {
    /** Top of the YES book — clamps the mark to live quotes (see {@link markYesPrice}). */
    bookTop?: YesBookTop;
}): BinaryPositionPnL;
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
export declare function estPayoutFor(input: ClaimableInput): bigint;
/**
 *  Filter + shape settled positions into {@link ClaimablePosition}s. A position
 *  is claimable when the market is voided (both sides redeem at half) OR the
 *  position holds the winning outcome (redeem at 1 − fee). Loser-side and
 *  still-trading positions are dropped (nothing to claim).
 */
export declare function claimableFrom(inputs: ClaimableInput[]): ClaimablePosition[];
/** Default market-order slippage cushion, in bps of the crossing price. */
export declare const DEFAULT_SLIPPAGE_BPS = 300n;
/**
 *  Default minimum slippage cushion in ticks — keeps long-shot (low-priced)
 *  outcomes, where the bps fraction rounds to almost nothing, from getting
 *  near-zero slack.
 */
export declare const DEFAULT_SLIPPAGE_MIN_TICKS = 10n;
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
export declare function slippageForCrossing(price: bigint, tickSize: bigint, opts?: Pick<BinaryCrossingParams, "slippageBps" | "slippageMinTicks">): bigint;
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
export declare function quoteBinaryStakeOverBook(book: BinaryOrderBook, side: BinaryBuySide, stake: bigint, oneCollateral: bigint, params: BinaryCrossingParams): BinaryStakeQuote | null;
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
export declare function quoteBinarySellOverBook(book: BinaryOrderBook, side: BinarySellSide, quantity: bigint, oneCollateral: bigint, params: BinaryCrossingParams): BinarySellQuote | null;
/**
 *  The mid YES price (raw) from the best book levels — `(bid + ask) / 2` when
 *  both sides are quoted, otherwise whichever single side exists. `undefined`
 *  when the book is empty. For an ODDS display; positions should mark with
 *  {@link markYesPrice} instead (a lone bid/ask is not a fair mark).
 */
export declare function midYesPrice(bestYesBid: bigint | undefined, bestYesAsk: bigint | undefined): bigint | undefined;
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
export declare function averageEntryPrice(input: {
    trades: readonly EntryTrade[];
    /** 0 = YES, 1 = NO. */
    outcomeIndex: number;
    /** `10 ** decimals` — one whole outcome share in raw terms. */
    oneShare: bigint;
}): bigint | null;
/**
 *  Live mark price for one outcome in its own terms (raw): YES marks at the
 *  YES mid, NO at the complement. `undefined` when there's no mid to mark to.
 */
export declare function outcomeMarkPrice(input: {
    outcomeIndex: number;
    /** YES mark (raw), e.g. from {@link markYesPrice}. */
    yesMid: bigint | undefined;
    oneShare: bigint;
}): bigint | undefined;
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
export declare function markOutcomePosition(input: {
    /** Outcome-token balance held (raw units). */
    balance: bigint;
    /** Live mark price in the outcome's own terms (raw). */
    markPrice: bigint;
    /** Average entry price in the outcome's own terms (raw), or `null`. */
    avgEntry: bigint | null;
    oneShare: bigint;
}): OutcomePositionMark;
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
 *  Classify how a position marks from its market's status/resolution: a
 *  resolved market pays its winning outcome, a voided one refunds, a
 *  still-trading one marks live, and anything expired-but-unresolved is
 *  settling (marking to a stale book there flashes phantom PnL).
 */
export declare function positionMarkState(input: {
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
}): PositionMarkState;
