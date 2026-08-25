// The write plane: everything a chain write needs, behind one context.
//
// These ~25 helpers were closures inside `createTraderWithDeps`, captured by its
// ~40 write verbs. Concept-first organization moves those verbs into their own
// modules (orders.ts, binary/settlement.ts, …), so what they capture has to
// become an explicit, passable thing — the `Writer`.
//
// Every concept write takes it as its FIRST parameter (data-first, per
// CONVENTIONS.md): `Orders.placeOrder(w, params)`. `createTrader` builds one
// `Writer` and binds the verbs, so `Trader`'s public shape never changes.
//
// The send path (sign → broadcast → confirm, with revert decoding) is the same
// single funnel it has always been: realtime_sendRawTransaction when the node
// has it, standard send + newHeads confirm otherwise, and a mined-but-reverted
// receipt replayed via eth_call to recover the Solidity error name.

import {
  decodeEventLog,
  encodeFunctionData,
  toEventSelector,
  maxUint256,
  type Abi,
  type Account,
  type Address,
  type Hash,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { nonceManager } from "viem/accounts";
import { ContractRevertError, InvalidInputError, NotConfiguredError } from "./errors.js";
import { unreachable } from "./raise.js";
import * as LogTopics from "./logTopics.js";
import * as Revert from "./revert.js";
import * as TxSend from "./txSend.js";
import * as Client from "./client.js";
import * as Config from "./config.js";
import * as DebugMod from "./debug.js";
import * as Store from "./store.js";
import * as Ids from "./ids.js";
import * as EventsAbi from "./eventsAbi.js";
import * as TradeAbi from "./tradeAbi.js";
import * as ReadsAbi from "./readsAbi.js";
import type { ClientConfig } from "./config.js";
import type { Debug } from "./debug.js";
import type { BinarySide } from "./store.js";
import type {
  TraderConfig,
  TxResult,
  PlaceOrderResult,
  PlaceOrderParams,
  OrderFill,
  AmendOrderResult,
  AmendOrdersResult,
} from "./trade.js";

export function farFutureNs(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 50 * 365 * 24 * 3600) * 1_000_000_000n;
}

export const ZERO_BYTES32: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/**
 *  What a placement escrows: collateral for a buy (ceil-rounded), or an outcome
 *  position for a sell (moved under the one-time ERC-6909 operator approval).
 */
export type Escrow =
  | { kind: "erc20"; token: Address; amount: bigint }
  | { kind: "erc6909"; outcomeToken: Address; id: bigint; amount: bigint };

/**
 *  v2 OrderKind enum for `placeBinaryOrder` (0 BUY_YES, 1 SELL_YES, 2 BUY_NO,
 *  3 SELL_NO) — the side is explicit, NOT encoded in userData. The pool maps kind
 *  onto the base book's (isBid, price) internally; the SDK just forwards the enum.
 */
export const ORDER_KIND: Record<BinarySide, number> = {
  BUY_YES: 0,
  SELL_YES: 1,
  BUY_NO: 2,
  SELL_NO: 3,
};

/** One contract write, as the send path sees it. */
export interface WriteCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  gas?: bigint;
  value?: bigint;
}

/**
 *  One unsigned call, ready for any signer: spread into viem's `sendTransaction`,
 *  wrap as an ERC-4337 UserOp call field, or hand to a relayer.
 *
 *  Deliberately minimal, following `BridgeTransaction` in the `/chains` bridge
 *  module: no nonce, no fees, no gas — those are the signer's job, and pinning
 *  them here would stale the moment the call is cached. `description` is a human
 *  label for a confirmation UI.
 *
 *  Unlike `BridgeTransaction` there is no `chainId`: these calls are always on the
 *  chain the client is already connected to, whereas a bridge leg is explicitly
 *  cross-chain. Note `value` is a `bigint`, so `JSON.stringify` throws on it —
 *  convert it yourself if the call crosses a serialization boundary.
 */
export interface UnsignedCall {
  /** Contract to call. */
  to: Address;
  /** ABI-encoded calldata. */
  data: Hex;
  /** Native value to attach, in wei. `0n` unless the call pays native. */
  value: bigint;
  /** What this call does, for a UI to label a confirmation with. */
  description: string;
}

/**
 *  @internal A {@link WriteCall} as an unsigned transaction request.
 *
 *  Lives here rather than beside any one build verb because several modules
 *  (`perp/stops.ts`, `perp/margin.ts`, `orders.ts`) encode through it, and the
 *  point of a build verb is that its bytes cannot diverge from what the sending
 *  twin puts on the wire — one encoder keeps that true.
 */
export function toUnsigned(call: WriteCall, description: string): UnsignedCall {
  return {
    to: call.address,
    data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }),
    value: call.value ?? 0n,
    description,
  };
}

/**
 *  @internal The ERC-20 `approve` a write needs first, as an unsigned call.
 *
 *  `maxUint256`, as the send path's `approveIfNeeded` uses — so the two agree, and
 *  a caller who batches this once is not asked again.
 */
