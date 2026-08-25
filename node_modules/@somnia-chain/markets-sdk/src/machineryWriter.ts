// Shared write executor for the operator "market machinery" admins
// (OperatorAdmin / GovernanceAdmin / MarketCreatorAdmin / OracleHubAdmin) and
// the lend writes. Same signer doctrine as the trader (a privateKey/local
// account signs + sends locally; a browser walletClient sends through the
// wallet). A local-signer send rides the shared realtime_sendRawTransaction
// path (send + confirm in one round-trip, with the eth_sendRawTransaction
// fallback keeping anvil working) — but these are low-frequency admin actions,
// so unlike the trader there is NO cached state: the nonce is fetched per call
// and the realtime probe runs per call.
//
// The executor takes `to` / `abi` / `value` per call: these admins write to
// VARYING targets — factories, per-operator adapters/creators, the module —
// and some sends carry native `value` (funding a creator/adapter).
//
// DELIBERATELY NOT writer.ts. The trader's Writer exists for the hot path — a
// local nonce cache, an approval cache, a cached realtime probe — and admin
// writes want none of that. What the two paths DO share (signer resolution,
// the realtime-with-fallback broadcast, the newHeads receipt wait) is shared
// at the txSend.ts leaf; only the per-surface policy differs here.

import {
  encodeFunctionData,
  type Abi,
  type Account,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { DEFAULT_FEES, DEFAULT_GAS, type ClientConfig } from "./config.js";
import { unreachable } from "./raise.js";
import type { TxResult } from "./trade.js";
import { broadcastSigned, resolveSigner, waitReceiptViaHeads } from "./txSend.js";

/**
 *  Signer + read-client config shared by every machinery admin. Mirrors
 *  {@link OperatorAdminConfig} — pass a `walletClient`, a local `account`, or a
 *  `privateKey`.
 */
export interface MachineryAdminConfig {
  /** A pre-built signer (e.g. a browser/wagmi wallet over an injected provider). */
  walletClient?: WalletClient;
  /** A local signing account (e.g. from viem's privateKeyToAccount). */
  account?: Account | Address;
  /** Private key — the SDK derives the account. */
  privateKey?: Hex;
  /** Read client for receipts. Defaults to the client's WebSocket client. */
  publicClient?: PublicClient;
  /** Default gas ceiling per tx. */
  gas?: bigint;
}

/**
 *  One machinery write: `to` + `abi` + function + args, optionally carrying
 *  native `value` (funding sends) and a per-call gas override. Omit
 *  `abi`/`functionName`/`args` for a bare native transfer (funding a contract's
 *  `receive()` — e.g. fundAdapter / fundMarketCreator), in which case `value`
 *  is required and the tx carries no calldata.
 */
export interface MachineryWriteCall {
  to: Address;
  abi?: Abi;
  functionName?: string;
  args?: readonly unknown[];
  value?: bigint;
  gas?: bigint;
}

/** The bound signer + a plain send-and-wait `execute`, built once per admin. */
export interface MachineryWriter {
  /** The resolved signer address (for ownership self-checks). */
  from: Account | Address;
  execute(w: MachineryWriteCall): Promise<TxResult>;
  publicClient: PublicClient;
}

/**
 *  Build the shared signer/executor from a machinery-admin config + the client's
 *  read deps. Throws {@link SignerRequiredError} when no signer is available.
 *  `label` names the admin in the error text.
 */
export function makeMachineryWriter(
  config: MachineryAdminConfig,
  deps: { getConfig: () => ClientConfig; getClient: () => PublicClient },
  label: string,
): MachineryWriter {
  const defaultGas = config.gas ?? DEFAULT_GAS;
  const { chain } = deps.getConfig();
  const fees = deps.getConfig().fees;

  const { localAccount, walletClient, from } = resolveSigner(config, label);
  /**
   *  The external signer's wallet client, for the paths that only run when there
   *  is no local account. `resolveSigner` already rejected "neither signer", so
   *  reaching this with nothing set would be an SDK bug, not a caller error —
   *  hence `unreachable` rather than a caller-facing error or a silent `!`.
   */
  const wallet = (): WalletClient => walletClient ?? unreachable("no external wallet client after signer validation");

  const publicClient: PublicClient = config.publicClient ?? deps.getClient();

  const waitReceipt = (hash: Hash): Promise<TransactionReceipt> => waitReceiptViaHeads(publicClient, hash);

  async function execute(w: MachineryWriteCall): Promise<TxResult> {
    const gas = w.gas ?? defaultGas;
    const value = w.value ?? 0n;
    // A bare native transfer (no abi/functionName) funds a contract's receive().
    const data: Hex | undefined =
      w.abi && w.functionName
        ? encodeFunctionData({ abi: w.abi, functionName: w.functionName, args: w.args ?? [] } as never)
        : undefined;
    let hash: Hash;
    if (localAccount) {
      const nonce = await publicClient.getTransactionCount({ address: localAccount.address, blockTag: "pending" });
      const signed = await localAccount.signTransaction({
        type: "eip1559",
        chainId: chain.id,
        to: w.to,
        value,
        ...(data ? { data } : {}),
        gas,
        nonce,
        maxFeePerGas: fees?.maxFeePerGas ?? DEFAULT_FEES.maxFeePerGas,
        maxPriorityFeePerGas: fees?.maxPriorityFeePerGas ?? DEFAULT_FEES.maxPriorityFeePerGas,
      });
      // Shared realtime-with-fallback broadcast (txSend.ts): send + confirm in
      // one round-trip on a Somnia node, eth_sendRawTransaction + newHeads wait
      // on anvil. retryCount: 0 on both legs — an admin send whose response was
      // lost must not be re-submitted by a transport retry (bridge doctrine).
      const receipt = await broadcastSigned(publicClient, signed, {
        label: "@somnia-chain/markets-sdk",
        retryCount: 0,
        waitReceipt,
      });
      return { hash: receipt.transactionHash, receipt };
    }
    if (data) {
      hash = await wallet().writeContract({
        address: w.to,
        abi: w.abi,
        functionName: w.functionName,
        args: w.args ?? [],
        account: from,
        chain,
        gas,
        value,
        ...(fees ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas } : {}),
      } as never);
    } else {
      hash = await wallet().sendTransaction({
        to: w.to,
        value,
        account: from,
        chain,
        gas,
        ...(fees ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas } : {}),
      } as never);
    }
    const receipt = await waitReceipt(hash);
    return { hash, receipt };
  }

  return { from, execute, publicClient };
}
