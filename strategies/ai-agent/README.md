# AI Agent — DreamDEX Event Contracts (Somnia × DreamDEX Hackathon)

An AI-powered prediction-market trading agent for **DreamDEX Event Contracts**:
binary Up/Down windows on BTC and ETH, settled on-chain every 5 minutes.

Two interchangeable "brains" decide when the market is mispriced:

1. **Ritual LLM brain** (`ritual-brain.ts`) — sends live market tables to an
   on-chain LLM via Ritual's inference precompile `0x0802`
   (model: `zai-org/GLM-4.7-FP8`), discovered through Ritual's TEE service
   registry. The model returns fair probabilities + actions per market.
2. **Heuristic brain** (`brain.ts`) — a deterministic fallback that blends
   market-implied probability, orderbook momentum, and spot drift into a fair
   P(Up) estimate. Runs with zero external dependencies.

Decisions flow into an executor that places IOC orders via the bot-kit's
`placeLimit` (tick/lot-safe on 18-decimal venues), gated by:

- minimum edge threshold (`MIN_EDGE`, default 0.05 probability points)
- max position size per market (`MAX_SIZE`)
- dry-run mode (`DRY_RUN=true` logs intended orders instead of sending)

## Architecture

```
scanner ──► brain ──► executor ──► DreamDEX venue
   │           │            │
   │           │            └─ IOC buy YES or NO via placeLimit
   │           ├─ ritual-brain.ts  (on-chain LLM, precompile 0x0802)
   │           └─ brain.ts         (heuristic blend, no deps)
   └─ activeMarkets + getMarketOnchain + fetchOrderBook + fetchPrice
```

## Setup

From the repo root:

```bash
npm install
cp strategies/ec-starter/.env.example .env  # then edit
```

Required in `.env`:

```bash
NETWORK=testnet
VENUE_ID=0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c
PRIVATE_KEY=0x...        # only needed for real trades (DRY_RUN=false)
DRY_RUN=true             # start here
MIN_EDGE=0.03           # minimum REALIZED edge to act (see below)
MAX_SIZE=3              # max shares per order
LLM_PROVIDER=heuristic  # or "ritual"
RITUAL_RPC_URL=https://rpc.ritualchain.org   # for LLM_PROVIDER=ritual
RITUAL_TIMEOUT_MS=90000   # max wait for Ritual LLM response (~90s; default)
POLL_INTERVAL_MS=8000    # polling cadence (default 8s)
```

Get testnet STT from the Somnia faucet; tUSDC collateral via the kit's faucet
flow (`FAUCET_ENABLED=true`).

## Run

```bash
# dry-run (no signer needed)
npx tsx strategies/ai-agent/src/index.ts

# live trading
DRY_RUN=false npx tsx strategies/ai-agent/src/index.ts

# force the heuristic brain regardless of env
npx tsx strategies/ai-agent/src/index.ts --llm heuristic --dry-run

# force the Ritual LLM brain
LLM_PROVIDER=ritual RITUAL_RPC_URL=https://... DRY_RUN=false \
  npx tsx strategies/ai-agent/src/index.ts
```

## What it does each cycle (~8s)

1. Scans active binary markets on the configured venue, keeps those in Trading
   status with 60s–60min left to expiry.
2. Pulls top-of-book (YES probability), last trade price, cumulative volume,
   and the live spot price for BTC/ETH from the bundled feed.
3. Asks the selected brain for `{action, confidence, edge, size}` per market.
4. For actionable decisions, applies THREE gates before crossing the touch:
   - **Spread guard** — skip when book spread ≥ |mid-edge| (crossing the
     spread would erase the signal by construction).
   - **Realized edge** — recompute the edge against the *fill* price
     (`fair - ask` on YES, `fair - (1 - bid)` on NO) and require
     `realized_edge ≥ MIN_EDGE`. The mid-edge is only used for ranking.
   - **Liquidity** — no ask on the side we want to cross ⇒ skip.
5. Position tracking prevents re-entering a window the agent already has
   exposure in.

## Safety & production readiness

- **Dry-run first.** `DRY_RUN=true` logs the intended IOC order — no signing,
  no broadcast. Verify decisions look sane before switching to `false`.
- **Hard gates on realized edge** (see cycle step 4) — the executor refuses
  to cross a spread wider than the estimated mispricing.
- **Position guard** — the agent tracks its own open positions per
  `market/side` and skips markets it is already positioned in.
- **Ritual LLM timeout** — GLM-4.7-FP8 is a reasoning model with 10–40s
  latency; `RITUAL_TIMEOUT_MS` (default 90s) plus a `Promise.race` prevents
  a stalled inference from freezing the trading loop.
- **Strict JSON validation** — malformed Ritual responses (bad action, NaN
  probability, missing symbol) are dropped instead of silently coerced to
  `HOLD`, which would otherwise let a bad row look "safe" while corrupting
  downstream aggregates.
- **Type-safe end-to-end** — `npm run typecheck -w ai-agent` must be clean
  before committing.

## Verified doctor + dry-run against testnet

Pre-flight (read-only, no signer needed):

```bash
NETWORK=testnet \
VENUE_ID=0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c \
  npm run ec:doctor
```

Sample output on the DreamDEX venue (real, live):

```
venue     : 0x679795a0… · source=env · scoped active=8
ETH-0-26AUG26-1615/tUSDC     Trading    ttl=13m      YES bid=0.356 ask=0.385
BTC-0-26AUG26-1615/tUSDC     Trading    ttl=13m      YES bid=0.456 ask=0.485
BTC-0-26AUG26-2000/tUSDC     Trading    ttl=238m     YES bid=0.478 ask=0.508
…
```

Dry-run of the AI agent against the same testnet venue:

```bash
./node_modules/.bin/tsx strategies/ai-agent/src/index.ts
```

Sample log (real testnet cycle, `LLM_PROVIDER=heuristic`):

```
AI agent start | network=testnet llm=heuristic dryRun=true minEdge=0.03 poll=8000ms
cycle 3 | 4 tradable Up/Down windows
decisions: 4 total, 4 actionable
dry-run  | BUY_YES 1 ETH-0-26AUG26-1615/tUSDC#YES edge=0.057 rEdge=0.042 conf=0.23
dry-run  | BUY_YES 1 BTC-0-26AUG26-1615/tUSDC#YES edge=0.066 rEdge=0.051 conf=0.26
skipped  | BUY_YES 1 ETH-0-26AUG26-1700/tUSDC#YES edge=0.039 rEdge=0.024 conf=0.16
skipped  | BUY_YES 1 BTC-0-26AUG26-1700/tUSDC#YES edge=0.038 rEdge=0.024 conf=0.15
```

The two skipped rows show the realized-edge gate in action: their mid-edge
was above `MIN_EDGE=0.03`, but paying the ask brought realized edge below
threshold, so the executor refused.

## Hackathon submission

Part of the Somnia × DreamDEX **Event Contracts Hackathon** on DoraHacks —
<https://dorahacks.io/hackathon/event-contracts/detail>. Submission window
25 Aug – 8 Sep 2026.

Requirements checklist:

- [x] Working prototype on testnet (`npm run ec:doctor` + dry-run trace above)
- [x] Public GitHub repository — <https://github.com/Carlys17/dreamdex-ai-agent>
- [ ] 2–3 minute demo video

## License

MIT — see [LICENSE](../../LICENSE).
