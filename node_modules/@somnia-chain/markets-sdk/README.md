# @somnia-chain/markets-sdk

The TypeScript SDK for building on **Somnia Markets** — read live market data
and place trades on the on-chain order book from your own app.

- **Realtime data, no wallet required.** Order books, trades, candles, and a
  user's positions and open orders stream into your UI the moment they happen
  on-chain — no polling loops to write or manage.
- **Trading with a signer.** Place and cancel orders, mint and redeem outcome
  shares, and more, through a typed trader bound to your wallet.
- **Works anywhere, with first-class React.** Use plain async functions in any
  environment, or drop in the hooks for components that update themselves.

## Install

```sh
pnpm add @somnia-chain/markets-sdk viem   # npm / yarn / bun equivalents work too
```

`viem` is a peer dependency. `react` is an optional peer — only needed for the
`@somnia-chain/markets-sdk/react` entry.

> Versions up to 0.19.0 were published to GitHub Packages under the private
> `@somnia-chain` scope; from 0.20.0 the package is public on npm — no
> registry configuration or token needed.

## Create an exchange

`new SomniaMarkets(config)` is the single entry point — the exchange owns everything:
symbols, market data, watches, and writes. No global setup, no hidden singleton;
each exchange is isolated.

```ts
import { SomniaMarkets, SOMNIA_MAINNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaMainnet } from "@somnia-chain/markets-sdk/chains"; // every Somnia network, incl. Shannon/Elwood/Hideki/local

const exchange = new SomniaMarkets({
  indexerUrl: "https://prd.smk.somnia.host/v1/graphql", // the production indexer
  chain: somniaMainnet,
  wsRpcUrl: "wss://api.infra.mainnet.somnia.network/ws",
  addresses: SOMNIA_MAINNET_ADDRESSES, // baked-in per-chain constants (SOMNIA_TESTNET_ADDRESSES for testnet)
  privateKey, // optional — needed for createOrder & friends
});
await exchange.loadMarkets();

const book  = await exchange.watchOrderBook("BTC-95000-31DEC26/USDC#YES"); // live, zero RTT
const order = await exchange.createOrder("BTC-95000-31DEC26/USDC#YES", "limit", "buy", 10, 0.62);
```

For testnet, swap all four: `https://dev.smk.somnia.host/v1/graphql`,
`somniaShannon`, `wss://api.infra.testnet.somnia.network/ws`, and
`SOMNIA_TESTNET_ADDRESSES`.

The raw engine tier — bigint-exact, address-keyed — is reached *through* the
exchange (`exchange.client`, `exchange.trader`), never constructed separately.
The WebSocket opens lazily on first chain I/O, so an indexer-only exchange
(e.g. server-side GraphQL reads) never opens one. Nothing is shared between
instances: a bot per chain, per-request servers, parallel tests — just
construct another. Two exchanges never share watch state or sockets.

The guides, in reading order:


- **[The exchange API](./docs/EXCHANGE.md)** — the `SomniaMarkets` class, the
  SDK's primary surface: symbols (`SOMI/USDC`, `BTC-95000-31DEC26/USDC#YES`),
  `fetch*`/`watch*`/`createOrder`, human-unit structs. Exchange-bot muscle
  memory (ccxt included) transfers directly — start here.
- **[Spot markets](./docs/SPOT.md)** — base/quote books: ticks and lots,
  native-base escrow, market orders, and stop orders.
- **[Binary markets](./docs/BINARY.md)** — YES/NO information markets:
  probability prices, the four sides, mint/burn/redeem, and a maker loop.
- **[Perps](./docs/PERPS.md)** — live on testnet: cross-margin via the
  MarginBank, funding, positions, and how perps slot into the `marketType`
  union.
- **[Price feeds](./docs/PRICES.md)** — realtime BTC/ETH index prices from the
  on-chain EMA oracle: `watchPrice`/`getLivePrice`, one-shot history + candles,
  and the React hooks.
- **[SomniaLend](./docs/LEND.md)** — the third-party money market wrapped as
  `client.lend`: supply idle collateral, borrow working capital, reserve rates
  as APYs.
- **[Chains](./docs/CHAINS.md)** — every Somnia network as a viem `Chain`
  (mainnet, Shannon, Elwood, Hideki, local anvil) from
  `@somnia-chain/markets-sdk/chains`, plus `getSomniaChain(id)`.
- **[Bridge](./docs/BRIDGE.md)** — moving tokens between Somnia networks over the
  Hyperlane warp routes: the token/network enums, the per-network registry, and
  `createBridgeTransfer` → the unsigned transactions that do it.
