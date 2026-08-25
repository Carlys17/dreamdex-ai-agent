// Engine config, carried by the exchange (`new SomniaMarkets(config)` passes it
// through). There is no module-global config; each exchange owns its own.
// snapshot.ts / liveTail.ts / reads etc. receive what they need from the
// client, not from here.

import type { Address, Chain } from "viem";
import { NotConfiguredError } from "./errors.js";
import type { DebugEvent } from "./debug.js";
import type { LendAddresses } from "./lend/types.js";

/** Protocol contract addresses (all optional — features degrade if unset). */
export interface SomniaMarketsAddresses {
  /** FakeOracle resolver (demo resolve/void). */
  fakeOracle?: Address;
  /**
   *  Per-venue collateral ERC-20 (the venue's quote/collateral token; on test
   *  environments this is the faucet-capable TestUSDC). Preferred over
   *  `testUsdc`, which remains as the legacy/fallback alias.
   */
  collateral?: Address;
  /**
   *  TestUSDC collateral (faucet + balances). Legacy/fallback alias for
   *  {@link SomniaMarketsAddresses.collateral}.
   */
  testUsdc?: Address;
  /**
   *  BinaryMarketsModule — the binary product's core module (complete-set
   *  mint/redeem, market creation, adapter approval). Needed by the trader
   *  writes, the hub-approval reads, and /system diagnostics.
   */
  binaryModule?: Address;
  /**
   *  MarketCreator factory. When set, the live tail watches MarketCreated and
   *  picks up new binary markets the block they deploy — no indexer round-trip.
   */
  marketCreator?: Address;
  /**
   *  ClobFactory — /system-diagnostics fallback when the module's live
   *  `clobFactory()` read fails; a live/config mismatch is flagged.
   */
  clobFactory?: Address;
  /**
   *  BinaryPool implementation the factory clones (the EIP-1167 master copy;
   *  distinct from the factory's `binaryMarketImpl`). Not read by the SDK
   *  itself, but surfaced to apps — the explorer's system overview renders it.
   */
  binaryPoolImpl?: Address;
  /**
   *  The permanent BinarySettlement singleton (settlement-extraction v2). Every
   *  pool finalizes its markets into it and every redemption routes through it,
   *  so a pool can be recycled onto the next market. Needed by the low-level
   *  `redeemDirect` / `claimOwed` / `getSettlement` trader methods, which throw
   *  if it is unset. Absent on pre-v2 (pool-redeem) deploys.
   */
  binarySettlement?: Address;
  /**
   *  Shared OperatorPermissionsRegistry — users operator-approve a SpotStopOrderRegistry
   *  here (once, globally) so it can place their stop order via the pool at trigger time.
   */
  operatorPermissionsRegistry?: Address;
  /**
   *  MarketsCore — the control-plane registry of operators, typed venues, and
   *  the module binding per market type. Needed by the operator/venue admin
   *  reads + `createOperatorAdmin` writes.
   */
  marketsCore?: Address;
  /**
   *  CollateralRouter periphery — the native-token (wrap/unwrap) + Permit2 entry
   *  over BinaryMarketsModule's complete-set flow. May be absent for an
   *  environment where only the plain-ERC-20 path is deployed; the router-based
   *  trader methods throw if it is unset rather than sending to the zero address.
   */
  collateralRouter?: Address;
  /**
   *  MarketCreatorFactory — stamps out per-operator/venue MarketCreator (+ its
   *  policy) instances, the operator "market machinery" layer. Needed by
   *  `createMarketCreatorAdmin` writes; the admin throws if it is unset.
   */
  marketCreatorFactory?: Address;
  /**
   *  The OracleHub proxy (Oracle v2 §8e) — the protocol's ONE
   *  governance-approved oracle adapter. Every market creation binds through it
   *  (content-addressed `scheduleQuestion` dedup, earmark-at-creation resolution
   *  funding + bounded-drain exact metering, payout-vector delivery). Needed by
   *  the OracleHub reads (`quoteCreateMarketValue`, `getSchedulingCost`,
   *  `earmarkedOf`, `resolveReserve`) and the `createOracleHubAdmin` writes; those throw if it
   *  is unset. Also the default `adapter` for
   *  `createMarketCreatorAdmin.createMarketCreator`.
   */
  oracleHub?: Address;
  /**
   *  @deprecated LEGACY (pre-oracle-v2): OracleAdapterFactory. The factory
   *  contract was deleted in Oracle v2 — use {@link SomniaMarketsAddresses.oracleHub}.
   *  Kept only so old configs keep type-checking; nothing in the SDK reads it.
   */
  oracleAdapterFactory?: Address;
  /**
   *  @deprecated LEGACY (pre-oracle-v2): the shared ProphecyOracleAdapter proxy.
   *  Replaced by {@link SomniaMarketsAddresses.oracleHub}. Kept only so old
   *  configs keep type-checking; nothing in the SDK reads it.
   */
  sharedOracleAdapter?: Address;
  /**
   *  SomniaLend money-market addresses — a THIRD-PARTY Aave v3 fork
   *  (docs.somnialend.finance), so unlike the first-party fields above these
   *  are NOT in the deployments manifests. Set `SOMNIA_MAINNET_LEND` or
   *  `SOMNIA_TESTNET_LEND` (from the root entry) for the
   *  published deployments. Backs the `client.lend` namespace; its methods
   *  throw a clear error when the address they need is unset.
   *
   *  **Gotchas**
   *
   *  This is the ONLY way to point the lend surface at a deployment — and the
   *  addresses must belong to this client's `chain`. A testnet deployment needs a
   *  testnet client; there is no way to graft one chain's lend addresses onto
   *  another chain's socket.
   *
   *  @example
   *  ```ts
   *  const exchange = new SomniaMarkets({
   *    ...config,
   *    addresses: { lend: SOMNIA_MAINNET_LEND },
   *  });
   *  const account = await exchange.client.lend.getAccount(me);
   *  console.log(`health factor ${account.healthFactor}`);
   *  ```
   */
  lend?: LendAddresses;
}

