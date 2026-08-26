// Main loop — scanner -> brain -> executor, gated on real on-chain status.
import { createExchange, shutdown, type EcContext } from "@dreamdex-bot-kit/ec-core";
import { scan } from "./scanner.js";
import { heuristicDecide } from "./brain.js";
import { ritualDecide } from "./ritual-brain.js";
import { execute } from "./executor.js";
import type { AiDecision, MarketSnapshot } from "./types.js";

const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);

interface AgentConfig {
  llm: "heuristic" | "ritual";
  dryRun: boolean;
  minEdge: number;
  maxSize: number;
  pollIntervalMs: number;
  ritualRpcUrl?: string;
  ritualTimeoutMs: number;
}

function parseArgs(): { llm?: "heuristic" | "ritual"; dryRun?: boolean } {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg && arg.startsWith("--")) {
      const key = arg.slice(2);
      // boolean flag if next token is another flag or absent
      const next = i + 1 < args.length ? (args[i + 1] ?? "") : "";
      if (next.startsWith("--") || next === "") {
        out[key] = "";
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return {
    llm: (out.llm as "heuristic" | "ritual") || undefined,
    dryRun: out["dry-run"] === "" || out["dry-run"] === "true" ? true : undefined,
  };
}

function loadAgentConfig(ctx: EcContext, args: ReturnType<typeof parseArgs>): AgentConfig {
  const envLlm = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const llm: "heuristic" | "ritual" =
    args.llm ?? (envLlm === "ritual" ? "ritual" : "heuristic");
  return {
    llm,
    dryRun: args.dryRun ?? process.env.DRY_RUN !== "false",
    minEdge: Number(process.env.MIN_EDGE ?? "0.03"),
    maxSize: Number(process.env.MAX_SIZE ?? "3"),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? "8000"),
    ritualRpcUrl: process.env.RITUAL_RPC_URL,
    ritualTimeoutMs: Number(process.env.RITUAL_TIMEOUT_MS ?? "90_000"),
  };
}

