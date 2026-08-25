// Write side of the SomniaLend integration — a Lender is to the lend market
// what a Trader is to the order books: bound to one signer, auto-approving,
// resolving every target from config.addresses.lend. Lend actions are
// low-frequency (no nonce/approval caching needed), so the sends ride the
// shared machinery writer — realtime send + confirm with the standard-node
// fallback, per-call nonce — like the admin surfaces do.

import { maxUint256, type Address, type PublicClient } from "viem";
import type { ClientConfig } from "../config.js";
import { ContractRevertError, NotConfiguredError } from "../errors.js";
import * as MachineryWriter from "../machineryWriter.js";
import type { MachineryAdminConfig } from "../machineryWriter.js";
import type { TxResult } from "../trade.js";
import * as ReadsAbi from "../readsAbi.js";
import * as TradeAbi from "../tradeAbi.js";
import * as LendAbi from "./lendAbi.js";
import type { LendAddresses } from "./types.js";

/** Aave interest-rate mode 2 — variable. Stable borrowing is not surfaced. */
const VARIABLE_RATE = 2n;
/** Aave referral program code — unused on SomniaLend; always 0. */
const NO_REFERRAL = 0;

/**
 *  Signer config for the lend entry's `createLender` — same signer doctrine as
 *  every SDK write surface (a `privateKey`, a local `account`, or a browser
 *  `walletClient`).
 */
export type LenderConfig = MachineryAdminConfig;

/** Options shared by the ERC-20 lend writes. */
export interface LendWriteOptions {
  /**
   *  Auto-approve the token pull when the allowance is short (default true) —
   *  same doctrine as the trader: one allowance read per (token, spender) pair,
   *  approve `maxUint256` once, cache the grant for the lender's lifetime.
   */
  approve?: boolean;
  /** Per-call gas ceiling override. */
  gas?: bigint;
}

/** Options for {@link Lender.supply}. */
export interface LendSupplyOptions extends LendWriteOptions {
  /** Credit the position to another address (default: the signer). */
  onBehalfOf?: Address;
}

/** Options for {@link Lender.withdraw}. */
export interface LendWithdrawOptions {
  /** Send the withdrawn tokens to another address (default: the signer). */
  to?: Address;
  /** Per-call gas ceiling override. */
  gas?: bigint;
}

/** Options for {@link Lender.repay}. */
export interface LendRepayOptions extends LendWriteOptions {
  /** Repay another address's debt (default: the signer's own). */
  onBehalfOf?: Address;
}

/**
 * Write surface for the SomniaLend money market, bound to one signer — built by
 * `client.lend.createLender` on the owning client.
 *
 * **Details**
 *
 * Every method resolves once the tx is MINED, with its receipt. Amounts are raw
 * underlying-token units. ERC-20 pulls (supply / repay) auto-approve by default;
 * the `*Native` variants route native SOMI through the WrappedTokenGateway so
 * the caller never touches WSOMI.
 *
 * **Gotchas**
 *
 * Every method THROWS if the mined tx reverted (`receipt.status !== "success"`)
 * — a reverted lend action never resolves as success. The `*Native` variants
 * need `wrappedTokenGateway` in the lend addresses. Borrowing is variable-rate
 * only. Position/risk reads live on the lend client (`getAccount`), not here.
 */
