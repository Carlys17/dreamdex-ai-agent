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
}

function parseArgs(): { llm?: "heuristic" | "ritual"; dryRun?: boolean } {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg && arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = i + 1 < args.length ? (args[i + 1] ?? "") : "";
      out[key] = val;
      i++;
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
    minEdge: Number(process.env.MIN_EDGE ?? "0.05"),
    maxSize: Number(process.env.MAX_SIZE ?? "5"),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? "8000"),
    ritualRpcUrl: process.env.RITUAL_RPC_URL,
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

      // --- BRAIN ---
      let decisions: AiDecision[] = [];
      if (cfg.llm === "ritual" && cfg.ritualRpcUrl && ctx.config.privateKey) {
        try {
          decisions = await ritualDecide(
            { rpcUrl: cfg.ritualRpcUrl, privateKey: ctx.config.privateKey },
            markets,
          );
          log(`ritual LLM -> ${decisions.length} decisions`);
        } catch (err) {
          log(`ritual LLM failed (${(err as Error).message}); heuristic fallback`);
          decisions = [];
        }
      }

      if (decisions.length === 0) {
        // Record spot samples per asset so we can measure drift since window open.
        const nowMs = Date.now();
        for (const m of markets) {
          if (!m.asset || m.asset === "?") continue;
          const arr = spotHistory.get(m.asset) ?? [];
          arr.push({ ts: nowMs, price: m.spot });
          // keep ~10 min of samples
          spotHistory.set(m.asset, arr.filter((s) => nowMs - s.ts < 600_000));
        }

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
        const res = await execute(ctx, market, d, {
          dryRun: cfg.dryRun,
          minEdge: cfg.minEdge,
          maxSize: cfg.maxSize,
        });
        log(
          `${res.outcome.padEnd(8)} | ${d.action} ${res.size} ${market.symbol} ` +
            `edge=${d.edge.toFixed(3)} conf=${d.confidence.toFixed(2)} ` +
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
