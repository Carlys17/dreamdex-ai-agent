// The Somnia-native RPC wrapper: one object, one method per endpoint, arguments
// and results in shapes a TypeScript developer already thinks in.
//
// LOCKSTEP: github.com/somnia-chain/somnia2 —
// `somnia/api/handlers/somnia_api_handlers.h`. Every method below was called
// against a live Shannon node and its request/response shape recorded; the encodings
// are not inferred from the C++ types.
//
// SCOPE: this module wraps exactly the `somnia_*` methods listed in the PUBLIC
// JSON-RPC reference, https://docs.somnia.network/developer/json-rpc-api — all
// twelve of them, and nothing else. A node build exposes more, but an endpoint that
// is not in the public reference is not part of the contract: it can change shape
// or disappear without notice, and some are actively unsafe to call (see below).
// Anything outside that list stays reachable through `request()`, where the caller
// is knowingly off the documented surface.
//
// WHY THIS EXISTS. The endpoints are easy to call wrong, and the node answers a
// wrong call with a flat `-32602 invalid parameters` that says nothing about what it
// wanted. Three traps, all confirmed live:
//
//   1. A block number must be a HEX STRING. `params: [1]` → invalid parameters.
//   2. `somnia_reactivityGetSubscriptionInfo` takes its ids as THE PARAMS ARRAY
//      ITSELF — `params: ["0x1", "0x2"]`. The obvious `params: [[1, 2]]` and
//      `params: [0]` both fail.
//   3. Quantities come back as hex strings, and field names are the node's C++
//      member names verbatim — `snake_case` for blocks, `camelCase` for statistics.
//
// So: pass a `bigint`, get a `bigint`; pass an array of ids, get an array back.
//
// NOT WRAPPED, deliberately:
//   - `somnia_getStorageDatabaseEntries` — undocumented, and DANGEROUS. Its handler
//     loops over the caller's key list with no cap on how many keys a request may
//     carry and no bound on the size of each value it returns, so a single request
//     can make a node dump unbounded data. A 256-key request took Shannon down on
//     2026-07-31. It also does not mean what an Ethereum developer would assume:
//     keys are node-internal `StorageKeyType` discriminants (1 byte, or 1 + 32),
//     not contract storage slots — `eth_getStorageAt` is the method for those.
//   - `somnia_getProtocolParameters` — undocumented; the key set is node-version
//     dependent, so wrapping it would ship a shape we cannot keep stable.
//   - `somnia_connectToPeer`, `somnia_dumpMemory`, `somnia_createTransactionLog`,
//     `somnia_byteStringBenchmark` — node-operator only (`kProtected`). A public
//     endpoint answers `{ code: -1, message: "unauthorized" }`. Reach them with
//     `native.request(...)` if you are the operator.
//   - `somnia_submitBatchedTransaction`, `somnia_submitMerkleBatchSignature` —
//     validator consensus plumbing whose payloads are smash-encoded structs, not
//     something a JS caller can construct.
//   - `realtime_sendRawTransaction` — already the SDK's write path (see trade.ts).

