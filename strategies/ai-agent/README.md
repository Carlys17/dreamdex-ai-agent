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
MIN_EDGE=0.05
MAX_SIZE=5
LLM_PROVIDER=heuristic   # or "ritual"
RITUAL_RPC_URL=https://rpc.ritualchain.org   # for LLM_PROVIDER=ritual
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
4. For actionable decisions (|edge| ≥ MIN_EDGE), buys the underpriced side
   with an IOC order sized by confidence.