export function approvalCall(token: Address, spender: Address, description: string): UnsignedCall {
  return toUnsigned(
    { address: token, abi: TradeAbi.erc20WriteAbi, functionName: "approve", args: [spender, maxUint256], gas: 0n },
    description,
  );
}

/**
 *  A placement expanded into the unsigned calls it actually takes.
 *
 *  Two or one: a placement that escrows an ERC-20 (or outcome tokens) needs an
 *  approval before the order call, while a native-base sell and every perp
 *  placement need only the order. `approval` is simply absent when there is
 *  nothing to approve — branching on it narrows:
 *
 * ```ts
 * const { order, approval } = await trader.buildPlaceOrder(params);
 * if (approval) await walletClient.sendTransaction({ ...approval, account });
 * await walletClient.sendTransaction({ ...order, account });
 * ```
 *
 *  The approval is RETURNED, never sent — unlike `placeOrder`, which sends it as
 *  a side effect. A caller who skips a needed approval gets an on-chain revert,
 *  so check `approval` rather than assuming it is handled.
 *
 *  `approval` is present whenever the placement escrows something, without
 *  checking the current allowance (that check is an `eth_call`, which a
 *  build-only verb should not make) — so it may be redundant, never short: it
 *  approves `maxUint256`, as the send path does. (A token that demands its
 *  allowance be zeroed before being re-set would reject that, same as on the send
 *  path.) Pass `autoApprove: false` to drop it and skip the escrow lookup.
 */
export interface UnsignedOrder {
  /** The placement call itself. */
  order: UnsignedCall;
  /** The approval the placement needs first; absent when nothing needs approving. */
  approval?: UnsignedCall;
}

/** A pool's escrow tokens — the ERC-6909 singleton, this market's ids, the collateral. */
export interface PoolTokens {
  /** ERC-6909 outcome-token singleton (shared across all markets). */
  outcomeToken: Address;
  /** This pool's YES/NO position ids on the singleton. */
  yesId: bigint;
  noId: bigint;
  collateral: Address;
}

/**
 *  @internal Wiring a writer resolves config/client through — `createClient()`
 *  passes its own so writes share that client's chain, fees, addresses, and
 *  WebSocket.
 */
export interface WriterDeps {
  getConfig: () => ClientConfig;
  getClient: () => PublicClient;
  /** @internal The owning client's debug channel; defaults to a no-op when absent. */
  dbg?: Debug;
}

/**
 *  The chain-write capability every concept write takes as its first parameter.
 *
 *  **Details**
 *
 *  Members are exactly what the write verbs were capturing as closures — the send
 *  funnel (`execute`/`executeOrder`), the idempotent approval + operator grants,
 *  the cached pool/bank/token resolvers, and the config a write needs (gas, fees,
 *  decimals, addresses, signer). Nothing here is a convenience: each member has a
 *  measured call site among the verbs.
 */
export interface Writer {
  /** Send one write and await its receipt; a revert throws {@link ContractRevertError}. */
  execute(call: WriteCall): Promise<TxResult>;
  /** {@link execute} plus order-id/fill decoding from the receipt logs. */
  executeOrder(call: WriteCall): Promise<PlaceOrderResult>;

  /** Escrow tokens for a pool (cached per pool+nonce). */
  poolTokens(pool: Address, nonceOverride?: bigint): Promise<PoolTokens>;
  /** {@link poolTokens} for a placement, honoring explicit param overrides. */
  tokens(p: PlaceOrderParams): Promise<PoolTokens>;
  /** The pool's market expiry (orders must not outlive the market). */
  marketExpiryNs(pool: Address): Promise<bigint>;
  /** Which token+amount a placement escrows, from its side and the pool's tokens. */
  escrow(p: PlaceOrderParams, tokens: PoolTokens): Escrow;

  /** Approve `spender` for `token` if not already approved (cached per pair). */
  approveIfNeeded(token: Address, spender: Address, amount: bigint, gas: bigint): Promise<void>;
  /** Grant the one-time ERC-6909 operator approval if absent (cached per pair). */
  ensureOperator(outcomeToken: Address, spender: Address, gas: bigint): Promise<void>;
  /** Forget cached approvals — call after an external revoke. */
  clearApprovalCache(token?: Address, spender?: Address): void;

  /** The pool's collateral token (explicit override wins). */
  poolCollateral(pool: Address, override?: Address): Promise<Address>;
  /** The margin bank for a perp write, from `marginBank` or the pool. */
  resolveMarginBank(p: { marginBank?: Address; pool?: Address }): Promise<Address>;
  /** A margin bank's collateral token (explicit override wins). */
  bankCollateral(bank: Address, override?: Address): Promise<Address>;
  /** CollateralRouter address, or {@link NotConfiguredError}. */
  resolveRouter(override?: Address): Address;
  /** BinaryMarketsModule address, or {@link NotConfiguredError}. */
  resolveModule(override?: Address): Address;
  /** BinarySettlement address, or {@link NotConfiguredError}. */
  resolveSettlement(override?: Address): Address;
  /** OperatorPermissionsRegistry address, or {@link NotConfiguredError}. */
  resolveOperatorRegistry(override?: Address, attempting?: string): Address;
  /** The settlement singleton's outcome token (cached — immutable). */
  settlementOutcomeToken(settlement: Address): Promise<Address>;