export interface Lender {
  /** The signer address the lender acts as. */
  readonly account: Address;
  /**
   * Supply `amount` of `asset` to earn interest (and optionally back borrows).
   * Auto-approves the Pool when the allowance is short.
   *
   * @param asset - Underlying ERC-20 to supply (a {@link LendReserve}.underlying).
   * @param amount - Raw underlying units.
   * @param opts - Approval/gas overrides, or supply on behalf of another address.
   *
   * @example
   * ```ts
   * const lender = client.lend.createLender({ privateKey });
   * await lender.supply(usdso, 1_000n * 10n ** 18n);
   * ```
   */
  supply(asset: Address, amount: bigint, opts?: LendSupplyOptions): Promise<TxResult>;
  /**
   * Withdraw supplied `asset`. Pass `maxUint256` as `amount` to withdraw the
   * full balance including accrued interest. See {@link Lender.supply}.
   */
  withdraw(asset: Address, amount: bigint, opts?: LendWithdrawOptions): Promise<TxResult>;
  /**
   * Borrow `asset` against the account's collateral (variable rate). Reverts
   * on-chain if the health factor would drop below 1. See {@link Lender.supply}.
   */
  borrow(asset: Address, amount: bigint, opts?: { gas?: bigint }): Promise<TxResult>;
  /**
   * Repay variable-rate debt in `asset`. Pass `maxUint256` as `amount` to clear
   * the full debt including accrued interest (requires balance ≥ debt; the
   * contract only pulls what is owed). See {@link Lender.supply}.
   */
  repay(asset: Address, amount: bigint, opts?: LendRepayOptions): Promise<TxResult>;
  /**
   * Toggle whether the supplied `asset` balance backs borrows. Disabling
   * reverts on-chain if it would leave existing debt under-collateralized.
   */
  setUseAsCollateral(asset: Address, useAsCollateral: boolean, opts?: { gas?: bigint }): Promise<TxResult>;
  /**
   * Supply native SOMI (wrapped to WSOMI by the gateway). Sibling of
   * {@link Lender.supply}; needs `addresses.lend.wrappedTokenGateway`.
   */
  supplyNative(amount: bigint, opts?: { onBehalfOf?: Address; gas?: bigint }): Promise<TxResult>;
  /**
   * Withdraw the WSOMI position as native SOMI. `maxUint256` withdraws all.
   * Auto-approves the gateway to pull the aWSOMI (an ERC-20 approve on the
   * aToken). Sibling of {@link Lender.withdraw}.
   */
  withdrawNative(amount: bigint, opts?: LendWithdrawOptions & { approve?: boolean }): Promise<TxResult>;
  /**
   * Borrow native SOMI (variable rate) via the gateway. First-use grants the
   * gateway credit delegation on the WSOMI variable-debt token
   * (`approveDelegation`, cached like approvals). Sibling of {@link Lender.borrow}.
   */
  borrowNative(amount: bigint, opts?: { approve?: boolean; gas?: bigint }): Promise<TxResult>;
  /**
   * Repay WSOMI debt with native SOMI. `maxUint256` is not supported for the
   * native path — pass a slight overpayment instead; the gateway refunds the
   * excess. Sibling of {@link Lender.repay}.
   */
  repayNative(amount: bigint, opts?: { onBehalfOf?: Address; gas?: bigint }): Promise<TxResult>;
  /**
   * Drop the lender's in-memory approval/delegation grant cache (mirrors the
   * trader's `clearApprovalCache`) — needed only if an approval was revoked
   * out-of-band while this lender instance is alive.
   */
  clearApprovalCache(): void;
}

/** Internal deps the lend entry (`client.lend`) hands the lender factory. */
export interface LenderDeps {
  getConfig: () => ClientConfig;
  getClient: () => PublicClient;
  addresses: LendAddresses;
}

