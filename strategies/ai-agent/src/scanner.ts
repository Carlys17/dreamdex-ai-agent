// Scanner — builds MarketSnapshot[] from the DreamDEX venues via ec-core.
import {
  createExchange,
  activeMarkets,
  marketOnchain,
  outcomeSymbols,
  snapshot as yesSnapshot,
} from "@dreamdex-bot-kit/ec-core";
import type { EcContext } from "@dreamdex-bot-kit/ec-core";
import type { MarketSnapshot } from "./types.js";

export interface ScanResult {
  ctx: EcContext;
  markets: MarketSnapshot[];
  spot: Record<string, number>; // asset -> live spot price (BTC/ETH)
}

export async function scan(ctx: EcContext, minLeftSec = 30, maxLeftSec = 3600): Promise<MarketSnapshot[]> {
  const live = await activeMarkets(ctx, { max: ctx.config.maxMarkets });
  const now = Date.now() / 1000;

  // spot prices for directional signal
  const assets = [...new Set(live.map((m) => (m.info.marketType === "BINARY" ? m.info.asset : "")).filter(Boolean))] as string[];
  const spot: Record<string, number> = {};
  for (const a of assets) {
    try {
      const p = await ctx.exchange.fetchPrice(a);
      if (p) spot[a] = p.price;
    } catch {
      /* feed may be down */
    }
  }

  const out: MarketSnapshot[] = [];

  for (const m of live) {
    const onchain = await marketOnchain(ctx, m);
    if (!onchain) continue;
    if (onchain.status !== 1) continue; // 1 = Trading
    const secondsLeft = Number(onchain.expiry) - now;
    if (secondsLeft < minLeftSec || secondsLeft > maxLeftSec) continue;

    const { yes } = outcomeSymbols(m);
    let snap: { bestYesBid?: number; bestYesAsk?: number; yesMid?: number } = {};
    try {
      snap = await yesSnapshot(ctx, yes, 5);
    } catch {
      // book may be empty
    }

    const info = m.info;
    const cadenceMins = info.marketType === "BINARY" && info.intervalSec
      ? Math.round(Number(info.intervalSec) / 60)
      : 5;

    // anchor spot for this asset; 0 = feed unavailable (brain skips spot signal)
    const liveSpot = info.marketType === "BINARY" && info.asset ? spot[info.asset] : undefined;

    out.push({
      marketId: info.marketType === "BINARY" ? (info.marketId as string) : m.symbol,
      symbol: yes,
      raw: m,
      onchain,
      asset: info.marketType === "BINARY" ? (info.asset ?? "?") : "?",
      cadenceMins,
      secondsLeft,
      bestBid: snap.bestYesBid ?? null,
      bestAsk: snap.bestYesAsk ?? null,
      mid: snap.yesMid ?? null,
      spread: snap.bestYesBid !== undefined && snap.bestYesAsk !== undefined
        ? snap.bestYesAsk - snap.bestYesBid
        : null,
      lastPrice: info.lastPrice !== null && info.lastPrice !== undefined
        ? Number(info.lastPrice) / 10 ** info.quoteDecimals
        : null,
      volume: info.cumulativeQuoteVolume
        ? Number(info.cumulativeQuoteVolume) / 10 ** info.quoteDecimals
        : 0,
      tradeCount: info.tradeCount ? Number(info.tradeCount) : 0,
      spot: liveSpot ?? 0,
    });
  }

  out.sort((a, b) => a.secondsLeft - b.secondsLeft);
  return out;
}