/**
 *  The realtime price-feed endpoint — the standalone EMA price-feed indexer
 *  (Hasura GraphQL). ONE endpoint serves every tracked asset (BTC/USDC, ETH/USDC,
 *  …); callers select an asset by filter. Snapshot + history read over HTTP; live
 *  prices stream over a Hasura WebSocket subscription.
 */
export interface PriceFeedConfig {
  /** HTTP GraphQL endpoint (snapshot + history + candles, all assets). */
  url: string;
  /**
   *  WebSocket GraphQL endpoint for live subscriptions. Derived from `url`
   *  (http→ws, https→wss) when omitted.
   */
  wsUrl?: string;
  /**
   *  Quote asset to pin every read to (e.g. `"USDC"`), case-insensitive. The feed
   *  indexes SEVERAL quotes per base (`BTC/USDC`, `BTC/USDT`), so `base` alone is
   *  no longer a unique feed key: leaving this unset matches every quote, which
   *  double-counts a base that trades against more than one quote — duplicate
   *  candle buckets (a hard error in charting libs that require strictly
   *  ascending, unique timestamps), an arbitrary `Feed`/tick row per push.
   *  Set it to the quote you want (leave unset only if a base has one quote).
   */
  quote?: string;
}

/**
 *  The known Somnia-testnet price feed (dev) — one endpoint serving every asset.
 *  Wire it up with `priceFeed: SOMNIA_TESTNET_PRICE_FEED`. Pinned to the USDC
 *  quote: the feed also holds now-stale USDT history, and matching both quotes
 *  double-counts each base (see {@link PriceFeedConfig.quote}).
 */
export const SOMNIA_TESTNET_PRICE_FEED: PriceFeedConfig = {
  url: "https://price-feed.dev.oracle.somnia.host/v1/graphql",
  quote: "USDC",
};

/**
 *  Fixed EIP-1559 fees every SDK-signed write uses. The SDK never estimates fees
 *  — no per-order eth_gasPrice / fee-history round-trip. `maxFeePerGas` is a
 *  ceiling (the tx pays base fee + tip, the rest is refunded), so a generous
 *  fixed value costs nothing extra on Somnia's flat gas market.
 */
export interface FixedFees {
  /** Total fee ceiling (wei per gas); the unspent margin over base fee + tip refunds. */
  maxFeePerGas: bigint;
  /** Priority tip (wei per gas) paid to the proposer on top of the base fee. */
  maxPriorityFeePerGas: bigint;
}

/**
 *  SDK default for {@link ClientConfig.fees}: 60 gwei ceiling (~10× the observed
 *  Somnia base fee of 6 gwei), zero tip — instant BFT inclusion needs no bribe.
 */
export const DEFAULT_FEES: FixedFees = {
  maxFeePerGas: 60_000_000_000n,
  maxPriorityFeePerGas: 0n,
};

/**
 *  Fixed gas ceiling every SDK-signed write uses (10M). Gas is never estimated —
 *  Somnia's gas schedule is far dearer than mainnet's (measured live, even an
 *  ERC-20 `approve` runs out of gas under a 1M limit), and skipping the
 *  per-call `eth_estimateGas` round-trip is part of the one-round-trip write
 *  doctrine. × 60 gwei this is a 0.6 STT envelope; the unused remainder is not
 *  charged, but the mempool admits a transaction only when the ceiling is
 *  funded on top of its `value`. Every write surface accepts a per-call `gas`
 *  override.
 */
export const DEFAULT_GAS = 10_000_000n;

/**
 *  Configuration for a {@link SomniaMarketsClient}. `indexerUrl` is always required.
 *  `chain` + `wsRpcUrl` power the live tail, on-chain reads, and writes — they're
 *  required by those features, but the WebSocket socket is opened lazily, so an
 *  indexer-only client (e.g. server-side GraphQL reads) that never touches the
 *  chain never opens one.
 */