- **[Native RPC](./docs/NATIVE.md)** — the `somnia_*` namespace wrapped as ordinary
  calls: the native ledger block, chain statistics, protocol parameters, reactivity
  subscription reads, and **session transactions** (the node holds the key, tracks
  the nonce, signs, and returns the receipt).
- **[Reactivity](./docs/REACTIVITY.md)** — Somnia's event-driven primitive via
  `@somnia-chain/markets-sdk/reactivity` (a pointer at the upstream
  `@somnia-chain/reactivity` package): events pushed *with* the state that goes
  with them, into TypeScript (`watch`) or into a Solidity handler (`subscribe`).
- **[The engine (advanced)](./docs/ENGINE.md)** — the raw tier behind the
  exchange (`exchange.client` / `exchange.trader`): bigint-exact reads,
  ref-counted watches, React hook wiring, raw writes.
- **[Architecture guide](./docs/ARCHITECTURE.md)** — diagrams of the whole
  machine: the watch seam, event routing, the local order book, the reconnect
  lifecycle, and the one-round-trip write path.

### Two ways to read

| How | What it is | Returns |
|---|---|---|
| `client.list*` / `client.get*` | **One-shot** read (indexer GraphQL or on-chain) | a `Promise` |
| `client.getLive*` + `client.subscribeLive` | **Synchronous** read off the live store (within a `watchMarket` scope) | a value, now |
| `use*` hooks (`/react`) | React bindings over the live store (auto-watching) | re-render on change |

So `client.getFills` fetches once; `client.getLiveFills` reads the live tape;
`useLiveFills` re-renders a component as it updates. In React, provide the client
once with `<SomniaMarketsProvider client={client}>` (from `@somnia-chain/markets-sdk/react`)
and the hooks read it from context.

Markets come from one discriminated union — `Market = SpotMarket | PerpMarket |
BinaryMarket`, keyed on `marketType` — via `client.listMarkets` / `client.getMarket`. Binary-only
callers can use `client.listBinaryMarkets` / `client.getBinaryMarket`, the same
query pre-narrowed to `BinaryMarket`. (Note: *binary*, not *clob* — a spot market
is an order book too, so "CLOB" was never the right label for the binary surface.)

Money crosses the API as raw integers (bigint on writes, decimal strings from the
indexer) scaled by token decimals. Convert at the edges with `fromHuman` (input)
and `toHuman` / `toHumanString` (display); for binary prices,
`probabilityToPrice` / `priceToProbability` map a YES price ↔ a 0–1 probability.

## What's included

- **Entry point** — `new SomniaMarkets(config)` → the exchange (symbols,
  `fetch*`/`watch*`/`createOrder`, human-unit structs). Its engine tier —
  `exchange.client` (`SomniaMarketsClient`, bigint-exact reads + watches) and
  `exchange.trader` (raw writes) — is reached through it; `ClientConfig`
- **React** — `SomniaMarketsProvider`, `useSomniaMarketsClient`, and the hooks
  `useWatchMarket`, `useWatchUser`, `useLiveStatus`, `useIsTailing`,
  `useLiveFills`, `useLiveUserFills`, `useLiveMarketByPool`,
  `useLiveMarketByAddress`, `useLiveUserOrders`, `useLiveBinaryOrderBook`,
  `useLiveSpotOrderBook` — the pool-keyed data hooks **watch automatically**
  while mounted
- **Client reads** — `client.listMarkets`/`getMarket` (the `Market` union),
  `listBinaryMarkets`/`getBinaryMarket`, `getCandles`, `getBinaryOrderBook`,
  `getOpenOrders`, `getPortfolio`, `getSyncStatus`, `getMarketOnchain`,
  `getSystemInfo`, … (indexer reads **throw** on failure — an empty result always
  means "no rows", never "request failed")
- **Order state at chain head** — `getOrderOnchain(pool, orderId)`,
  `getOwnOpenOrdersOnchain(pool, owner)`, `getAllOpenOrdersOnchain(pool, { isBid })`
  answer from the pool contract, so an order is readable the moment its block
  lands. Use these to read your own writes; use the indexed `getOpenOrders` /
  `getOrders` for history — the chain surface only knows what is open **now**
