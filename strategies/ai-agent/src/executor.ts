// Executor — turns an AiDecision into a placeLimit IOC order (or a dry-run log).
import { placeLimit, type EcContext } from "@dreamdex-bot-kit/ec-core";
import type { AiDecision, MarketSnapshot } from "./types.js";

export interface ExecutorOptions {
  dryRun: boolean;
  minEdge: number; // |edge| below this -> skip
  maxSize: number; // cap shares per order
}

export interface ExecutionResult {
  ts: number;
  symbol: string;
  action: AiDecision["action"];
  outcome: "HOLD" | "skipped" | "dry-run" | "filled" | "reverted";
  edge: number;
  size: number;
  reason?: string;
  hash?: string;
  filled?: number;
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
  if (Math.abs(decision.edge) < opts.minEdge) {
    return { ...base, outcome: "skipped", reason: `edge ${decision.edge.toFixed(3)} < min ${opts.minEdge}` };
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
      return { ...base, outcome: "filled", size: res.filled, hash: res.hash, filled: res.filled };
    }
    return { ...base, outcome: "skipped", size: res.size, reason: "no fill (IOC)" };
  } catch (err) {
    return {
      ...base,
      outcome: "reverted",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