  /** The wrapped public client (chain reads reject with SDK errors). */
  readonly publicClient: PublicClient;
  /** Live addresses from the owning client's config. */
  readonly addresses: () => NonNullable<ClientConfig["addresses"]>;
  /** The signing account (or its address, for an external wallet). */
  readonly from: Account | Address;
  /** The signer's address. */
  readonly fromAddress: Address;
  /** Present only for a local (in-process) signer. */
  readonly localAccount: LocalAccount | undefined;
  /** The external wallet client, for the non-local-signer paths. */
  readonly wallet: () => WalletClient;
  /** The chain writes are sent to. */
  readonly chain: NonNullable<ClientConfig["chain"]>;
  /** Default gas ceiling per write. */
  readonly defaultGas: bigint;
  /** 10^decimals — one whole unit in raw terms. */
  readonly oneBase: bigint;
  /** Collateral/outcome decimals for this client. */
  readonly decimals: number;
  /** The owning client's debug channel. */
  readonly dbg: Debug;
}

/** One OrderBook event, already decoded and known to come from the target pool. */
interface PoolEvent {
  eventName: string;
  args: Record<string, unknown>;
}

/**
 *  topic0 → the one ABI entry that matches it, built once at module load.
 *
 *  Without this, `decodeEventLog` re-derives every candidate's selector on EVERY log
 *  — viem memoizes none of it, so each log costs a keccak per ABI entry until it
 *  matches — and a log that matches nothing costs a thrown `BaseError` (stack capture
 *  + formatted message) that is immediately swallowed. Both are per-log costs that
 *  scale with batch size, on the one path whose entire purpose is MM latency.
 *
 *  Non-matching pool logs are the common case, not the exception: the pool also emits
 *  `OrderAmended` (once per amendment), `MarkPriceUpdated` and `BuilderFeeCharged`,
 *  none of which this ABI carries. A Map miss makes those free.
 */
const ORDER_BOOK_TOPIC0 = LogTopics.topic0Set(EventsAbi.orderBookEventsAbi);

const ORDER_BOOK_EVENT_BY_TOPIC0: ReadonlyMap<Hex, (typeof EventsAbi.orderBookEventsAbi)[number]> =
  new Map(EventsAbi.orderBookEventsAbi.map((e) => [toEventSelector(e), e] as const));

/**
 *  @internal Decode every OrderBook event a receipt carries FOR ONE POOL, in log
 *  order.
 *
 *  Filtering on the pool address is what makes the batch decoders positional: they
 *  map the n-th `OrderPlaced` onto the n-th accepted request, so a stray OrderBook
 *  log from another pool in the same tx would shift every id by one. The singular
 *  `decodeOrderResult` does not need this (it only keeps the last id), which is why
 *  it does not filter.
 *
 *  Logs that are not OrderBook events — ERC-20 Transfers, vault credits, anything
 *  from another contract — do not decode against this ABI and are skipped.
 */
function poolEvents(receipt: TransactionReceipt, pool: Address): PoolEvent[] {
  const target = pool.toLowerCase();
  const out: PoolEvent[] = [];
  for (const log of receipt.logs) {
    // Addresses are folded because the caller's pool is usually EIP-55 checksummed
    // (that is how the deployments package ships them) while a node returns log
    // addresses lowercased. Comparing raw would match nothing and silently decode
    // an empty batch result.
    if (log.address.toLowerCase() !== target) continue;
    const item = ORDER_BOOK_EVENT_BY_TOPIC0.get(log.topics[0] as Hex);
    if (item === undefined) continue;
    try {
      out.push(decodeEventLog({ abi: [item], data: log.data, topics: log.topics }) as PoolEvent);
    } catch {
      // topic0 matched but the payload did not — a malformed/truncated log. Skip it
      // rather than lose the whole receipt's result.
      continue;
    }
  }
  return out;
}

/** @internal Pull an OrderFilled event's six fields into the public {@link OrderFill}. */
function toOrderFill(args: Record<string, unknown>): OrderFill {
  return {
    takerOrderId: args.takerOrderId as bigint,
    makerOrderId: args.makerOrderId as bigint,
    quantityFilled: args.quantityFilled as bigint,
    takerRemainingQuantity: args.takerRemainingQuantity as bigint,
    makerRemainingQuantity: args.makerRemainingQuantity as bigint,
    fillPrice: args.fillPrice as bigint,
  };
}

/**
 *  @internal Reconstruct a batch amend's replacement ids.
 *
 *  `amendOrders` is all-or-nothing, so every amendment either placed a replacement
 *  or the whole tx reverted — which means the n-th `OrderPlaced` is the n-th
 *  amendment's replacement, with no rejection gaps to skip. A replacement that
 *  filled fully still emits `OrderPlaced`, so the alignment holds.
 */