- **Live watches (no React)** — `client.watchMarket(pool)` /
  `watchMarkets({ discover })` / `watchUser(account)` → ref-counted handles;
  `getWatchStatus`, `subscribeLive`, `getLiveStatus`, `getLiveMarkets`,
  `getLiveMarketByPool`/`…ByAddress`, `getLiveFills`, `getLiveUserFills`,
  `getLiveUserOrders`, and the locally materialized resting books
  `getLiveBinaryOrderBook` (binary, 4-sided) / `getLiveSpotOrderBook` — synchronous,
  zero round-trips, scoped to what you watch. Every market kind streams; a
  discovery watch picks up new markets from the creation events (the
  MarketCreator's rolling series AND direct `BinaryMarketsModule.createMarket`
  markets); binary status/resolution stays current from chain events.
- **Trading** — `client.createTrader(...)` → `placeOrder`, `cancelOrder`,
  `approveBuilder` (opt a routing/builder frontend in for per-order builder
  fees), `placeSpotOrder`, `placeSpotStopOrder`, `mintSet`, `burnSet`, `redeem`,
  `faucet`, `resolve`, `voidMarket`. Each write **awaits its receipt** and
  resolves to `{ hash, receipt }` (`placeOrder` adds `orderId` + `fills`). With a
  `privateKey`/local `account` the SDK signs locally with **fixed fees** and a
  locally-tracked nonce, and sends via Somnia's `realtime_sendRawTransaction` —
  send + confirm in **one round-trip**, zero fee/nonce/gas estimation RPCs. In
  the browser, pass a `walletClient` (confirm rides the newHeads subscription).
- **Types & helpers** — `Market`/`SpotMarket`/`BinaryMarket` (+ `isSpotMarket`/
  `isBinaryMarket`), `LiveFill`, `LiveOrder`, `BinarySide`, `TailStatus`,
  `kindOf`, `fillKind`, `fromHuman`/`toHuman`, `DECIMALS`, …
- **Chains** (`@somnia-chain/markets-sdk/chains`) — `somniaMainnet` (5031),
  `somniaShannon` (Shannon, 50312), `somniaElwood` (50313),
  `hidekiTestnet` (50383, 10 ms blocks) and `somniaLocal` (anvil, 31337) as
  viem `Chain`s, plus `somniaChains` / `getSomniaChain(id)` / `isSomniaChainId`.
  Nothing here imports chains from `viem/chains` any more
- **Bridge** (same `/chains` entry) — the Hyperlane warp routes between Somnia
  networks as live-verified data (`BridgeToken`, `ChainId`, `SOMNIA_BRIDGE`,
  `getBridgeToken`, `getBridgeNetwork`, …) plus `createBridgeTransfer(...)` → the
  ordered, tagged **unsigned transactions** (`approve` then `bridge`) that move a
  balance. Pure: no RPC, no signer. ⚠️ dev/test bridge — not for real funds
