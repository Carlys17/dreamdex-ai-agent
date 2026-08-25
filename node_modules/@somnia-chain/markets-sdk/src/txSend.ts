// Shared raw-transaction plumbing for every SDK write surface — the ONE
// implementation of signer resolution, the realtime_sendRawTransaction
// broadcast (with the eth_sendRawTransaction fallback), and the
// newHeads-subscription receipt wait. trade.ts (hot-path trading),
// chains/bridge/send.ts (one-off bridge steps) and machineryWriter.ts (admin +
// lend writes) all ride these; per-surface policy (nonce caching, probe
// caching, retry stance) stays at the call site via the options below.
//
// A LEAF on purpose: imports viem and the error vocabulary (errors.ts, itself
// import-free) only, so chains/bridge (which must stay import-light) and
// trade.ts can both reach it without layering cycles.

import {
  formatTransactionReceipt,
  type Account,
  type Address,
  type Hash,
  type Hex,
  type LocalAccount,
  type NonceManager,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SignerRequiredError } from "./errors.js";

/** The signer sources every SDK write surface accepts (trader, admins, lender). */
export interface SignerSources {
  /** A pre-built signer (e.g. a browser/wagmi wallet over an injected provider). */
  walletClient?: WalletClient;
  /** A local signing account (e.g. from viem's privateKeyToAccount). */
  account?: Account | Address;
  /** Private key — the SDK derives the account. */
  privateKey?: Hex;
}

/** What {@link resolveSigner} hands back — the two send paths plus the identity. */
export interface ResolvedSigner {
  /** Set when the SDK can sign locally (privateKey or a signing account). */
  localAccount: LocalAccount | undefined;
  /** The external signer, when one was provided. */
  walletClient: WalletClient | undefined;
  /** The signing identity — an Account, or a bare address for external signers. */
  from: Account | Address;
  /** `from` as a plain address. */
  fromAddress: Address;
}

/**
 *  Resolve a write surface's signer config into the two send paths. Two ways in:
 *    1. a privateKey / local account — the SDK signs locally (the fast path);
 *    2. an explicit walletClient (browser/wagmi over an injected provider).
 *  Throws {@link SignerRequiredError} (naming `label`, e.g. "createTrader")
 *  when neither is usable. `nonceManager` is threaded into a derived
 *  private-key account so the hot path can track nonces locally; surfaces that
 *  fetch the nonce per call omit it.
 */
export function resolveSigner(
  config: SignerSources,
  label: string,
  opts: { nonceManager?: NonceManager } = {},
): ResolvedSigner {
  const localAccount: LocalAccount | undefined = config.privateKey
    ? privateKeyToAccount(config.privateKey, opts.nonceManager ? { nonceManager: opts.nonceManager } : {})
    : typeof config.account === "object" && "signTransaction" in config.account
      ? (config.account as LocalAccount)
      : undefined;
  const walletClient: WalletClient | undefined = config.walletClient;
  if (!localAccount && !walletClient) {
    throw new SignerRequiredError(label);
  }
  const resolved = localAccount ?? config.account ?? walletClient?.account;
  if (!resolved) {
    throw new SignerRequiredError(label);
  }
  const from: Account | Address = resolved;
  const fromAddress: Address = typeof from === "string" ? from : from.address;
  return { localAccount, walletClient, from, fromAddress };
}

/**
 *  True when an RPC error means "this node doesn't implement that method"
 *  (JSON-RPC -32601 Method not found; some nodes surface it as -32601 nested,
 *  others as an Invalid-params -32602 for the unknown method's args).
 *
 *  Deliberately WIDER than native/errors' probes: a send path treats "the node
 *  garbled the unknown method's params" as "no realtime here" and falls back,
 *  while the native module's `isMethodNotFound` must not read a genuine
 *  invalid-params error on a real somnia_* method as the method missing.
 */
export function isMethodUnsupported(e: unknown): boolean {
  const code = (e as { code?: number; cause?: { code?: number } })?.code
    ?? (e as { cause?: { code?: number } })?.cause?.code;
  if (code === -32601 || code === -32602) return true;
  const msg = ((e as { message?: string })?.message ?? "").toLowerCase();
  return msg.includes("method not found") || msg.includes("not supported") || msg.includes("does not exist");
}

// The raw request shape a broadcast rides. realtime_sendRawTransaction is
// outside viem's typed RPC schema, so the client's `request` is cast to this
// ONCE, here, instead of at every call site.
type RpcRequest = (
  args: { method: string; params: readonly unknown[] },
  options?: { retryCount?: number },
) => Promise<unknown>;

