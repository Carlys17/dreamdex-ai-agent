// Types shared across the AI agent brain + execution layers.
import type { UnifiedMarket, MarketOnchain } from "@somnia-chain/markets-sdk";

export interface MarketSnapshot {
  marketId: string;
  symbol: string; // Up outcome symbol, e.g. "BTC-0-12AUG26-1600/USDso#YES"
  raw: UnifiedMarket;
  onchain: MarketOnchain;
  asset: string; // "BTC" | "ETH"
  cadenceMins: number;
  secondsLeft: number;
  bestBid: number | null; // Up probability (0,1)
  bestAsk: number | null;
  mid: number | null;
  spread: number | null;
  lastPrice: number | null;
  volume: number; // quote collateral
  tradeCount: number;
  spot: number; // live underlying price (BTC/ETH), directional signal
}

export type AiAction = "BUY_YES" | "BUY_NO" | "HOLD";

export interface AiDecision {
  symbol: string;
  action: AiAction;
  confidence: number; // 0..1
  fairProbability: number; // 0..1 our estimate of P(Up)
  edge: number; // fairProbability - marketMid (ranking signal)
  size: number; // shares to buy
  reasoning: string;
  /** filled: the decision is final; the agent will not re-buy this window */
  ts?: number;
}

export type AiActionStrict = "BUY_YES" | "BUY_NO" | "HOLD";

export function isAiAction(v: unknown): v is AiActionStrict {
  return v === "BUY_YES" || v === "BUY_NO" || v === "HOLD";
}
