// Reactivity entry — "@somnia-chain/markets-sdk/reactivity". Somnia's
// event-driven primitive: events pushed to you WITH the state that goes with
// them, either into TypeScript over the socket (`watch`) or into a Solidity
// handler contract (`subscribe`).
//
// This module is a POINTER, not a port. The implementation is the upstream
// package `@somnia-chain/reactivity` (https://github.com/somnia-chain/reactivity),
// which is re-exported here verbatim so a markets consumer reaches reactivity
// through one import instead of learning a second SDK. Nothing below
// reimplements any of it: no copied ABIs, no copied validation, no wrapper
// methods to drift out of step. A symbol that's missing here is missing
// upstream — add it there.
//
// What this entry adds on top is only the glue upstream can't know about:
//   - `createReactivity(client)` — build it from the markets client's socket
//   - `unwrap()` — upstream RETURNS `Error` objects; this SDK throws (CONVENTIONS.md)
//   - `ReactivityNotification` / `ReactivityEvent` — upstream types `onData` as
//     `any`, and its docs put the payload one level too deep; these describe what
//     a live node actually sends (pinned by test/reactivity.e2e.test.ts)
//   - the precompile address + default callback options, which upstream's
//     published build doesn't expose to TypeScript (the defaults exist at
//     runtime but are absent from its .d.ts, so they can't be re-exported)
//   - `isLocalPrecompileUnavailable` — already in this package, and the check you
//     want before any Solidity subscription
//
// INSTALL — `@somnia-chain/reactivity` is an OPTIONAL peer dependency, exactly
// like `react` is for the /react entry: only callers of this subpath need it.
//
//   pnpm add @somnia-chain/reactivity
//
// It is published on npmjs. If your .npmrc pins the whole `@somnia-chain` scope
// to GitHub Packages (this repo's root .npmrc does, for `markets-sdk` itself),
// that pin has to be relaxed for the install to resolve — see docs/REACTIVITY.md.

import { SDK } from "@somnia-chain/reactivity";
import type { Address, Hex, WalletClient } from "viem";
import type { SomniaMarketsClient } from "../somniaMarketsClient.js";

// ---- upstream, re-exported verbatim ----------------------------------------

export {
  /** The reactivity client. `SDK` is upstream's alias for the same class. */
  Reactivity,
  SDK,
  /** ABI of the reactivity precompile (subscription lifecycle + system ticks). */
  SomniaReactivityPrecompileABI,
  /** ABI of `ISomniaEventHandler` — the one function a handler contract exposes. */
  SomniaEventHandlerABI,
} from "@somnia-chain/reactivity";

export type {
  BlockTickSubscription,
  BlockTickSubscriptionRequest,
  EpochTickSubscriptionRequest,
  EthCall,
  RpcResponse,
  ScheduleRequest,
  SoliditySubscribeRequest,
  SoliditySubscriptionData,
  SoliditySubscriptionFilter,
  SoliditySubscriptionInfo,
  SoliditySubscriptionOptions,
  SubscriptionCallback,
  WebsocketSubscriptionInitParams,
} from "@somnia-chain/reactivity";

// ---- the glue --------------------------------------------------------------

/**
 *  The Somnia reactivity precompile — a privileged contract at the fixed address
 *  `0x…0100` on every Somnia network. Filter on it as the `emitter` to catch the
 *  precompile's own system ticks (`Schedule` / `BlockTick` / `EpochTick`).
 *
 *  It has NO bytecode, so `eth_getCode` returns `0x` for it — presence cannot be
 *  probed that way. Use {@link isLocalPrecompileUnavailable} on the chain id
 *  instead.
 */
export const SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS: Address = "0x0000000000000000000000000000000000000100";

/**
 *  Callback gas/fee options for a subscription that doesn't care: no tip, a
 *  20 gwei ceiling, 10M gas per callback. These are the protocol's own defaults
 *  (`SomniaExtensions.DEFAULT_*`), spelled out here because upstream's published
 *  build ships `defaultSubscriptionOptions` at runtime but leaves it out of its
 *  type declarations — a test pins these values against upstream's.
 *
 *  The precompile's own rules on these: `gasLimit` must be in `(0, 200_000_000]`,
 *  and a non-zero `maxFeePerGas` must sit at least 6 gwei above
 *  `priorityFeePerGas` (pass `0` to skip that check).
 */
export const DEFAULT_SUBSCRIPTION_OPTIONS = {
  priorityFeePerGas: 0n,
  maxFeePerGas: 20_000_000_000n,
  gasLimit: 10_000_000n,
} as const;