export interface ClientConfig {
  /** Envio/Hasura GraphQL endpoint (HTTP). Same-origin relative paths are fine. */
  indexerUrl: string;
  /**
   *  Extra headers sent with every indexer request — e.g. a Hasura role /
   *  admin-secret for SERVER-side reads that need privileges the public role
   *  lacks (notably `_aggregate` fields, which envio hides from the public
   *  role). MUST stay server-only; never construct a browser client with a
   *  secret here.
   */
  indexerHeaders?: Record<string, string>;
  /**
   *  Cancels this client's in-flight INDEXER reads when aborted — pass one
   *  per request on a server, or a component's controller signal in a UI, so a
   *  navigation away stops work already on the wire.
   *
   *  **Details**
   *
   *  Client-wide, not per-read: it is combined with the SDK's own request timeout
   *  (whichever fires first wins). An abort re-throws YOUR abort reason
   *  unwrapped rather than an {@link IndexerError}, so `name === "AbortError"`
   *  checks keep working — a cancellation is not an indexer failure.
   *
   *  **Gotchas**
   *
   *  Covers indexer reads only. Chain reads go over the WebSocket transport,
   *  which is bounded by its own request timeout instead.
   */
  signal?: AbortSignal;
  /** viem chain the markets live on. */
  chain: Chain;
  /**
   *  Chain WebSocket RPC — the single chain transport. The live tail subscribes
   *  to logs + new heads over it, and all on-chain reads/writes use it too.
   *  There is no HTTP fallback: the SDK assumes a healthy WebSocket.
   *
   *  Optional when `chain` carries a WebSocket endpoint — every definition in
   *  `@somnia-chain/markets-sdk/chains` does (`rpcUrls.default.webSocket`), so
   *  with those this is only an override. viem's own `somniaTestnet` lacks one,
   *  so with that chain (or any ws-less definition) it stays required and the
   *  first chain touch throws {@link NotConfiguredError} without it.
   */
  wsRpcUrl?: string;
  /**
   *  Fixed fees for SDK-signed writes (default {@link DEFAULT_FEES}). Override
   *  for a chain whose base fee can exceed the default ceiling.
   */
  fees?: FixedFees;
  /**
   *  Protocol contract addresses — used by the write client, the live tail's
   *  factory watch, and /system reads.
   */
  addresses?: SomniaMarketsAddresses;
  /**
   *  The realtime price-feed endpoint (see {@link PriceFeedConfig}). One endpoint
   *  serves every asset; callers filter by asset. Required only for the price-feed
   *  methods (`watchPrice`, `getLivePrice`, `fetchPrices`, …); a client that never
   *  touches prices needs none.
   */
  priceFeed?: PriceFeedConfig;
  /**
   *  Opt-in debug/tracing sink. Unset (the default) means the SDK emits nothing
   *  and does no debug-only work. When set, the client sends every
   *  {@link DebugEvent} it produces — structured log lines plus span
   *  start/annotate/end events around trader calls and live-tail hydration —
   *  and the sink decides everything else: filtering, formatting, toggling, or
   *  forwarding to a real tracer (the shape maps 1:1 onto OpenTelemetry). Two
   *  sinks ship with the package: `consoleDebugSink` (indented span tree) and
   *  `debugCollector` (test capture). The toggle mechanism belongs to the app,
   *  not the SDK:
   *
   * @example
   * Explorer (dev) — flip on from devtools via localStorage; a Node bot gates
   * a JSON-lines sink on an env var instead:
   * ```ts
   * const devExchange = new SomniaMarkets({
   *   ...config,
   *   debug: localStorage.getItem("sdk-debug")
   *     ? consoleDebugSink()
   *     : undefined,
   * });
   *
   * const botExchange = new SomniaMarkets({
   *   ...config,
   *   debug: process.env.SDK_DEBUG
   *     ? (e) => console.log(JSON.stringify(e, (_, v) => (typeof v === "bigint" ? v.toString() : v)))
   *     : undefined,
   * });
   * ```
   */
  debug?: (e: DebugEvent) => void;
}

/**
 *  Resolve the price-feed endpoint from config, filling in the WS URL from the
 *  HTTP one (http→ws, https→wss) when unset. Throws a clear error if no endpoint
 *  is configured.
 */
export function resolvePriceFeed(config: ClientConfig): {
  url: string;
  wsUrl: string;
  quote: string | undefined;
} {
  const feed = config.priceFeed;
  if (!feed) {
    throw new NotConfiguredError(
      "config.priceFeed = { url } — the price-feed indexer's GraphQL endpoint",
      "this price-feed read",
    );
  }
  return {
    url: feed.url,
    wsUrl: feed.wsUrl ?? feed.url.replace(/^https?/i, (m) => (m.length === 5 ? "wss" : "ws")),
    // Uppercased to match the feed's canonical quote casing; undefined ⇒ no filter.
    quote: feed.quote ? feed.quote.toUpperCase() : undefined,
  };
}