export function decodeBatchAmendResult(
  { hash, receipt }: TxResult,
  { pool, amendmentCount }: { pool: Address; amendmentCount: number },
): AmendOrdersResult {
  const placedIds: bigint[] = [];
  const fills: OrderFill[] = [];
  for (const { eventName, args } of poolEvents(receipt, pool)) {
    if (eventName === "OrderPlaced") {
      placedIds.push(args.orderId as bigint);
    } else if (eventName === "OrderFilled") {
      fills.push(toOrderFill(args));
    }
  }
  const newOrderIds: bigint[] = new Array(amendmentCount).fill(0n);
  for (let i = 0; i < amendmentCount; i++) {
    const id = placedIds[i];
    if (id === undefined) break;
    newOrderIds[i] = id;
  }
  return { hash, receipt, newOrderIds, fills };
}

/**
 *  @internal Reconstruct a SINGLE amend's outcome from its receipt. The pool returns the new
 *  `uint128` order id, but an EOA cannot read a transaction's return data, so the
 *  id comes from the `OrderPlaced` log instead.
 *
 *  A single amend reverts outright when its replacement does not rest or fill, so a
 *  receipt that reached here carries exactly one placement.
 */
export function decodeAmendResult(
  { hash, receipt }: TxResult,
  { pool }: { pool: Address },
): AmendOrderResult {
  let newOrderId = 0n;
  const fills: OrderFill[] = [];
  for (const { eventName, args } of poolEvents(receipt, pool)) {
    if (eventName === "OrderPlaced" && newOrderId === 0n) {
      newOrderId = args.orderId as bigint;
    } else if (eventName === "OrderFilled") {
      fills.push(toOrderFill(args));
    }
  }
  return { hash, receipt, newOrderId, fills };
}

/**
 *  @internal Build the write context for a signer + a client's deps. Public entry
 *  is `client.createTrader(...)`, which builds one of these and binds the verbs.
 */