/** Build a {@link Lender} (wired by the lend entry — use `lend.createLender`). */
export function createLenderWithDeps(config: LenderConfig, deps: LenderDeps): Lender {
  const writer = MachineryWriter.makeMachineryWriter(config, deps, "createLender");
  const from: Address = typeof writer.from === "string" ? writer.from : writer.from.address;

  // A mined-but-reverted lend action must fail loudly: the machinery writer
  // resolves on ANY mined receipt, and a caller treating a reverted borrow as
  // "confirmed" mis-tracks a real position. Zero extra I/O — the receipt is
  // already in hand.
  async function executeChecked(w: Parameters<typeof writer.execute>[0]): Promise<TxResult> {
    const result = await writer.execute(w);
    if (result.receipt.status !== "success") {
      // Same fallback shape as the trader writer's revertErrorForReceipt when no
      // revert data is recoverable — the machinery writer is deliberately plain
      // (no replay enrichment), so `errorName` is never populated here.
      throw new ContractRevertError({
        functionName: String(w.functionName ?? "call"),
        address: w.to,
        reason: `transaction ${result.hash} reverted (no revert data recoverable)`,
      });
    }
    return result;
  }

  const requirePool = (): Address => {
    const pool = deps.addresses.pool;
    if (!pool) {
      throw new NotConfiguredError("`pool` in config.addresses.lend", "this lend write");
    }
    return pool;
  };
  const requireGateway = (): Address => {
    const gateway = deps.addresses.wrappedTokenGateway;
    if (!gateway) {
      throw new NotConfiguredError("`wrappedTokenGateway` in config.addresses.lend", "native lend flows");
    }
    return gateway;
  };

  // Approval doctrine mirrors trade.ts's approveIfNeeded — per-(token, spender)
  // cache, one allowance read on miss, approve maxUint256 when short — with one
  // refinement: only an effectively-UNLIMITED grant is cached. A finite
  // allowance that merely covers this pull is spent by it, so caching it would
  // let a later, larger pull skip the check and revert on-chain. The hot path
  // is unchanged: after our own max approval the pair is cached and every
  // subsequent write costs zero extra reads.
  const UNLIMITED_ALLOWANCE_FLOOR = maxUint256 / 2n;
  const approvedPairs = new Set<string>();
  async function approveIfNeeded(token: Address, spender: Address, amount: bigint, gas?: bigint): Promise<void> {
    const key = `${token.toLowerCase()}:${spender.toLowerCase()}`;
    if (approvedPairs.has(key)) return;
    const allowance = (await writer.publicClient.readContract({
      address: token,
      abi: ReadsAbi.erc20ReadAbi,
      functionName: "allowance",
      args: [from, spender],
    }));
    if (allowance < amount) {
      await executeChecked({ to: token, abi: TradeAbi.erc20WriteAbi, functionName: "approve", args: [spender, maxUint256], gas });
      approvedPairs.add(key);
      return;
    }
    // A huge standing allowance is one of our own max grants (OZ-style tokens
    // never decrement those) — safe to cache. A finite covering allowance is
    // not: leave the pair uncached so the next pull re-reads it.
    if (allowance >= UNLIMITED_ALLOWANCE_FLOOR) approvedPairs.add(key);
  }

  // Credit-delegation twin of approveIfNeeded, for gateway-routed borrows.
  async function delegateIfNeeded(debtToken: Address, delegatee: Address, amount: bigint, gas?: bigint): Promise<void> {
    const key = `delegate:${debtToken.toLowerCase()}:${delegatee.toLowerCase()}`;
    if (approvedPairs.has(key)) return;
    const allowance = (await writer.publicClient.readContract({
      address: debtToken,
      abi: LendAbi.lendDebtTokenAbi,
      functionName: "borrowAllowance",
      args: [from, delegatee],
    }));
    if (allowance < amount) {
      await executeChecked({
        to: debtToken,
        abi: LendAbi.lendDebtTokenAbi,
        functionName: "approveDelegation",
        args: [delegatee, maxUint256],
        gas,
      });
      approvedPairs.add(key);
      return;
    }
    if (allowance >= UNLIMITED_ALLOWANCE_FLOOR) approvedPairs.add(key);
  }

  // The gateway's wrapped-native reserve tokens (aWSOMI / WSOMI variable debt),
  // resolved once per lender: gateway.getWETHAddress() → Pool.getReserveData.
  let nativeTokens: Promise<{ aToken: Address; variableDebtToken: Address }> | undefined;
  function resolveNativeTokens(): Promise<{ aToken: Address; variableDebtToken: Address }> {
    nativeTokens ??= (async () => {
      const gateway = requireGateway();
      const pool = requirePool();
      const wrapped = (await writer.publicClient.readContract({
        address: gateway,
        abi: LendAbi.lendGatewayAbi,
        functionName: "getWETHAddress",
      }));
      const reserve = (await writer.publicClient.readContract({
        address: pool,
        abi: LendAbi.lendPoolAbi,
        functionName: "getReserveData",
        args: [wrapped],
      })) as { aTokenAddress: Address; variableDebtTokenAddress: Address };
      return { aToken: reserve.aTokenAddress, variableDebtToken: reserve.variableDebtTokenAddress };
    })().catch((e: unknown) => {
      // Don't memoize a failure: a transient RPC error would otherwise poison
      // every native flow for the lender's lifetime. Next call retries fresh.
      nativeTokens = undefined;
      throw e;
    });
    return nativeTokens;
  }

  return {
    account: from,

    async supply(asset, amount, opts) {
      const pool = requirePool();
      if (opts?.approve !== false) await approveIfNeeded(asset, pool, amount, opts?.gas);
      return executeChecked({
        to: pool,
        abi: LendAbi.lendPoolAbi,
        functionName: "supply",
        args: [asset, amount, opts?.onBehalfOf ?? from, NO_REFERRAL],
        gas: opts?.gas,
      });
    },

    async withdraw(asset, amount, opts) {
      return executeChecked({
        to: requirePool(),
        abi: LendAbi.lendPoolAbi,
        functionName: "withdraw",
        args: [asset, amount, opts?.to ?? from],
        gas: opts?.gas,
      });
    },

    async borrow(asset, amount, opts) {
      return executeChecked({
        to: requirePool(),
        abi: LendAbi.lendPoolAbi,
        functionName: "borrow",
        args: [asset, amount, VARIABLE_RATE, NO_REFERRAL, from],
        gas: opts?.gas,
      });
    },

    async repay(asset, amount, opts) {
      const pool = requirePool();
      // A maxUint256 full-repay still only pulls the actual debt; approving max
      // (the doctrine's grant anyway) covers it without knowing the exact owed.
      if (opts?.approve !== false) await approveIfNeeded(asset, pool, amount, opts?.gas);
      return executeChecked({
        to: pool,
        abi: LendAbi.lendPoolAbi,
        functionName: "repay",
        args: [asset, amount, VARIABLE_RATE, opts?.onBehalfOf ?? from],
        gas: opts?.gas,
      });
    },

    async setUseAsCollateral(asset, useAsCollateral, opts) {
      return executeChecked({
        to: requirePool(),
        abi: LendAbi.lendPoolAbi,
        functionName: "setUserUseReserveAsCollateral",
        args: [asset, useAsCollateral],
        gas: opts?.gas,
      });
    },

    async supplyNative(amount, opts) {
      return executeChecked({
        to: requireGateway(),
        abi: LendAbi.lendGatewayAbi,
        functionName: "depositETH",
        args: [requirePool(), opts?.onBehalfOf ?? from, NO_REFERRAL],
        value: amount,
        gas: opts?.gas,
      });
    },

    async withdrawNative(amount, opts) {
      const gateway = requireGateway();
      const { aToken } = await resolveNativeTokens();
      // The gateway pulls the aTokens to unwrap them — a plain ERC-20 approval
      // on the aToken, same doctrine as the supply-side pulls.
      if (opts?.approve !== false) await approveIfNeeded(aToken, gateway, amount, opts?.gas);
      return executeChecked({
        to: gateway,
        abi: LendAbi.lendGatewayAbi,
        functionName: "withdrawETH",
        args: [requirePool(), amount, opts?.to ?? from],
        gas: opts?.gas,
      });
    },

    async borrowNative(amount, opts) {
      const gateway = requireGateway();
      const { variableDebtToken } = await resolveNativeTokens();
      if (opts?.approve !== false) await delegateIfNeeded(variableDebtToken, gateway, amount, opts?.gas);
      return executeChecked({
        to: gateway,
        abi: LendAbi.lendGatewayAbi,
        functionName: "borrowETH",
        args: [requirePool(), amount, VARIABLE_RATE, NO_REFERRAL],
        gas: opts?.gas,
      });
    },

    async repayNative(amount, opts) {
      return executeChecked({
        to: requireGateway(),
        abi: LendAbi.lendGatewayAbi,
        functionName: "repayETH",
        args: [requirePool(), amount, VARIABLE_RATE, opts?.onBehalfOf ?? from],
        value: amount,
        gas: opts?.gas,
      });
    },

    clearApprovalCache() {
      approvedPairs.clear();
    },
  };
}
