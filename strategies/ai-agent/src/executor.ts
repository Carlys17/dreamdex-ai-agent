// Executor — turns an AiDecision into a placeLimit IOC order (or a dry-run log).
import { placeLimit, type EcContext } from "@dreamdex-bot-kit/ec-core";
import type { AiDecision, MarketSnapshot } from "./types.js";

export interface ExecutorOptions {
  dryRun: boolean;
  minEdge: number; // |realized edge| below this -> skip
  maxSize: number; // cap shares per order
}

export interface ExecutionResult {
  ts: number;
  symbol: string;
  action: AiDecision["action"];
  outcome: "HOLD" | "skipped" | "dry-run" | "filled" | "reverted";
  edge: number; // decision edge vs mid
  realizedEdge?: number; // edge AFTER the price we would actually pay
  size: number;
  reason?: string;
  hash?: string;
  filled?: number;
}

/**
 * Realized edge = fair - priceWeActuallyPay.
 *
 * The brain ranks opportunities against the book MID, but a taker fills at the
 * ASK (YES) or at 1 - bid (NO). On a wide spread that gap swamps the signal:
 * buying YES at ask=0.60 when fair=0.55 is -0.05 realized edge, a guaranteed
 * loss even though mid-based edge looked positive. Gate every trade on the
 * REALIZED number, not the mid one.
 */
export function realizedEdge(market: MarketSnapshot, action: AiDecision["action"], fair: number): number | null {
  if (action === "BUY_YES") {
    if (market.bestAsk == null) return null;
    return fair - market.bestAsk;
  }
  if (action === "BUY_NO") {
    if (market.bestBid == null) return null;
    return fair - (1 - market.bestBid); // NO ask in NO terms = 1 - yesBid
  }
  return null;
}

export async function execute(
  ctx: EcContext,
  market: MarketSnapshot,
  decision: AiDecision,
  opts: ExecutorOptions,
): Promise<ExecutionResult> {
  const base = {
    ts: Date.now(),
    symbol: market.symbol,
    action: decision.action,
    edge: decision.edge,
    size: decision.size,
  };

  if (decision.action === "HOLD" || decision.size === 0) {
    return { ...base, outcome: "HOLD" };
  }

  // Compute realized edge first so it's always available for logging, even when
  // we skip on the spread guard.
  const rEdge = realizedEdge(market, decision.action, decision.fairProbability);

  // Hard gate on REALIZED edge (fair minus fill price), not mid edge. Also
  // refuses to cross a spread wider than the signal itself: paying more spread
  // than our estimated mispricing is negative-EV by construction.
  if (market.spread != null && decision.fairProbability > 0 && decision.fairProbability < 1) {
    if (market.spread >= Math.abs(decision.edge)) {
      return {
        ...base,
        outcome: "skipped",
        realizedEdge: rEdge ?? undefined,
        reason: `spread ${market.spread.toFixed(3)} >= |edge| ${Math.abs(decision.edge).toFixed(3)} (crossing not worth it)`,
      };
    }
  }
  if (rEdge == null || rEdge < opts.minEdge) {
    return {
      ...base,
      outcome: "skipped",
      realizedEdge: rEdge ?? undefined,
      reason:
        rEdge == null
          ? "no liquidity on the side to cross"
          : `realized edge ${rEdge.toFixed(3)} < min ${opts.minEdge} (mid edge was ${decision.edge.toFixed(3)})`,
    };
  }

  const size = Math.min(decision.size, opts.maxSize);
  // We always BUY (YES or NO) — either way we cross the touch to take liquidity.
  // The book is quoted in YES terms; placeLimit wants the price in the OUTCOME'S
  // own terms and complements NO internally.
  //   BUY YES crosses the YES ask:            price_yes = bestAsk + ε
  //   BUY NO  crosses the NO ask = 1 - yesBid: price_no  = (1 - bestBid) + ε
  // The limit is a worst-case guard (IOC takes at the resting price), so keep
  // it tight: if the book shifts between read and send we refuse to chase.
  const outcome = decision.action === "BUY_YES" ? "YES" : "NO";
  const side = "buy";
  let price: number;
  if (outcome === "YES") {
    if (market.bestAsk == null) {
      return { ...base, outcome: "skipped", reason: "no YES ask to cross" };
    }
    price = Math.min(0.99, market.bestAsk + 0.01);
  } else {
    if (market.bestBid == null) {
      return { ...base, outcome: "skipped", reason: "no NO liquidity (no YES bid)" };
    }
    price = Math.min(0.99, 1 - market.bestBid + 0.01);
  }

  if (opts.dryRun) {
    return {
      ...base,
      outcome: "dry-run",
      size,
      realizedEdge: rEdge,
      reason: `would BUY_${outcome} ${size} @ ${price.toFixed(3)}`,
    };
  }

  try {
    const res = await placeLimit(ctx, {
      market: market.raw,
      onchain: market.onchain,
      outcome,
      side,
      price,
      size,
      type: "ioc",
    });
    if (res.filled > 0) {
      return { ...base, outcome: "filled", size: res.filled, realizedEdge: rEdge, hash: res.hash, filled: res.filled };
    }
    return { ...base, outcome: "skipped", size: res.size, realizedEdge: rEdge, reason: "no fill (IOC)" };
  } catch (err) {
    return {
      ...base,
      outcome: "reverted",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
