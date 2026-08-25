// Perp PROTOCOL state — the plane below any one account or market.
//
// PERP-ONLY. What the protocol repo's `perps:state` / `perps:health` ops tasks read
// when answering "is this stack wired and solvent", as opposed to "how is this
// trader doing". Three contracts: the MarginBank's own wiring, the InsuranceFund
// backing it, and the LiquidationEngine's configured bounds.
//
// Deliberately NOT here: oracle surfaces, and the SimPerpMarketMaker / SimPerpTaker
// actors that drive testnet flow. Those are simulation scaffolding, not protocol.

import type { Address, PublicClient } from "viem";
import * as ReadsAbi from "../readsAbi.js";

/**
 *  How the perps stack is wired, straight from `MarginBank.getSystemConfig`.
 *
 *  This is the address book. Every other contract in the plane is reachable from
 *  here, so a consumer never hardcodes one per chain — and the bank's own view of
 *  them is the authoritative one, since these are the addresses it will actually
 *  call.
 */
export interface PerpSystemConfig {
  /** The MarginBank reporting this config (echoed back). */
  marginBank: Address;
  /** The single collateral token every perp market is quoted in. */
  collateralToken: Address;
  /** The factory that deploys PerpPools. */
  perpPoolFactory: Address;
  /** The LiquidationEngine — the PROXY, which is what to call. */
  liquidationEngine: Address;
  /** The tiered InsuranceFund that absorbs bad debt. */
  insuranceFund: Address;
  /** Where protocol fees are routed. */
  feeRecipient: Address;
  /** Protocol-wide ceiling on per-account leverage; clamps a stricter user setting. */
  maxLeverageLimit: number;
  /**
   *  Whether the factory, liquidation engine and insurance fund are all set.
   *
   *  **`feeRecipient` is NOT part of it**, despite sitting in the same struct — the
   *  contract's flag covers three of the five addresses above. A go-live check that
   *  read this as "everything is configured" would sign off a stack whose fee routing
   *  is still unset, so check {@link feeRecipient} separately.
   *
   *  False means some part of the stack is half-configured, which is the state in
   *  which liquidation or settlement paths degrade silently rather than reverting.
   */
  fullyWired: boolean;
}

/** One tier of the InsuranceFund. */
export interface InsuranceFundTier {
  /**
   *  Tier index. `0` is the general/unallocated bucket — a reserved sentinel that
   *  never absorbs bad debt and backs no pools (its {@link poolCount} is structurally
   *  zero, since tier 0 means "uncovered" and is not tracked). Coverage tiers run
   *  `1..maxTiers`.
   */
  tier: number;
  /** Collateral held in this tier, raw units. */
  balance: bigint;
  /** How many perp pools this tier backs. */
  poolCount: bigint;
}

/** The InsuranceFund's solvency picture. */
export interface InsuranceFundState {
  /**
   *  The fund's address.
   */
  address: Address;
  /**
   *  The maximum tier INDEX, not a count — the fund has `maxTiers + 1` addressable
   *  buckets, because tier 0 exists alongside coverage tiers `1..maxTiers`.
   */
  maxTiers: bigint;
  /**
   *  Sum across every tier including tier 0, raw collateral units — the contract's own
   *  `getTotalTierBalances`, which is the figure the INV-TIER accounting invariant is
   *  stated against.
   *
   *  **Not "how much bad debt this stack can absorb"**, on two counts. Tier 0 is
   *  included here but never absorbs anything, so collateral parked there inflates the
   *  number without backing a single market. And each coverage tier is charged only
   *  its own pools' realized losses, capped at `min(funded, own loss)` and never
   *  subsidising another tier — so even the `1..maxTiers` sum is an upper bound that
   *  no single event can draw down in full. For absorption against a specific market,
   *  read that market's tier from {@link tiers}.
   */
  totalBalance: bigint;
  /** Per-tier balances and how many pools each backs, tier 0 first. */
  tiers: InsuranceFundTier[];
}

/**
 *  The LiquidationEngine's CONFIGURED bounds — not its history, which is indexed as
 *  `LiquidationEvent`.
 */
export interface LiquidationEngineConfig {
  /** The engine's address. */
  address: Address;
  /** The MarginBank it liquidates against — cross-check against the system config. */
  marginBank: Address;
  /** Penalty charged on a liquidation, bps. */
  penaltyBps: bigint;
  /** Lower bound on the liquidation spread, bps. */
  minSpreadBps: bigint;
  /** Upper bound on the liquidation spread, bps. */
  maxSpreadBps: bigint;
  /** Per-block cap on liquidated notional, raw quote units — the throughput throttle. */
  maxVolumePerBlock: bigint;
  /**
   *  Registered stage-4 backstop bidders.
   *
   *  Zero is a real operational signal, not just a statistic: with no bidders the
   *  takeover stage has nobody to take a position over, so the waterfall falls
   *  through to ADL sooner.
   */
  bidderCount: bigint;
}

/**
 *  How the perps stack is wired — the address book for every other contract in the
 *  plane, plus the `fullyWired` health flag.
 *
 *  Chain tier. Read this first: `liquidationEngine` and `insuranceFund` from here are
 *  what {@link getLiquidationEngineConfig} and {@link getInsuranceFundState} should be
 *  pointed at, so nothing is hardcoded per chain.
 *
 *  Note `liquidationEngine` is the PROXY. An implementation address (what a bytecode
 *  drift check reports) answers reads with unset defaults — zero bidders, zero
 *  penalty — which looks like a configured-but-empty engine rather than the wrong
 *  address.
 */