export function createWriter(config: TraderConfig, deps: WriterDeps): Writer {
  const dbg = deps.dbg ?? DebugMod.makeDebug();
  const decimals = config.decimals ?? Store.DECIMALS;
  const oneBase = 10n ** BigInt(decimals);
  const defaultGas = config.gas ?? Config.DEFAULT_GAS;

  const { chain } = deps.getConfig();
  const fees = deps.getConfig().fees ?? Config.DEFAULT_FEES;
  const addresses = () => deps.getConfig().addresses ?? {};

  // Resolve the signer through the shared leaf (txSend.ts) — privateKey / local
  // account signs locally (the fast path), an explicit walletClient sends
  // through the wallet. The nonceManager is threaded into a derived key so the
  // hot path can track nonces locally.
  const { localAccount, walletClient, from, fromAddress } = TxSend.resolveSigner(config, "createTrader", {
    nonceManager,
  });
  /**
   *  The external signer's wallet client, for the paths that only run when there is
   *  no local account.
   *
   *  `resolveSigner` already rejected "neither signer", so reaching this with
   *  nothing set would be an SDK bug, not a caller error — hence `unreachable`
   *  rather than a caller-facing error or a silent `!`.
   */
  const wallet = (): WalletClient => walletClient ?? unreachable("no external wallet client after signer validation");

  // A caller-supplied client gets the same read-error wrap as an SDK-built one,
  // so a revert reads as its Solidity name on either path (deps.getClient() is
  // already wrapped by makePublicClient).
  const publicClient: PublicClient = config.publicClient
    ? Client.withTypedReadErrors(config.publicClient)
    : deps.getClient();

  // Local nonce tracking: fetched from the chain once, then incremented in
  // memory — no per-order eth_getTransactionCount.
  const nonces = localAccount?.nonceManager ?? nonceManager;

  // Wait for a tx receipt off the WebSocket `newHeads` subscription (external
  // signers and the fallback leg — a local signer on a Somnia node confirms
  // inside realtime_sendRawTransaction). Shared at the txSend.ts leaf.
  const waitReceipt = (hash: Hash): Promise<TransactionReceipt> => TxSend.waitReceiptViaHeads(publicClient, hash);

  // Await a sent tx's receipt and package the base result (external-signer path).
  async function confirm(hash: Hash): Promise<TxResult> {
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
  }

  /**
   *  One contract write, as the send path sees it.
   *
   *  `abi` is `Abi` (viem's own type) rather than `readonly unknown[]`: the looser
   *  type defeated viem's ABI-generic inference, which is what forced an `as never`
   *  at every encode/write call site.
   */
  interface WriteCall {
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    gas?: bigint;
    value?: bigint;
  }

  // Sign a call locally with FIXED fees + FIXED gas + the locally-tracked nonce
  // — zero RPCs (after the one-time nonce fetch) — and return the serialized
  // signed tx. A fixed 10M gas ceiling (× 60 gwei = 0.6 STT envelope) keeps the
  // hot path free of a per-call estimateGas round-trip, which added ~250ms and
  // varied by op (a crossing order simulates slower than a rest).
  async function signCall(
    signer: LocalAccount,
    to: Address,
    data: Hex,
    gas: bigint,
    value?: bigint,
  ): Promise<Hex> {
    const nonce = await nonces.consume({ address: fromAddress, chainId: chain.id, client: publicClient });
    return signer.signTransaction({
      type: "eip1559",
      chainId: chain.id,
      to,
      data,
      gas,
      nonce,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      ...(value !== undefined ? { value } : {}),
    });
  }

  // Whether the connected node exposes Somnia's realtime_sendRawTransaction.
  // Starts optimistic; flips to false the first time the node reports the method
  // as unavailable (e.g. a stock anvil / geth used for local dev + the bots),
  // after which we permanently take the standard eth_sendRawTransaction path.
  let realtimeSupported = true;

  // Broadcast a signed tx through the shared realtime-with-fallback path
  // (txSend.ts). The trader's policy rides the hooks: the probe result is
  // cached (production never pays a probe per write), any real rejection
  // re-syncs the local nonce so the next write doesn't inherit a gap, and the
  // error is decoded so the caller gets the contract's error name instead of
  // hex.
  //
  // retryCount: 0 on both legs, matching the bridge / machinery / native
  // surfaces — the trader was the last one on viem's default of 3, and it is
  // the surface where a retry hurts MOST. `realtime_sendRawTransaction` blocks
  // SERVER-SIDE until the receipt exists, while this client's WebSocket caps a
  // request at WS_REQUEST_TIMEOUT_MS (4s, client.ts). So a block that takes
  // longer than the cap times out client-side with the tx already accepted —
  // and a timeout carries no JSON-RPC code, which is exactly the class viem
  // retries. The retry then re-submits the same signed bytes and the node
  // answers "already known" / "nonce too low", so the caller is handed a
  // nonce error for an order that IS on chain. A bot that treats that as a
  // failed placement and re-sends places a DUPLICATE (the resend gets a fresh
  // nonce, so it succeeds).
  //
  // Re-broadcasting identical signed bytes can never change the outcome once
  // the node holds them, so the retry buys nothing on this path; dropping it
  // leaves the caller with the accurate timeout ("outcome unknown, go read the
  // chain") instead of a misleading nonce error. The cost is that a request
  // which genuinely never reached the node is no longer silently re-sent — it
  // surfaces, and `onRejected` has already re-synced the nonce for the retry.
  async function broadcast(serialized: Hex, call?: WriteCall): Promise<TransactionReceipt> {
    const context = { address: call?.address, functionName: call?.functionName };
    return TxSend.broadcastSigned(publicClient, serialized, {
      label: "@somnia-chain/markets-sdk",
      retryCount: 0,
      isRealtimeSupported: () => realtimeSupported,
      onRealtimeUnsupported: () => {
        realtimeSupported = false;
      },
      onRejected: () => nonces.reset({ address: fromAddress, chainId: chain.id }),
      decorateError: (e, method) => Revert.toSdkError(e, method, context),
      waitReceipt,
    });
  }

  // A mined receipt with status "reverted" carries NO revert data — the EVM
  // discarded it. Replay the same call as an eth_call AT THE RECEIPT'S BLOCK to
  // recover the reason, then decode it. Strictly best-effort enrichment: if the
  // replay can't run (node pruned the state, the call now succeeds because state
  // moved on, the RPC refuses) the caller still gets a ContractRevertError, just
  // without `errorName`. Never let the replay's own failure mask the real one.
  async function revertErrorForReceipt(receipt: TransactionReceipt, call: WriteCall): Promise<ContractRevertError> {
    const context = { address: call.address, functionName: call.functionName };
    try {
      await publicClient.call({
        to: call.address,
        data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }),
        account: from,
        blockNumber: receipt.blockNumber,
        ...(call.value !== undefined ? { value: call.value } : {}),
      });
    } catch (replayed) {
      const decoded = Revert.decodeRevert(replayed, context);
      // Only trust the replay when it actually named an error; a bare failure
      // tells us nothing the receipt didn't.
      if (decoded.errorName !== undefined || decoded.reason !== undefined) return decoded;
    }
    return new ContractRevertError({
      ...context,
      reason: `transaction ${receipt.transactionHash} reverted (no revert data recoverable)`,
    });
  }

  // The single send path for every write. Local signer → realtime (send + confirm
  // in one server-side call). External/injected signer → writeContract + newHeads.
  // Each execute is one debug span; sign/broadcast/confirm nest under it with
  // explicit parents, so concurrent in-flight writes trace unambiguously.
  const execute = dbg.traced(
    "trade.execute",
    async (s, w: WriteCall): Promise<TxResult> => {
      if (localAccount) {
        const data = encodeFunctionData({ abi: w.abi, functionName: w.functionName, args: w.args });
        const serialized = await dbg.span("trade.signCall", () => signCall(localAccount, w.address, data, w.gas ?? defaultGas, w.value), s);
        const receipt = await dbg.span("trade.broadcast", () => broadcast(serialized, w), s);
        dbg.annotate(s, { hash: receipt.transactionHash });
        if (receipt.status === "reverted") throw await revertErrorForReceipt(receipt, w);
        return { hash: receipt.transactionHash, receipt };
      }
      const hash = await (async () => {
        try {
          return await wallet().writeContract({
            address: w.address,
            abi: w.abi,
            functionName: w.functionName,
            args: w.args,
            account: from,
            chain,
            gas: w.gas ?? defaultGas,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            ...(w.value !== undefined ? { value: w.value } : {}),
          });
        } catch (e) {
          // An external signer's writeContract simulates first, so a revert
          // surfaces here with data attached — decode it rather than leaking
          // viem's error to the caller.
          throw Revert.toSdkError(e, "writeContract", { address: w.address, functionName: w.functionName });
        }
      })();
      dbg.annotate(s, { hash });
      const result = await dbg.span("trade.confirm", () => confirm(hash), s);
      if (result.receipt.status === "reverted") throw await revertErrorForReceipt(result.receipt, w);
      return result;
    },
    (w) => ({ functionName: w.functionName, address: w.address }),
  );

  // Decode the order id (OrderPlaced) + fills (OrderFilled) from a receipt — works for
  // binary + spot pools (shared OrderBook events). The realtime receipt already carries
  // the logs, so the trade outcome comes back in the same round-trip as the send.
  function decodeOrderResult({ hash, receipt }: TxResult): PlaceOrderResult {
    let orderId: bigint | undefined;
    const fills: OrderFill[] = [];
    for (const log of receipt.logs) {
      // Same pre-check as the batch path: a receipt carries token Transfers and vault
      // credits alongside the pool's own events, and letting decodeEventLog reject each
      // one costs a full ABI scan plus a thrown-and-swallowed BaseError.
      if (!LogTopics.isKnownTopic0(ORDER_BOOK_TOPIC0, log.topics as readonly Hex[])) continue;
      let decoded: { eventName: string; args: Record<string, unknown> };
      try {
        decoded = decodeEventLog({ abi: EventsAbi.orderBookEventsAbi, data: log.data, topics: log.topics }) as {
          eventName: string;
          args: Record<string, unknown>;
        };
      } catch {
        continue;
      }
      if (decoded.eventName === "OrderPlaced") {
        orderId = decoded.args.orderId as bigint;
      } else if (decoded.eventName === "OrderFilled") {
        fills.push({
          takerOrderId: decoded.args.takerOrderId as bigint,
          makerOrderId: decoded.args.makerOrderId as bigint,
          quantityFilled: decoded.args.quantityFilled as bigint,
          takerRemainingQuantity: decoded.args.takerRemainingQuantity as bigint,
          makerRemainingQuantity: decoded.args.makerRemainingQuantity as bigint,
          fillPrice: decoded.args.fillPrice as bigint,
        });
      }
    }
    return { hash, receipt, orderId, fills };
  }

  // Send an order-placing write and decode its outcome from the receipt.
  async function executeOrder(w: WriteCall): Promise<PlaceOrderResult> {
    return decodeOrderResult(await execute(w));
  }

  interface PoolTokens {
    /** ERC-6909 outcome-token singleton (shared across all markets). */
    outcomeToken: Address;
    /** This pool's YES/NO position ids on the singleton. */
    yesId: bigint;
    noId: bigint;
    collateral: Address;
  }

  // Escrow resolution: explicit params win; otherwise read them off the pool
  // contract itself (IBinaryPool.outcomeToken/collateralToken/marketNonce — one
  // pipelined round-trip) and cache per pool. outcomeToken + collateral are
  // immutable for a pool's lifetime; the ids depend on the pool's CURRENT
  // marketNonce (v2 pools serve successive markets), so the cache is keyed by
  // (pool, nonce) — a recycle bumps the nonce and the next read re-derives.
  const poolTokensCache = new Map<string, PoolTokens>();

  async function poolTokens(pool: Address, nonceOverride?: bigint): Promise<PoolTokens> {
    const read = { address: pool, abi: ReadsAbi.binaryPoolTokensAbi } as const;
    // Resolve the nonce first (cheap uint64 read) unless the caller supplied it.
    const nonce =
      nonceOverride ??
      ((await publicClient.readContract({ ...read, functionName: "marketNonce" })));
    const key = `${pool.toLowerCase()}:${nonce}`;
    const hit = poolTokensCache.get(key);
    if (hit) return hit;
    const [outcomeToken, collateral] = (await Promise.all([
      publicClient.readContract({ ...read, functionName: "outcomeToken" }),
      publicClient.readContract({ ...read, functionName: "collateralToken" }),
    ]));
    // v2 ids fold in the pool's marketNonce — derive locally, no per-side read.
    const t = {
      outcomeToken,
      yesId: Ids.outcomeId(pool, nonce, 0),
      noId: Ids.outcomeId(pool, nonce, 1),
      collateral,
    };
    poolTokensCache.set(key, t);
    return t;
  }

  async function tokens(p: PlaceOrderParams): Promise<PoolTokens> {
    if (p.outcomeToken && p.yesId !== undefined && p.noId !== undefined && p.collateral) {
      return { outcomeToken: p.outcomeToken, yesId: p.yesId, noId: p.noId, collateral: p.collateral };
    }
    const t = await poolTokens(p.pool);
    return {
      outcomeToken: p.outcomeToken ?? t.outcomeToken,
      yesId: p.yesId ?? t.yesId,
      noId: p.noId ?? t.noId,
      collateral: p.collateral ?? t.collateral,
    };
  }

  // The pool's market-expiry cap in ns — the default order expiry (v2 rejects an
  // order expiring after the market). Re-read per placement rather than cached:
  // it changes on recycle and a stale value would mis-default across a market
  // roll. One cheap uint64 read; skipped whenever the caller passes an explicit
  // expireTimestampNs (the common bot path).
  async function marketExpiryNs(pool: Address): Promise<bigint> {
    return (await publicClient.readContract({
      address: pool,
      abi: ReadsAbi.binaryPoolReadAbi,
      functionName: "marketExpiryNs",
    }));
  }

  // v2: the YES/NO side is an explicit OrderKind enum on `placeBinaryOrder`
  // (0 BUY_YES, 1 SELL_YES, 2 BUY_NO, 3 SELL_NO) — NOT encoded in userData. The
  // pool maps kind onto the base book's (isBid, price) internally; the SDK just
  // forwards the enum. userData is opaque MM bookkeeping, forwarded verbatim.

  // Escrow per side. Buys escrow collateral (an ERC-20 allowance the pool pulls,
  // ceil-rounded); sells escrow an outcome position — an id on the ERC-6909
  // singleton the pool moves under a one-time operator approval (full quantity).
  function escrow(p: PlaceOrderParams, { outcomeToken, yesId, noId, collateral }: PoolTokens): Escrow {
    switch (p.side) {
      case "BUY_YES":
        return { kind: "erc20", token: collateral, amount: (p.quantity * p.price + oneBase - 1n) / oneBase };
      case "BUY_NO":
        return { kind: "erc20", token: collateral, amount: (p.quantity * (oneBase - p.price) + oneBase - 1n) / oneBase };
      case "SELL_YES":
        return { kind: "erc6909", outcomeToken, id: yesId, amount: p.quantity };
      case "SELL_NO":
        return { kind: "erc6909", outcomeToken, id: noId, amount: p.quantity };
    }
  }

  // (token→spender) pairs this trader has already approved to maxUint256 (or found
  // already sufficient on-chain). The owner (fromAddress) is fixed per trader, so a
  // pair, once approved, stays approved: maxUint256 allowance is treated as infinite
  // by OZ-style ERC-20s (never decremented on transferFrom). Caching it lets the hot
  // path SKIP the pre-send `allowance` read — a full round-trip on every order.
  const approvedPairs = new Set<string>();
  const pairKey = (token: Address, spender: Address): string => `${token.toLowerCase()}:${spender.toLowerCase()}`;

  async function approveIfNeeded(token: Address, spender: Address, amount: bigint, gas: bigint): Promise<void> {
    if (amount === 0n) return;
    const key = pairKey(token, spender);
    if (approvedPairs.has(key)) return; // cache hit — no read, no tx
    const allowance = (await publicClient.readContract({
      address: token,
      abi: TradeAbi.erc20WriteAbi,
      functionName: "allowance",
      args: [fromAddress, spender],
    }));
    if (allowance >= amount) {
      approvedPairs.add(key); // already approved on-chain; remember it
      return;
    }
    await execute({ address: token, abi: TradeAbi.erc20WriteAbi, functionName: "approve", args: [spender, maxUint256], gas });
    approvedPairs.add(key); // approved maxUint256 — skip the read from here on
  }

  // (outcomeToken→spender) operator grants this trader has already set (or found
  // already set on-chain). An ERC-6909 operator approval is a single boolean
  // covering EVERY id on the singleton — so once the pool (or BinaryMarketsModule/router) is an
  // operator for this owner, no per-market or per-id approval is ever needed
  // again. Cached like `approvedPairs` so the hot path skips the `isOperator` read.
  const operatorPairs = new Set<string>();

  // Ensure `spender` is an operator on the ERC-6909 outcome-token singleton for
  // this owner — read isOperator, and setOperator(spender, true) once if not.
  // Replaces per-token ERC-20 approvals for every outcome-position escrow.
  async function ensureOperator(outcomeToken: Address, spender: Address, gas: bigint): Promise<void> {
    const key = pairKey(outcomeToken, spender);
    if (operatorPairs.has(key)) return; // cache hit — no read, no tx
    const isOperator = (await publicClient.readContract({
      address: outcomeToken,
      abi: ReadsAbi.erc6909Abi,
      functionName: "isOperator",
      args: [fromAddress, spender],
    }));
    if (isOperator) {
      operatorPairs.add(key); // already an operator on-chain; remember it
      return;
    }
    await execute({ address: outcomeToken, abi: ReadsAbi.erc6909Abi, functionName: "setOperator", args: [spender, true], gas });
    operatorPairs.add(key);
  }

  /**
   *  Forget a cached approval so the next escrowing write re-checks (and re-approves
   *  if needed). Use only if a token's allowance was reduced out-of-band — standard
   *  maxUint256 approvals are never decremented, so this is rarely needed. Clears
   *  both ERC-20 allowances and ERC-6909 operator grants for the pair.
   */
  function clearApprovalCache(token?: Address, spender?: Address): void {
    if (token && spender) {
      approvedPairs.delete(pairKey(token, spender));
      operatorPairs.delete(pairKey(token, spender));
    } else {
      approvedPairs.clear();
      operatorPairs.clear();
    }
  }

  async function poolCollateral(pool: Address, override?: Address): Promise<Address> {
    return override ?? (await poolTokens(pool)).collateral;
  }

  // Perp wiring caches: pool → MarginBank, bank → collateral token. Both are
  // immutable after deployment (same doctrine as poolTokensCache).
  const perpBankCache = new Map<string, Address>();
  const bankCollateralCache = new Map<string, Address>();

  async function resolveMarginBank(p: { marginBank?: Address; pool?: Address }): Promise<Address> {
    if (p.marginBank) return p.marginBank;
    if (!p.pool) {
      throw new InvalidInputError("pass marginBank or pool (PerpMarket.marginBank has it)");
    }
    const key = p.pool.toLowerCase();
    const hit = perpBankCache.get(key);
    if (hit) return hit;
    const bank = (await publicClient.readContract({
      address: p.pool,
      abi: TradeAbi.perpPoolWriteAbi,
      functionName: "marginBank",
    }));
    perpBankCache.set(key, bank);
    return bank;
  }

  async function bankCollateral(bank: Address, override?: Address): Promise<Address> {
    if (override) return override;
    const key = bank.toLowerCase();
    const hit = bankCollateralCache.get(key);
    if (hit) return hit;
    const cfg = (await publicClient.readContract({
      address: bank,
      abi: ReadsAbi.marginBankReadAbi,
      functionName: "getSystemConfig",
    })) as { collateralToken: Address };
    bankCollateralCache.set(key, cfg.collateralToken);
    return cfg.collateralToken;
  }

  // Resolve the CollateralRouter: an explicit override wins, else the hub's
  // `addresses.collateralRouter`. The router is optional per environment, so
  // throw a clear error when neither is set rather than sending to address(0).
  function resolveRouter(override?: Address): Address {
    const router = override ?? addresses().collateralRouter;
    if (!router || router === ZERO_ADDRESS) {
      throw new NotConfiguredError("a deployed CollateralRouter", "this environment");
    }
    return router;
  }

  // Resolve the BinaryMarketsModule / BinarySettlement addresses — explicit
  // override wins, else the hub config. Throw a clear error rather than sending
  // to address(0) when neither is set (settlement is absent on pre-v2 deploys).
  function resolveModule(override?: Address): Address {
    const module = override ?? addresses().binaryModule;
    if (!module || module === ZERO_ADDRESS) {
      throw new NotConfiguredError("addresses.binaryModule", "this write");
    }
    return module;
  }

  function resolveSettlement(override?: Address): Address {
    const settlement = override ?? addresses().binarySettlement;
    if (!settlement || settlement === ZERO_ADDRESS) {
      throw new NotConfiguredError("addresses.binarySettlement", "this settlement call (absent on pre-v2 deploys)");
    }
    return settlement;
  }

  // Resolve the OperatorPermissionsRegistry — explicit override wins, else the hub
  // config. `attempting` lets a caller name its own operation (the stop-order
  // preflight says "a stop order", not "an operator grant").
  function resolveOperatorRegistry(override?: Address, attempting = "an operator grant"): Address {
    const registry = override ?? addresses().operatorPermissionsRegistry;
    if (!registry || registry === ZERO_ADDRESS) {
      throw new NotConfiguredError("operatorRegistry or addresses.operatorPermissionsRegistry", attempting);
    }
    return registry;
  }

  // The settlement singleton's outcome-token singleton (cached — immutable). Used
  // to target the one-time operator grant for redeemDirect / module-routed redeem
  // when the caller passes no market to read it off.
  let _settlementOutcomeToken: Address | undefined;
  async function settlementOutcomeToken(settlement: Address): Promise<Address> {
    if (_settlementOutcomeToken) return _settlementOutcomeToken;
    _settlementOutcomeToken = (await publicClient.readContract({
      address: settlement,
      abi: ReadsAbi.binarySettlementAbi,
      functionName: "outcomeToken",
    }));
    return _settlementOutcomeToken;
  }

  return {
    execute,
    executeOrder,
    poolTokens,
    tokens,
    marketExpiryNs,
    escrow,
    approveIfNeeded,
    ensureOperator,
    clearApprovalCache,
    poolCollateral,
    resolveMarginBank,
    bankCollateral,
    resolveRouter,
    resolveModule,
    resolveSettlement,
    resolveOperatorRegistry,
    settlementOutcomeToken,
    publicClient,
    addresses,
    from,
    fromAddress,
    localAccount,
    wallet,
    chain,
    defaultGas,
    oneBase,
    decimals,
    dbg,
  };
}