/**
 *  One matched log plus the results of the subscription's `ethCalls`, both read at
 *  the same block — the thing a `somnia_watch` subscription exists to deliver.
 *
 *  Typed here because upstream types `onData` as `(data: any) => void`, so a
 *  caller gets no help at all; and because upstream's own `SubscriptionCallback`
 *  describes neither the envelope nor `address`. The shape below is what a live
 *  Shannon node actually sends (see test/reactivity.e2e.test.ts, which asserts
 *  it against the real chain).
 */
export interface ReactivityEvent {
  /** Contract that emitted the log. */
  address: Address;
  /** Topics of the matched log, topic0 first. */
  topics: Hex[];
  /** ABI-encoded non-indexed data of the matched log. */
  data: Hex;
  /** Raw return data of each `ethCall`, in the order subscribed. */
  simulationResults: Hex[];
}

/**
 *  What `watch`'s `onData` is actually called with.
 *
 *  NOTE the nesting: viem's WebSocket transport unwraps the JSON-RPC envelope
 *  before handing it over, so the payload is at **`notification.result`** — not
 *  `notification.params.result`, which upstream's README and type docs still
 *  describe (verified against a live node).
 *
 * ```ts
 * onData: (n: ReactivityNotification) => console.log(n.result.simulationResults)
 * ```
 */
export interface ReactivityNotification {
  /** The node's subscription id this notification belongs to. */
  subscription: string;
  /** The matched log + its atomic call results. */
  result: ReactivityEvent;
}

/** Optional extras for {@link createReactivity}. */
export interface CreateReactivityOptions {
  /**
   *  Wallet client that signs the subscription writes; its account becomes the
   *  subscription OWNER and funds every callback. Omit for read-only /
   *  `watch`-only use.
   */
  wallet?: WalletClient;
}

/**
 *  Build a reactivity client on the markets client's own WebSocket — the socket
 *  is already open and already pointed at the right node, and `watch` needs a
 *  WebSocket transport.
 *
 * ```ts
 * import { SomniaMarkets } from "@somnia-chain/markets-sdk";
 * import { createReactivity, unwrap } from "@somnia-chain/markets-sdk/reactivity";
 * import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
 *
 * const exchange = new SomniaMarkets({ chain: somniaShannon, wsRpcUrl, indexerUrl });
 * const reactivity = createReactivity(exchange.client);
 *
 * // Every Transfer on the collateral token, with the sender's new balance read
 * // at the very same block — one notification, no follow-up call.
 * const watch = unwrap(
 *   await reactivity.watch({
 *     eventContractSources: [collateral],
 *     topicOverrides: [transferTopic],
 *     ethCalls: [{ to: collateral, data: balanceOfCalldata }],
 *     onData: (n: ReactivityNotification) => console.log(n.result.simulationResults),
 *   }),
 * );
 * await watch.unsubscribe();
 * ```
 *
 *  @param client The markets client (`exchange.client`) whose public client to use.
 *  @param opts Optional wallet client for the write methods.
 *  @returns An upstream `SDK` instance — the full reactivity surface.
 */
export function createReactivity(
  client: Pick<SomniaMarketsClient, "getViemClient">,
  opts: CreateReactivityOptions = {},
): SDK {
  return new SDK({
    public: client.getViemClient(),
    ...(opts.wallet ? { wallet: opts.wallet } : {}),
  });
}

/**
 *  Turn an upstream result into a value or a throw.
 *
 *  Every `@somnia-chain/reactivity` method resolves to `T | Error` rather than
 *  throwing — a shape a caller can forget to check, then treat a failure as a
 *  transaction hash. This SDK's contract is that failures throw
 *  (CONVENTIONS.md), so wrap upstream calls in `unwrap` to get that back.
 *
 * ```ts
 * import { unwrap } from "@somnia-chain/markets-sdk/reactivity";
 *
 * // Throws on a rejected subscription instead of returning an Error object.
 * const hash = unwrap(
 *   await reactivity.subscribe({ handlerContractAddress, filter: { emitter }, options }),
 * );
 * ```
 *
 *  @param result Whatever an upstream reactivity method resolved to.
 *  @returns `result`, narrowed to exclude `Error`.
 *  @throws The `Error` upstream returned, unchanged.
 */
export function unwrap<T>(result: T | Error): T {
  if (result instanceof Error) throw result;
  return result;
}

/**
 *  True when a chain id has no reactivity precompile — a local anvil/hardhat dev
 *  chain (31337 / 1337). Solidity subscriptions are testnet/mainnet only; check
 *  this first so a missing precompile reads as a clear precondition rather than an
 *  opaque revert.
 */
export { isLocalPrecompileUnavailable } from "../preflight.js";