export async function getPerpSystemConfig(marginBank: Address, client: PublicClient): Promise<PerpSystemConfig> {
  const c = await client.readContract({
    address: marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "getSystemConfig",
  });
  return {
    marginBank: c.marginBank,
    collateralToken: c.collateralToken,
    perpPoolFactory: c.perpPoolFactory,
    liquidationEngine: c.liquidationEngine,
    insuranceFund: c.insuranceFund,
    feeRecipient: c.feeRecipient,
    maxLeverageLimit: c.maxLeverageLimit,
    fullyWired: c.fullyWired,
  };
}

/**
 *  The InsuranceFund's per-tier balances and the total it can absorb.
 *
 *  Chain tier. `address` comes from {@link getPerpSystemConfig}. Tiers are read in one
 *  fan-out after `getMaxTiers`, so the per-tier figures share a view of the tier count.
 */
export async function getInsuranceFundState(fund: Address, client: PublicClient): Promise<InsuranceFundState> {
  const f = { address: fund, abi: ReadsAbi.insuranceFundReadAbi } as const;
  const [maxTiers, totalBalance] = await Promise.all([
    client.readContract({ ...f, functionName: "getMaxTiers" }),
    client.readContract({ ...f, functionName: "getTotalTierBalances" }),
  ]);
  // `maxTiers` is the maximum tier INDEX, not a count: tier 0 is the general bucket
  // and coverage tiers run 1..maxTiers, so the fund has maxTiers + 1 addressable
  // buckets. The contract's own `getTotalTierBalances` loops `t <= maxTiers` — walking
  // a bare `length: maxTiers` stopped one short and made the LAST coverage tier
  // permanently invisible, so a funded tier would be missing from the breakdown while
  // still counted in `totalBalance`.
  const indices = Array.from({ length: Number(maxTiers) + 1 }, (_, i) => BigInt(i));
  const tiers = await Promise.all(
    indices.map(async (tier) => {
      const [balance, poolCount] = await Promise.all([
        client.readContract({ ...f, functionName: "getTierBalance", args: [tier] }),
        client.readContract({ ...f, functionName: "getPoolCountForTier", args: [tier] }),
      ]);
      return { tier: Number(tier), balance, poolCount };
    }),
  );
  return { address: fund, maxTiers, totalBalance, tiers };
}

/**
 *  The LiquidationEngine's configured bounds.
 *
 *  Chain tier. `address` comes from {@link getPerpSystemConfig} — and must be the
 *  proxy, since an implementation address answers with unset defaults that read as a
 *  configured-but-idle engine.
 *
 *  `bidderCount === 0n` is worth surfacing: with no registered backstop bidders the
 *  takeover stage has nobody to take a position over, so the waterfall reaches ADL
 *  sooner than the configuration implies.
 */
export async function getLiquidationEngineConfig(
  engine: Address,
  client: PublicClient,
): Promise<LiquidationEngineConfig> {
  const e = { address: engine, abi: ReadsAbi.liquidationEngineReadAbi } as const;
  const [marginBank, penaltyBps, minSpreadBps, maxSpreadBps, maxVolumePerBlock, bidderCount] = await Promise.all([
    client.readContract({ ...e, functionName: "getMarginBank" }),
    client.readContract({ ...e, functionName: "getLiquidationPenaltyBps" }),
    client.readContract({ ...e, functionName: "getMinLiquidationSpreadBps" }),
    client.readContract({ ...e, functionName: "getMaxLiquidationSpreadBps" }),
    client.readContract({ ...e, functionName: "getMaxLiquidationVolumePerBlock" }),
    client.readContract({ ...e, functionName: "getBidderCount" }),
  ]);
  return { address: engine, marginBank, penaltyBps, minSpreadBps, maxSpreadBps, maxVolumePerBlock, bidderCount };
}

/**
 *  An account's equity without the revert — `null` when the read could not complete.
 *
 *  Chain tier. `getAccountHealth` propagates an oracle failure, which is exactly when
 *  a health sweep most needs an answer; this reports it as `null` instead. Null means
 *  "not computable right now" (an unpriceable market in the account's set), never
 *  "zero equity".
 */
export async function tryGetPerpAccountEquity(
  marginBank: Address,
  account: Address,
  client: PublicClient,
): Promise<bigint | null> {
  const [ok, equity] = await client.readContract({
    address: marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "tryGetAccountEquity",
    args: [account],
  });
  return ok ? equity : null;
}

/**
 *  Collateral BACKING an account: `max(0, unlocked + locked)`, raw units.
 *
 *  Chain tier. Deliberately unlike equity — one storage pair, no market walk, no
 *  oracle, and it cannot revert. Use it when you need a solvency floor that survives
 *  a dead price feed; use equity when you need mark-to-market truth.
 */
export async function getPerpCollateralBasis(
  marginBank: Address,
  account: Address,
  client: PublicClient,
): Promise<bigint> {
  return client.readContract({
    address: marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "getCollateralBasis",
    args: [account],
  });
}
