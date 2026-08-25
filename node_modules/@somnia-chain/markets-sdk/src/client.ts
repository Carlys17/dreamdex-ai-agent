// viem public client builder. Each createClient() builds one WebSocket client
// (lazily, on first chain I/O) and shares it across its tail subscriptions and
// every on-chain read/write. WebSocket is the ONLY transport — subscriptions
// (newHeads, logs) push, reads pipeline concurrently on the socket, and writes
// confirm server-side via realtime_sendRawTransaction. Nothing polls and
// nothing falls back to HTTP: a broken socket surfaces as an ERROR (bounded by
// the request timeout below), which the live tail answers by reconnecting with
// backoff — it is never papered over by a slower transport.
//
// No request batching is set: viem's webSocket transport has no batch option
// (only http does), and it isn't needed — the persistent socket pipelines
// concurrent requests (the `Promise.all` reads in getMarketOnchain /
// getBinaryOrderBook overlap on the wire rather than serializing).

import {
  ChainDoesNotSupportContract,
  createPublicClient,
  webSocket,
  type Chain,
  type PublicClient,
} from "viem";
import * as Revert from "./revert.js";

// Bounded WebSocket request timeout. viem's default (10s) lets a stalled socket
// sit for a long time, and a socket that connects but never answers would hang
// a request/response read forever. A short timeout turns that stall into an
// error that propagates to the caller (and trips the tail's reconnect).
const WS_REQUEST_TIMEOUT_MS = 4_000;

/**
 *  The two views of one chain connection: `decorated` for the SDK's own reads,
 *  `raw` for a caller who wants viem's semantics.
 *
 *  **Details**
 *
 *  Both ride ONE WebSocket. `decorated` is `{ ...raw, readContract, call }` — a
 *  spread copy — so it shares `raw`'s `transport` and `uid` and issues requests
 *  down the same socket. Handing out `raw` therefore costs no extra connection.
 *
 *  **Gotchas**
 *
 *  Which one a caller holds decides what a reverting read throws: `decorated`
 *  gives a typed {@link ContractRevertError}, `raw` gives viem's own error
 *  untouched. Every read INSIDE the SDK must go through `decorated` — see
 *  `createClient`'s `getClient()`, which is the only internal door.
 */
export interface ChainClients {
  /** Undecorated viem client — viem's error contract, verbatim. */
  readonly raw: PublicClient;
  /** The SDK's client: `readContract` / `call` rethrow as typed SDK errors. */
  readonly decorated: PublicClient;
}

/**
 *  Build the WebSocket chain connection for a chain + RPC, in both views.
 *
 *  **Details**
 *
 *  `readContract` and `call` are wrapped on the `decorated` view so a failing
 *  chain read reaches callers as one of OUR typed errors — a decoded
 *  {@link ContractRevertError} when the contract rejected the call, an
 *  {@link RpcError} when the request never got an answer. This is the read-side
 *  counterpart of the write path's funnel in trade.ts, and doing it at the ONE
 *  place the client is constructed covers every chain read in the SDK (the
 *  concept modules' point reads, oracleHub.ts, system.ts, operatorReads.ts —
 *  ~83 call sites) without a wrap at each one.
 *
 *  Returns {@link ChainClients} rather than one client because the SDK owes
 *  callers an undecorated escape hatch (`client.getViemClient()`) that does not
 *  open a second socket. `raw` is that client; it is NOT for internal use.
 *
 *  **Gotchas**
 *
 *  Only the error's TYPE changes here, never the control flow. Chain reads keep
 *  throwing rather than returning `null` — see CONVENTIONS.md "Return + error
 *  contract". Modules that deliberately swallow a read (the `getErc20Decimals`
 *  fallback, for one) still catch and still fall back: a typed error is caught
 *  by the same `catch`.
 */
export function makePublicClient(chain: Chain, wsRpcUrl: string): ChainClients {
  const raw = createPublicClient({
    chain,
    transport: webSocket(wsRpcUrl, { timeout: WS_REQUEST_TIMEOUT_MS }),
  });
  return { raw, decorated: withTypedReadErrors(raw) };
}

/**
 *  Decorates a public client so contract reads reject with SDK errors.
 *
 *  **When to use**
 *
 *  Use to give a caller-supplied `config.publicClient` the same typed-error
 *  treatment {@link makePublicClient} builds in. Kept separate for exactly that
 *  case.
 *
 *  **Details**
 *
 *  Only the two methods that execute contract calls are touched; everything else
 *  on the client is untouched, so this stays a thin boundary rather than a
 *  re-implementation.
 *
 *  Returns a NEW client and never mutates the argument. That matters because
 *  `createTrader({ publicClient })` passes an object the CALLER owns and may use
 *  elsewhere (a shared app-wide viem client, say) — decorating it in place would
 *  reach outside this SDK and change how that caller's own reads throw. A viem
 *  client is a plain `Object.prototype` object of data properties, so the spread
 *  copy is faithful; there are no accessors or symbol keys to lose.
 *
 *  **Gotchas**
 *
 *  Because it returns a new client, the return value is the decorated one — a
 *  caller that ignores it and keeps using the argument gets raw viem errors.
 *  Applying this twice is harmless: {@link Revert.toSdkError} returns an
 *  already-SDK error untouched, so a re-decorated client does not nest errors.
 */
export function withTypedReadErrors(client: PublicClient): PublicClient {
  // Wrap only the methods this client actually has. A caller can pass any
  // viem-compatible client — and the SDK's own tests pass deliberately minimal
  // stubs — so assuming a full PublicClient here would turn a partial client
  // from "works for the reads it supports" into a TypeError at construction.
  const decorated: Record<string, unknown> = {};

  if (typeof client.readContract === "function") {
    const readContract = client.readContract.bind(client);
    decorated.readContract = async (args: Parameters<typeof readContract>[0]) => {
      try {
        return await readContract(args);
      } catch (e) {
        const { address, functionName } = args as { address?: string; functionName?: string };
        throw Revert.toSdkError(e, `readContract ${functionName ?? "?"}`, { address, functionName });
      }
    };
  }

  if (typeof client.call === "function") {
    const call = client.call.bind(client);
    decorated.call = async (args: Parameters<typeof call>[0]) => {
      try {
        return await call(args);
      } catch (e) {
        throw Revert.toSdkError(e, "eth_call", { address: (args as { to?: string }).to });
      }
    };
  }

  // `multicall` needs its own wrapper rather than inheriting the one above. Viem binds
  // client.multicall to the RAW client when the client is created, so the aggregate3 it
  // issues internally resolves the raw readContract — the decorated one here is never
  // consulted. Without this, a revert read through multicall escapes as a bare viem
  // error while the identical read through readContract throws a typed SDK error.
  if (typeof client.multicall === "function") {
    const multicall = client.multicall.bind(client);
    decorated.multicall = async (args: Parameters<typeof multicall>[0]) => {
      try {
        return await multicall(args);
      } catch (e) {
        // A chain that cannot serve Multicall3 (none declared, or declared at a block
        // newer than the one being read) is a CAPABILITY answer, not a failed RPC.
        // Callers switch on it to fall back to individual reads, so it must keep its
        // class — flattening it into RpcError here would make that check unreachable.
        if (e instanceof ChainDoesNotSupportContract) throw e;
        throw Revert.toSdkError(e, "multicall", {
          address: (args as { contracts?: { address?: string }[] }).contracts?.[0]?.address,
        });
      }
    };
  }

  return { ...client, ...decorated };
}