async function main() {
  const args = parseArgs();
  // Only demand a funded signer when we will actually send orders.
  const willTrade = (args.dryRun ?? process.env.DRY_RUN !== "false") === false;
  const ctx: EcContext = createExchange({ withSigner: willTrade });
  const cfg = loadAgentConfig(ctx, args);

  log(
    `AI agent start | network=${ctx.config.network} llm=${cfg.llm} ` +
      `dryRun=${cfg.dryRun} canTrade=${ctx.canTrade} minEdge=${cfg.minEdge} ` +
      `poll=${cfg.pollIntervalMs}ms`,
  );

  const midHistory = new Map<string, number[]>();
  const spotHistory = new Map<string, { ts: number; price: number }[]>();
  // one position per (market window, side); symbol embeds the window timestamp
  // so keys are naturally unique per window. Pruned when the market disappears.
  const position = new Set<string>();
  let cycle = 0;

  while (true) {
    cycle++;
    try {
      const markets: MarketSnapshot[] = await scan(ctx);
      log(`cycle ${cycle} | ${markets.length} tradable Up/Down windows`);
      if (markets.length === 0) {
        await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
        continue;
      }

      // --- RECORD HISTORY (always, regardless of brain) ---
      // So spot/momentum signals stay warm even when Ritual is the active brain.
      const nowMs = Date.now();
      for (const m of markets) {
        if (!m.asset || m.asset === "?") continue;
        const arr = spotHistory.get(m.asset) ?? [];
        arr.push({ ts: nowMs, price: m.spot });
        spotHistory.set(m.asset, arr.filter((s) => nowMs - s.ts < 600_000));
      }

      // prune position keys for markets that expired / left the scan
      const liveSymbols = new Set(markets.map((m) => m.symbol));
      for (const key of position) {
        if (!liveSymbols.has(key)) position.delete(key);
      }

      // --- BRAIN ---
      let decisions: AiDecision[] = [];
      if (cfg.llm === "ritual" && cfg.ritualRpcUrl && ctx.config.privateKey) {
        try {
          // GLM-4.7-FP8 is a reasoning model: 10-40s wall-clock is normal, but
          // never let it stall the trading loop past the poll cadence.
          decisions = await Promise.race([
            ritualDecide(
              { rpcUrl: cfg.ritualRpcUrl, privateKey: ctx.config.privateKey },
              markets,
            ),
            new Promise<AiDecision[]>((_, reject) =>
              setTimeout(() => reject(new Error(`ritual timed out after ${cfg.ritualTimeoutMs}ms`)), cfg.ritualTimeoutMs),
            ),
          ]);
          log(`ritual LLM -> ${decisions.length} decisions`);
          // Ritual returns fairProbability per market; recompute edge against
          // the LIVE book (mid) so downstream gating stays consistent.
          for (const d of decisions) {
            const m = markets.find((x) => x.symbol === d.symbol);
            if (m) d.edge = (d.fairProbability ?? 0.5) - (m.mid ?? 0.5);
          }
        } catch (err) {
          log(`ritual LLM failed (${(err as Error).message}); heuristic fallback`);
          decisions = [];
        }
      }

      if (decisions.length === 0) {
        decisions = markets.map((m) => {
          const hist = midHistory.get(m.symbol) ?? [];
          midHistory.set(m.symbol, [...hist, m.mid ?? 0.5].slice(-5));

          // Spot at window open: the window opened at (expiry - interval). Find
          // the sample closest to that time. Fall back to current spot if we
          // have no history yet (agent just started).
          const intervalSec = m.cadenceMins * 60;
          const openTs = (Number(m.onchain.expiry) - intervalSec) * 1000;
          const samples = spotHistory.get(m.asset) ?? [];
          let spotAtOpen = m.spot;
          const first = samples[0];
          if (first) {
            let best = first;
            for (const s of samples) {
              if (Math.abs(s.ts - openTs) < Math.abs(best.ts - openTs)) best = s;
            }
            spotAtOpen = best.price;
          }

          return heuristicDecide({
            market: m,
            recentMids: hist,
            spotAtOpen,
            spotNow: m.spot,
            elapsedSec: Math.max(1, intervalSec - m.secondsLeft),
            windowSec: intervalSec,
            minEdge: cfg.minEdge,
          });
        });
      }

      const actionable = decisions.filter(
        (d) => d.action !== "HOLD" && Math.abs(d.edge) >= cfg.minEdge,
      );
      log(`decisions: ${decisions.length} total, ${actionable.length} actionable`);

      for (const d of actionable) {
        const market = markets.find((m) => m.symbol === d.symbol);
        if (!market) continue;

        // --- POSITION TRACKING (prevent unbounded re-entry) ---
        // One position per market window, any side. Buying both YES and NO in
        // the same window pays the spread twice = locked-in loss, so once we
        // are positioned we stand down until the window expires.
        const key = market.symbol;
        if (position.has(key)) {
          if (cfg.dryRun) {
            log(`skip (already positioned) | ${d.action} ${market.symbol}`);
          }
          continue;
        }
        position.add(key);

        const res = await execute(ctx, market, d, {
          dryRun: cfg.dryRun,
          minEdge: cfg.minEdge,
          maxSize: cfg.maxSize,
        });
        // if the order didn't fill, free the slot so we can retry next cycle
        if (res.outcome !== "filled" && res.outcome !== "dry-run") {
          position.delete(key);
        }
        log(
          `${res.outcome.padEnd(8)} | ${d.action} ${res.size} ${market.symbol} ` +
            `edge=${d.edge.toFixed(3)} rEdge=${res.realizedEdge !== undefined ? res.realizedEdge.toFixed(3) : "?"} ` +
            `conf=${d.confidence.toFixed(2)} ` +
            `| ${d.reasoning || res.reason || ""}` +
            (res.hash ? ` tx=${res.hash.slice(0, 12)}` : ""),
        );
      }
    } catch (err) {
      log(`cycle error: ${(err as Error).message}`);
    }

    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }
}

main()
  .catch((err) => log(`fatal: ${err}`))
  .finally(async () => {
    try {
      const ctx = createExchange({ withSigner: false });
      await shutdown(ctx);
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