- **Native RPC** (`@somnia-chain/markets-sdk/native`) — `createNative(client)` wraps
  the node's `somnia_*` namespace, exactly the twelve methods in the
  [public JSON-RPC reference](https://docs.somnia.network/developer/json-rpc-api):
  `getBlock` (the native ledger block), `getStatistics`, `listPrivilegedReceipts`,
  `getNodePublicKeys`, the reactivity subscription reads, and
  `sendSessionTransaction` — plus `sessionAddress(seed)` / `sessionPrivateKey(seed)`,
  derived locally with no round-trip. Takes any EIP-1193 client, needs nothing else
  from the SDK
- **Reactivity** (`@somnia-chain/markets-sdk/reactivity`) — a pointer at
  [`@somnia-chain/reactivity`](https://github.com/somnia-chain/reactivity)
  (optional peer dep, re-exported verbatim — no second copy of it here):
  `createReactivity(exchange.client)` → `watch` (a `somnia_watch` socket
  subscription that delivers each event *together with* `eth_call` results from
  the same block), `subscribe` / `subscribeRaw` / `unsubscribe` (Solidity handler
  subscriptions via the precompile) and
  `scheduleSubscriptionAt{Timestamp,Block,Epoch}`, plus `unwrap()` to turn
  upstream's `Error`-returns into throws

Every method, hook, and type is listed in the **API reference**.

## Using a query library (TanStack Query, SWR, …)

The SDK deliberately ships no cache-library wrapper. Two rules cover the whole
surface:

- **Live hooks need no cache.** The `useLive*` hooks read a push-fed store that
  is already a shared singleton — ref-counted watches and deduped hydration mean
  ten components on one pool cost one subscription. Wrapping them in a query
  cache would cache a value that is already live; don't.
- **Async reads go in YOUR query library**, with an `exchange.client` method as
  the `queryFn` and the SDK's exported key factory as the `queryKey`. Every
  client read is a plain promise, which is already the ideal `queryFn`, and the
  key factories (`marketsKey`, `portfolioKey`, `candlesKey`, `syncStatusKey`,
  `marketOnchainKey`, …) are plain functions from the root entry — no query
  library is imported, so they work with any of them. (Client reads take no
  per-request `AbortSignal` — cancellation is client-scoped via
  `ClientConfig.signal`; pass your query library's `signal` to any fetching
  your `queryFn` does itself.)

```tsx
import { useQuery } from "@tanstack/react-query";
import { candlesKey } from "@somnia-chain/markets-sdk";

const { data: candles } = useQuery({
  queryKey: candlesKey(pool, 60, { limit: 500 }),
  queryFn: () => client.getCandles(pool, 60, { limit: 500 }),
  refetchInterval: 15_000,
});
```

After a write, invalidate by the same factory —
`queryClient.invalidateQueries({ queryKey: portfolioKey(account) })` — or
everything SDK-shaped at once with the `["somnia-markets"]` prefix
(`QUERY_KEY_SCOPE`). Hand-written key strings drift; the factories are the one
canonical spelling per read.

Outside a query library, `useIndexerQuery(fn, deps)` remains the built-in
option: it re-runs on dep changes, keeps `data`/`loading`/`error`, and aborts a
superseded request via the `AbortSignal` it passes to `fn`.

## How the live feed works

You get instant updates without running your own indexer — scoped to exactly
the markets you watch. Opening a watch loads a consistent snapshot of that
scope (the one and only indexer touch), then keeps it current by streaming its
on-chain events over a WebSocket — so trades, orders, prices, and the resting
order book itself update the moment they're final on-chain. There is no polling
anywhere: the WebSocket is the only realtime transport, and if it drops the
watches heal themselves by reconnecting with backoff and backfilling the missed
blocks straight from chain.

## Debugging

The SDK is silent by default. To see what a client is doing — every trader
call, the sign/broadcast pipeline, live-tail hydration and block application —
pass a `debug` sink in the config. Events are structured data (`DebugEvent`:
log lines plus span start/end pairs with ids, explicit `parentId` links,
durations, and errors), so the sink owns all filtering and formatting. The
toggle mechanism belongs to your app, not the SDK:

The bundled `consoleDebugSink()` renders the stream as an indented span tree
(reconstructed from `parentId`, so it stays correct under concurrency):

```text
[sdk] ▶ trader.placeOrder { params: { pool: "0x…", side: "BUY_YES" } }
[sdk]   ▶ trade.execute { functionName: "placeBinaryOrder", … }
[sdk] liveTail applying logs { received: 3, … }
[sdk]     ▶ trade.signCall
[sdk]     ◀ trade.signCall 2.1ms
[sdk]     · trade.execute { hash: "0x…" }
[sdk]   ◀ trade.execute 38.2ms
[sdk] ◀ trader.placeOrder 41.0ms
```

```ts
import { consoleDebugSink } from "@somnia-chain/markets-sdk";

// Browser (explorer dev) — flip on from devtools with
// localStorage.setItem("sdk-debug", "1") and reload:
const exchange = new SomniaMarkets({
  ...config,
  debug: localStorage.getItem("sdk-debug") ? consoleDebugSink() : undefined,
});

// Node bot — JSON lines behind an env var:
const exchange = new SomniaMarkets({
  ...config,
  debug: process.env.SDK_DEBUG
    ? (e) => console.log(JSON.stringify(e, (_, v) => (typeof v === "bigint" ? v.toString() : v)))
    : undefined,
});
```

In tests, `debugCollector()` captures the stream with typed filters:

```ts
import { debugCollector } from "@somnia-chain/markets-sdk";

const c = debugCollector();
const exchange = new SomniaMarkets({ ...config, debug: c.sink });
await exchange.trader.placeOrder(params);
expect(c.starts("trade.execute")).toHaveLength(1);
```

Span events map 1:1 onto OpenTelemetry (`name` ↔ span name, `data` ↔
attributes, `error` ↔ status, `parentId` ↔ context link), so a real tracer is
just a sink that keeps a `Map<id, Span>` — `phase: "start"` calls
`tracer.startSpan(...)` (linking `parentId` via OTel context) and
`phase: "end"` calls `span.end()`. The OTel dependency lives entirely in your
app; the SDK stays dependency-free.