import {
  formatTransactionReceipt,
  hexToBigInt,
  isHex,
  numberToHex,
  size,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import type {
  RpcSomniaBlock,
  RpcSomniaChainStatistics,
  RpcSomniaNodePublicKeys,
  RpcSomniaReactivitySubscription,
  SessionTransactionRequest,
  SomniaBlock,
  SomniaBlockParam,
  SomniaChainStatistics,
  SomniaNodePublicKeys,
  SomniaReactivitySubscription,
} from "./types.js";

const ERR = "@somnia-chain/markets-sdk/native";

/**
 *  Anything that can make a JSON-RPC request — which every viem client is, and so
 *  is an injected EIP-1193 provider (`window.ethereum`) or a wagmi connector.
 *
 *  Typed structurally so this module never needs a viem client of its own: whatever
 *  you already have, hand it over.
 */
export interface NativeRpcRequester {
  /**
   *  Make a JSON-RPC request. The second argument is viem's per-request options —
   *  only `retryCount` is used, and only to stop a value-bearing session send from
   *  being retried (see `sendSessionTransaction`). A provider that ignores it is
   *  fine; the parameter is optional.
   */
  request(args: { method: string; params?: unknown }, options?: { retryCount?: number }): Promise<unknown>;
}

/**
 *  The Somnia-native RPC surface — the twelve methods in the public JSON-RPC
 *  reference. Build one with {@link createNative}.
 *
 *  Reads throw on failure and return `null` only where the node genuinely means
 *  "no such thing" — a missing block, an unknown subscription.
 */
export interface SomniaNative {
  /**
   *  Is the node ready to serve? `false` while it is still syncing.
   *
   *  @param opts `withErrorCode: true` calls `somnia_isReadyWithErrorCode` instead,
   *   which **throws** on a not-ready node (`Is not ready`, JSON-RPC internal error)
   *   rather than returning `false` — that variant exists so a health check can key
   *   on the error. It never returns `false`.
   */
  isReady(opts?: { withErrorCode?: boolean }): Promise<boolean>;

  /**
   *  A Somnia **ledger** block — richer than the Ethereum-compatible block, with the
   *  proposer, the committed data-chain blocks and the execution state snapshot.
   *
   *  Takes a tag (`"latest"`, `"earliest"`, `"pending"`, `"safe"`, `"finalized"`), a
   *  block number, **or** a 32-byte ledger block hash — dispatching to
   *  `somnia_getBlockByHash` for the last of those.
   */
  getBlock(block?: SomniaBlockParam | Hex): Promise<SomniaBlock | null>;

  /** Aggregate activity between two blocks, inclusive. */
  getStatistics(from: SomniaBlockParam, to: SomniaBlockParam): Promise<SomniaChainStatistics>;

  /**
   *  Receipts for the **privileged** (protocol-issued) transactions in a block —
   *  the ones no user submitted, e.g. reactivity callbacks. Usually empty.
   *
   *  Takes a tag, a number, or a 32-byte block hash, like {@link getBlock}.
   */
  listPrivilegedReceipts(block?: SomniaBlockParam | Hex): Promise<TransactionReceipt[]>;

  /** Ids of every reactivity subscription owned by an address. */
  listReactivitySubscriptionIds(owner: Address): Promise<bigint[]>;

  /** One reactivity subscription, or `null` when no subscription has that id. */
  getReactivitySubscription(id: bigint | number): Promise<SomniaReactivitySubscription | null>;

  /** Several reactivity subscriptions in one round-trip. Unknown ids are omitted. */
  listReactivitySubscriptions(ids: readonly (bigint | number)[]): Promise<SomniaReactivitySubscription[]>;

  /** The serving node's identity keys for the current epoch. */
  getNodePublicKeys(): Promise<SomniaNodePublicKeys>;

  /**
   *  The address a session seed controls, **as the node computes it**.
   *
   *  {@link sessionAddress} computes the same value locally with no round-trip;
   *  this is the way to confirm the node agrees.
   *
   *  Note the node creates its in-memory sender for the seed as a side effect.
   */
  getSessionAddress(seed: Hex): Promise<Address>;

  /**
   *  Submit a transaction through a session and **wait for its receipt**.
   *
   *  The node derives the key from the seed, assigns the nonce, signs, submits and
   *  retries transient failures — so this one call replaces sign + send + poll. It
   *  does not return until the transaction has executed, which can take a while
   *  under retry; give the underlying transport a generous timeout.
   *
   *  Before using it, know four things:
   *  - **The seed is a private key.** Anyone with it controls the account.
   *  - **Pre-fund the account** ({@link sessionAddress}) or the transaction cannot pay gas.
   *  - **The nonce space is shared** with `eth_sendRawTransaction` from the same
   *    address. Sending both ways at once corrupts the sequence.
   *  - The session lives in the serving node's memory, so it is not shared between
   *    nodes and is rebuilt from the seed after a restart.
   *
   *  Sent with retries disabled: a retry would be a second transfer, not a second
   *  attempt at the same one.
   *
   *  @throws If the node returns no receipt, or rejects the transaction (mempool
   *   errors arrive as JSON-RPC `-32000`; a node-side timeout as `timeout`).
   */
  sendSessionTransaction(tx: SessionTransactionRequest): Promise<TransactionReceipt>;

  /**
   *  Call any `somnia_*` method directly — the escape hatch for an endpoint this
   *  module doesn't wrap: an operator-only one, one a newer node has added, or one
   *  the public reference omits.
   *
   *  Params go through untouched, so hex-encode quantities yourself.
   *
   *  ⚠️ Off the documented surface you are on your own, and not every undocumented
   *  endpoint is merely unstable — `somnia_getStorageDatabaseEntries` will make a
   *  node dump unbounded data for a large enough key list, and has taken a public
   *  testnet down. Know what a method does before reaching for it here.
   */
  request<T = unknown>(method: string, params?: unknown[]): Promise<T>;
}

/**
 *  Wrap any JSON-RPC client in the Somnia-native API.
 *
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
 * import { createNative } from "@somnia-chain/markets-sdk/native";
 *
 * const client = createPublicClient({ chain: somniaShannon, transport: http() });
 * const native = createNative(client);
 *
 * const block = await native.getBlock("latest");
 * console.log(block?.consensusBlock.proposerAddress, block?.executionBlock.executionGasUsed);
 * ```
 *
 *  Works with the markets client too — `createNative(exchange.client.publicClient)` —
 *  and with a plain injected provider, since all it needs is `.request`.
 *
 *  @param client Anything with an EIP-1193 `request` method.
 *  @returns The {@link SomniaNative} surface.
 */
export function createNative(client: NativeRpcRequester): SomniaNative {
  const call = async <T>(method: string, params?: unknown[]): Promise<T> =>
    (await client.request({ method, ...(params === undefined ? {} : { params }) })) as T;

  return {
    async isReady(opts = {}) {
      const method = opts.withErrorCode ? "somnia_isReadyWithErrorCode" : "somnia_isReady";
      return (await call<boolean>(method, [])) === true;
    },

    async getBlock(block = "latest") {
      const byHash = isBlockHash(block);
      const raw = await call<RpcSomniaBlock | null>(
        byHash ? "somnia_getBlockByHash" : "somnia_getBlockByNumber",
        [byHash ? block : encodeBlock(block)],
      );
      return raw ? decodeBlock(raw) : null;
    },

    async getStatistics(from, to) {
      const raw = await call<RpcSomniaChainStatistics>("somnia_getStatistics", [encodeBlock(from), encodeBlock(to)]);
      return {
        successfulTransactions: hexToBigInt(raw.numSuccessfulTransactions),
        revertedTransactions: hexToBigInt(raw.numRevertedTransactions),
        contractsAdded: hexToBigInt(raw.numContractsAdded),
        accountsAdded: hexToBigInt(raw.numAccountsAdded),
        newUsedEoaAccounts: hexToBigInt(raw.numNewUsedEoaAccounts),
        nativeTransferTransactions: hexToBigInt(raw.numNativeTransferTransactions),
        gasUnitsSpent: hexToBigInt(raw.numGasUnitsSpent),
        gasFeeSpent: hexToBigInt(raw.gasFeeSpent),
      };
    },

    async listPrivilegedReceipts(block = "latest") {
      const byHash = isBlockHash(block);
      const raw = await call<unknown[]>(
        byHash
          ? "somnia_getPrivilegedTransactionReceiptsForBlockByHash"
          : "somnia_getPrivilegedTransactionReceiptsForBlockByNumber",
        [byHash ? block : encodeBlock(block)],
      );
      return (raw ?? []).map((r) => formatTransactionReceipt(r as never));
    },

    async listReactivitySubscriptionIds(owner) {
      const raw = await call<Hex[]>("somnia_reactivityGetSubscriptions", [owner]);
      return (raw ?? []).map((id) => hexToBigInt(id));
    },

    async getReactivitySubscription(id) {
      const [first] = await this.listReactivitySubscriptions([id]);
      return first ?? null;
    },

    async listReactivitySubscriptions(ids) {
      if (ids.length === 0) return [];
      // The ids ARE the params array — not a nested list. `params: [[1,2]]` fails.
      const raw = await call<RpcSomniaReactivitySubscription[]>(
        "somnia_reactivityGetSubscriptionInfo",
        ids.map((id) => quantity(id)),
      );
      return (raw ?? []).map(decodeSubscription);
    },

    async getNodePublicKeys() {
      const raw = await call<RpcSomniaNodePublicKeys>("somnia_nodePublicKeys", []);
      return {
        address: raw.address,
        ecdsaPublicKey: raw.ecdsa_public_key,
        blsPublicKey: raw.bls_public_key,
        blsProofOfPossession: raw.bls_proof_of_possession,
        proofOfAddress: raw.proof_of_address,
      };
    },

    async getSessionAddress(seed) {
      requireSessionSeed(seed);
      return call<Address>("somnia_getSessionAddress", [seed]);
    },

    async sendSessionTransaction(tx) {
      requireSessionSeed(tx.seed);
      if (tx.gas <= 0n) {
        throw new Error(`${ERR}: sendSessionTransaction needs a positive gas limit (the node does not estimate it)`);
      }
      const params = [
        {
          seed: tx.seed,
          gas: quantity(tx.gas),
          ...(tx.to === undefined ? {} : { to: tx.to }),
          ...(tx.value === undefined ? {} : { value: quantity(tx.value) }),
          ...(tx.data === undefined ? {} : { data: tx.data }),
        },
      ];
      // retryCount: 0 — this call SENDS VALUE and blocks until the receipt exists.
      // viem retries a failed request three times by default, and the node's errors
      // (a 30s node-side ceiling, a full mempool) look retryable, so a default retry
      // could submit the same transfer more than once under fresh nonces. One
      // attempt; the node already retries internally where that is safe.
      const raw = await client.request({ method: "somnia_sendSessionTransaction", params }, { retryCount: 0 });
      if (raw == null) {
        // A receipt is the whole contract of this call. The node has no path that
        // finalises without one, so an empty result is a failure, not an absence —
        // the same stance trade.ts takes on realtime_sendRawTransaction.
        throw new Error(
          `${ERR}: somnia_sendSessionTransaction returned no receipt — the node accepted the transaction but never executed it`,
        );
      }
      return formatTransactionReceipt(raw as never);
    },

    request: <T,>(method: string, params?: unknown[]) => call<T>(method, params),
  };
}

/**
 *  True when an error means "this node doesn't have that method".
 *
 *  These endpoints are node-version dependent, and a stock geth/anvil has none of
 *  them — so a UI that offers native features should degrade rather than break.
 *  Mirrors the same check the SDK's write path uses for `realtime_sendRawTransaction`.
 *
 * ```ts
 * import { createNative, isMethodNotFound } from "@somnia-chain/markets-sdk/native";
 *
 * const stats = await native.getStatistics("earliest", "latest").catch((e) => {
 *   if (isMethodNotFound(e)) return null; // not a Somnia node — hide the panel
 *   throw e;
 * });
 * ```
 *
 *  @param error Whatever was thrown.
 */
export function isMethodNotFound(error: unknown): boolean {
  const code =
    (error as { code?: number })?.code ?? (error as { cause?: { code?: number } })?.cause?.code;
  if (code === -32601) return true;
  const message = ((error as { message?: string })?.message ?? "").toLowerCase();
  return message.includes("method not found") || message.includes("does not exist");
}

/**
 *  True when an error means "that method is operator-only on this node" — the
 *  `{ code: -1, message: "unauthorized" }` a public endpoint returns for the
 *  protected methods.
 *
 *  Matches on the **message**, not the code, and that is deliberate: `-1` is the
 *  node's default error code, shared by at least `invalid range`, `could not load
 *  statistics` and `Block does not exist` (all confirmed live). Keying on the code
 *  would report a bad block range as an authorization failure.
 *
 *  @param error Whatever was thrown.
 */
export function isUnauthorized(error: unknown): boolean {
  const message = (
    ((error as { message?: string })?.message ?? "") +
    " " +
    ((error as { cause?: { message?: string } })?.cause?.message ?? "")
  ).toLowerCase();
  return message.includes("unauthorized");
}

// ---- encoding / decoding ----------------------------------------------------

/** A hex quantity, as every numeric param on this API must be. */
function quantity(value: bigint | number): Hex {
  return numberToHex(value);
}

/** A block param as the node wants it: a tag verbatim, a number as hex. */
function encodeBlock(block: SomniaBlockParam): string {
  if (typeof block === "string") return block;
  if (block < 0) throw new Error(`${ERR}: block number cannot be negative (got ${block})`);
  return quantity(block);
}

/** A 32-byte hex string — i.e. a block hash rather than a number or tag. */
function isBlockHash(block: SomniaBlockParam | Hex): block is Hex {
  return typeof block === "string" && isHex(block) && size(block) === 32;
}

function requireSessionSeed(seed: Hex): void {
  if (!isHex(seed) || size(seed) !== 32) {
    throw new Error(`${ERR}: a session seed must be 32 bytes of hex`);
  }
}

function decodeBlock(raw: RpcSomniaBlock): SomniaBlock {
  const c = raw.consensus_block;
  const e = raw.execution_block;
  return {
    consensusBlock: {
      blockNumber: hexToBigInt(c.block_number),
      timestamp: hexToBigInt(c.timestamp),
      dataChainBlocks: c.data_chain_blocks ?? [],
      delayedLedgerBlockNumber: hexToBigInt(c.delayed_ledger_block_number),
      delayedLedgerBlockHash: c.delayed_ledger_block_hash,
      parentConsensusBlockHash: c.parent_consensus_block_hash,
      proposerAddress: c.proposer_address,
      blockResources: {
        validationGas: hexToBigInt(c.block_resources.validation_gas),
        compressedBytes: hexToBigInt(c.block_resources.compressed_bytes),
        uncompressedBytes: hexToBigInt(c.block_resources.uncompressed_bytes),
      },
      consensusBlockHash: c.consensus_block_hash,
    },
    executionBlock: {
      transactionIdsHash: e.transaction_ids_hash,
      receiptsHash: e.receipts_hash,
      executionGasLimit: hexToBigInt(e.execution_gas_limit),
      executionGasUsed: hexToBigInt(e.execution_gas_used),
      executionStateSnapshot: e.execution_state_snapshot,
      stateSnapshotBlockNumber: hexToBigInt(e.state_snapshot_block_number),
      operationSequenceHash: hexToBigInt(e.operation_sequence_hash),
    },
    parentLedgerBlockHash: raw.parent_ledger_block_hash,
    ledgerBlockHash: raw.ledger_block_hash,
  };
}

function decodeSubscription(raw: RpcSomniaReactivitySubscription): SomniaReactivitySubscription {
  const topics = raw.topics ?? [];
  const zero = `0x${"00".repeat(32)}` as Hex;
  return {
    id: hexToBigInt(raw.id),
    topics: [topics[0] ?? zero, topics[1] ?? zero, topics[2] ?? zero, topics[3] ?? zero],
    origin: raw.origin,
    caller: raw.caller,
    emitter: raw.emitter,
    owner: raw.owner,
    handlerContractAddress: raw.handler_contract_address,
    handlerFunctionSelector: raw.handler_function_selector,
    gasLimit: hexToBigInt(raw.gas_limit),
    priorityFeePerGas: hexToBigInt(raw.priority_fee_per_gas),
    maxFeePerGas: hexToBigInt(raw.max_fee_per_gas),
  };
}
