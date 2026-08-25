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
  const outcome = decision.action === "BUY_YES" ? "YES" : "NO";
  const side = "buy";
  const mid = market.mid ?? 0.5;
  // Price to cross: buy YES slightly above ask, or buy NO slightly below bid.
  const price = outcome === "YES"
    ? (market.bestAsk ?? mid) + 0.02
    : (market.bestBid ?? mid) - 0.02;

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