/** Per-surface knobs for {@link broadcastSigned} — see each consumer for its stance. */
export interface BroadcastSignedOptions {
  /** Error-message prefix, e.g. `"@somnia-chain/markets-sdk"` — names the surface. */
  label: string;
  /**
   *  Transport retry count passed on BOTH send legs. `0` for a value-bearing
   *  one-shot (a send that was accepted but whose response was lost would be
   *  submitted AGAIN on retry — the second attempt then fails "nonce too low"
   *  at best). Leave unset to pass NO options and keep viem's default
   *  transport retries (trade.ts's current stance — the discrepancy is
   *  deliberate and visible at each call site).
   */
  retryCount?: number;
  /**
   *  Probe gate for the realtime attempt (default: always try). trade.ts feeds
   *  its cached per-trader flag here so production never pays a probe per
   *  write; one-shot surfaces (bridge, machinery) probe per call.
   */
  isRealtimeSupported?: () => boolean;
  /** Fired once when the node reports realtime as missing (cache the fallback). */
  onRealtimeUnsupported?: () => void;
  /**
   *  Fired on any REAL rejection — a realtime error that isn't
   *  method-unsupported (including the returned-no-receipt throw), or any
   *  fallback-leg failure including the receipt wait. trade.ts re-syncs its
   *  local nonce here so the next write doesn't inherit a gap.
   */
  onRejected?: () => void;
  /** Receipt wait for the eth_sendRawTransaction fallback leg. */
  waitReceipt: (hash: Hash) => Promise<TransactionReceipt>;
  /**
   *  Map a real rejection into the surface's error vocabulary before it is
   *  thrown; `method` names the leg that failed (`realtime_sendRawTransaction`
   *  or `eth_sendRawTransaction`). The trader decodes reverts to their Solidity
   *  error name here; surfaces that propagate raw transport errors omit it.
   */
  decorateError?: (e: unknown, method: string) => Error;
}

/**
 *  Broadcast a signed tx. Fast path: Somnia's `realtime_sendRawTransaction`,
 *  which blocks server-side until the receipt is available and returns it
 *  (with logs) in ONE round-trip — no client-side confirm. Fallback: a
 *  standard node (anvil, stock geth) that lacks the method →
 *  `eth_sendRawTransaction` + `waitReceipt`, so the same code runs everywhere.
 */
export async function broadcastSigned(
  client: Pick<PublicClient, "request">,
  serialized: Hex,
  opts: BroadcastSignedOptions,
): Promise<TransactionReceipt> {
  const request = client.request as RpcRequest;
  const send = (method: string): Promise<unknown> =>
    opts.retryCount === undefined
      ? request({ method, params: [serialized] })
      : request({ method, params: [serialized] }, { retryCount: opts.retryCount });

  if (opts.isRealtimeSupported?.() ?? true) {
    try {
      const raw = await send("realtime_sendRawTransaction");
      if (raw == null) throw new Error(`${opts.label}: realtime_sendRawTransaction returned no receipt`);
      return formatTransactionReceipt(raw as never);
    } catch (e) {
      if (!isMethodUnsupported(e)) {
        opts.onRejected?.();
        throw opts.decorateError ? opts.decorateError(e, "realtime_sendRawTransaction") : e;
      }
      // Node lacks realtime_sendRawTransaction. The tx was never accepted, so
      // any locally-tracked nonce is still valid; re-send it below.
      opts.onRealtimeUnsupported?.();
    }
  }
  try {
    const hash = (await send("eth_sendRawTransaction")) as Hash;
    return await opts.waitReceipt(hash);
  } catch (e) {
    opts.onRejected?.();
    throw opts.decorateError ? opts.decorateError(e, "eth_sendRawTransaction") : e;
  }
}

/**
 *  Wait for a tx receipt off the WebSocket `newHeads` subscription — the
 *  fallback-leg confirm on nodes without realtime, and the external-signer
 *  confirm (an injected wallet sends; the SDK watches). On each pushed head we
 *  read the receipt; first hit wins. No poll, no timeout: a subscription error
 *  rejects and propagates to the caller.
 */
export async function waitReceiptViaHeads(publicClient: PublicClient, hash: Hash): Promise<TransactionReceipt> {
  const immediate = await publicClient.getTransactionReceipt({ hash }).catch(() => undefined);
  if (immediate) return immediate;

  return new Promise<TransactionReceipt>((resolve, reject) => {
    let settled = false;
    let unwatch: (() => void) | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unwatch?.();
      fn();
    };
    const check = async () => {
      const r = await publicClient.getTransactionReceipt({ hash }).catch(() => undefined);
      if (r) finish(() => resolve(r));
    };
    // viem types poll:false as WebSocket-only; our client IS a WS client at
    // runtime (makePublicClient) but the generic PublicClient erases the
    // transport, so assert the subscribe-mode (eth_subscribe newHeads) args.
    // Concurrent confirms share one underlying eth_subscribe (viem dedups).
    unwatch = publicClient.watchBlockNumber({
      poll: false,
      emitOnBegin: false,
      onBlockNumber: check,
      onError: (e: Error) => finish(() => reject(e)),
    } as unknown as Parameters<typeof publicClient.watchBlockNumber>[0]);
    // Cover the race where the tx mined between the immediate read and the
    // subscription starting.
    void check();
  });
}
