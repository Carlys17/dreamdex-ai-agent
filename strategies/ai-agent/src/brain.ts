// AI brain — two interchangeable predictors both emit AiDecision[].
import type { MarketSnapshot, AiDecision } from "./types.js";

// ---------------------------------------------------------------------------
// 1) Heuristic brain — fast, offline, deterministic.
//    Blends three signals into a fair P(Up) estimate:
//      a) market-implied probability (mid price)
//      b) short-horizon momentum (recent mid drift)
//      c) spot-asset drift since market open (extrapolated to expiry)
// ---------------------------------------------------------------------------

export interface HeuristicInput {
  market: MarketSnapshot;
  recentMids: number[]; // old -> new, last ~5 polls
  spotAtOpen: number; // underlying price when window opened
  spotNow: number; // underlying price now
  elapsedSec: number;
  windowSec: number;
  minEdge: number; // act threshold (respects MIN_EDGE env)
}

export function heuristicDecide(input: HeuristicInput): AiDecision {
  const { market, recentMids, spotAtOpen, spotNow, elapsedSec, windowSec, minEdge } = input;
  const mid = market.mid ?? 0.5;

  const sMarket = mid;

  // momentum: blend last poll with (head->tail) drift, amplified
  let sMomentum = mid;
  if (recentMids.length >= 2) {
    const head = recentMids[0];
    const tail = recentMids[recentMids.length - 1];
    if (head !== undefined && tail !== undefined) {
      sMomentum = mid + (tail - head) * 1.5;
      // Clamp so momentum can't push fair probability outside (0, 1) and corrupt
      // confidence math (which uses |edge| = |fair - mid|).
      sMomentum = Math.max(0.01, Math.min(0.99, sMomentum));
    }
  }

  // spot drift -> probability shift, linear extrapolation of log-return.
  // Guards:
  //  - both prices must be > 0 (feed death mid-run gives log(0) = -Infinity)
  //  - extrapolation factor capped at 10x: at market open (elapsedSec ~1-4s)
  //    a 0.1% tick would otherwise project to a 0.25 shift = false edge.
  let sSpot = mid;
  if (spotAtOpen > 0 && spotNow > 0 && elapsedSec > 0 && windowSec > 0) {
    const logReturn = Math.log(spotNow / spotAtOpen);
    const factor = Math.min(10, windowSec / elapsedSec);
    const projected = logReturn * factor;
    const shift = Math.tanh(projected * 8) * 0.25;
    sSpot = mid + shift;
  }

  const timeFrac = Math.min(1, Math.max(0, elapsedSec / windowSec));
  const wMarket = 0.35 + 0.35 * timeFrac; // 0.35 -> 0.70
  const wMomentum = 0.45 * (1 - timeFrac);
  const wSpot = 1 - wMarket - wMomentum;

  let fair = wMarket * sMarket + wMomentum * sMomentum + wSpot * sSpot;
  fair = Math.max(0.01, Math.min(0.99, fair));

  const edge = fair - mid;
  const confidence = Math.min(1, Math.abs(edge) * 4);

  let action: AiDecision["action"] = "HOLD";
  let size = 0;
  if (edge > minEdge) {
    action = "BUY_YES";
    size = Math.max(1, Math.min(5, Math.round(confidence * 5)));
  } else if (edge < -minEdge) {
    action = "BUY_NO";
    size = Math.max(1, Math.min(5, Math.round(confidence * 5)));
  }

  return {
    symbol: market.symbol,
    action,
    confidence,
    fairProbability: fair,
    edge,
    size,
    reasoning:
      `mkt=${sMarket.toFixed(3)} mom=${sMomentum.toFixed(3)} ` +
      `spot=${sSpot.toFixed(3)} | w[mom]=${wMomentum.toFixed(2)} w[spot]=${wSpot.toFixed(2)}`,
  };
}

// ---------------------------------------------------------------------------
// 2) Ritual LLM brain — on-chain GLM-4.7-FP8 via precompile 0x0802.
//    Reused from @somnia-chain/markets-sdk-independent viem calls. Kept in a
//    sibling module (ritual-brain.ts) to keep this one dependency-light.
// ---------------------------------------------------------------------------
