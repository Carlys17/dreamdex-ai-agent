// /system diagnostics reads — the deployed CLOB-family contract state (impl
// pointers, MarketCreator reactivity wiring, oracle links, collateral meta —
// resolved from the per-venue `collateral` address, with `testUsdc` as the
// legacy fallback). Addresses come from the client config (createClient({ addresses })).

import type { Address, PublicClient } from "viem";
import type { SomniaMarketsAddresses } from "./config.js";
import * as SystemAbi from "./systemAbi.js";

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 *  On-chain state of the configured MarketCreator (part of {@link SystemInfo}).
 *  Fields read via failure-tolerant calls: `null`/`0n` fallbacks mean the read
 *  failed, not a live zero.
 */
export interface MarketCreatorInfo {
  /** Markets this creator has minted (`marketCount()`; `0n` if the read failed). */
  marketCount: bigint;
  /** Creator owner; `null` when the read failed. */
  owner: Address | null;
  /** Gas limit its reactivity roll callbacks run with. */
  reactivityGasLimit: bigint;
  /** Reactivity-callback fee ceiling (wei per gas). */
  reactivityMaxFeePerGas: bigint;
  /** Reactivity-callback tip (wei per gas). */
  reactivityPriorityFeePerGas: bigint;
  /** Origin operator id this creator's markets are attributed to. */
  operatorId: number;
  /** Origin venue id within the operator (bytes32 hex). */
  venueId: string;
}

/**
 *  Live snapshot of the deployed CLOB-family contract state, as read by
 *  {@link SomniaMarketsClient.getSystemInfo}. Every field is failure-tolerant: `null` means the
 *  contract is unconfigured or the live read failed — never a thrown error.
 */
export interface SystemInfo {
  /** BinaryMarketsModule.clobFactory() (authoritative) or the configured fallback. */
  clobFactory: Address | null;
  /**
   *  ClobFactory.binaryMarketImpl(), or null when the live read fails (there is
   *  no configured market-impl fallback; `binaryPoolImpl` is a different contract).
   */
  binaryMarketImpl: Address | null;
  /** True when the live ClobFactory differs from the configured one. */
  factoryMismatch: boolean;
  /**
   *  The BinarySettlement singleton the module is wired to (live
   *  `BinaryMarketsModule.settlement()`, falling back to the configured
   *  `addresses.binarySettlement`). Null pre-wire / on pre-v2 deploys.
   */
  settlement: Address | null;
  /** True when the module's live settlement differs from the configured one. */
  settlementMismatch: boolean;
  /** The configured MarketCreator's state; null when `addresses.marketCreator` is unset. */
  marketCreator: MarketCreatorInfo | null;
  /** FakeOracle wiring; null when `addresses.fakeOracle` is unset. */
  oracle: {
    /** FakeOracle owner (the resolve/void signer); null when the read failed. */
    owner: Address | null;
    /** The module the oracle delivers to (its `RECEIVER`); null when the read failed. */
    binaryModule: Address | null;
  } | null;
  /**
   *  Collateral ERC-20 metadata (from `addresses.collateral`, falling back to the
   *  legacy `testUsdc`); null when neither is configured.
   */
  usdc: {
    /** Token symbol; null when the read failed. */
    symbol: string | null;
    /** Token decimals; null when the read failed. */
    decimals: number | null;
  } | null;
}

/** Live snapshot of the deployed CLOB family (for the /system dashboard). */
export async function getSystemInfo(client: PublicClient, addresses: SomniaMarketsAddresses): Promise<SystemInfo> {
  const a = addresses;
  const pc = client;

  const liveFactory = a.binaryModule
    ? ((await safe(
        pc.readContract({ address: a.binaryModule, abi: SystemAbi.binaryModuleReadAbi, functionName: "clobFactory" }),
      )))
    : null;
  const clobFactory = (liveFactory ?? a.clobFactory ?? null);
  const factoryMismatch =
    !!liveFactory && !!a.clobFactory && liveFactory.toLowerCase() !== a.clobFactory.toLowerCase();

  // Settlement-extraction v2: the module's wired BinarySettlement singleton. The
  // live read is authoritative; a zero/unset wire falls back to the config so a
  // just-deployed env still renders the address it EXPECTS to be wired.
  const liveSettlementRaw = a.binaryModule
    ? ((await safe(
        pc.readContract({ address: a.binaryModule, abi: SystemAbi.binaryModuleReadAbi, functionName: "settlement" }),
      )))
    : null;
  const liveSettlement =
    liveSettlementRaw && !/^0x0{40}$/.test(liveSettlementRaw) ? liveSettlementRaw : null;
  const settlement = (liveSettlement ?? a.binarySettlement ?? null);
  const settlementMismatch =
    !!liveSettlement &&
    !!a.binarySettlement &&
    liveSettlement.toLowerCase() !== a.binarySettlement.toLowerCase();

  const liveImpl = clobFactory
    ? ((await safe(
        pc.readContract({ address: clobFactory, abi: SystemAbi.clobFactoryReadAbi, functionName: "binaryMarketImpl" }),
      )))
    : null;
  // No config fallback here: the addresses map has no binaryMarketImpl key, and
  // binaryPoolImpl is a different contract — never report it under this heading.
  const binaryMarketImpl = (liveImpl ?? null);

  let marketCreator: MarketCreatorInfo | null = null;
  if (a.marketCreator) {
    const mc = { address: a.marketCreator, abi: SystemAbi.marketCreatorReadAbi } as const;
    const [marketCount, owner, gasLimit, maxFee, prioFee, operatorId, venueId] = await Promise.all([
      safe(pc.readContract({ ...mc, functionName: "marketCount" })),
      safe(pc.readContract({ ...mc, functionName: "owner" })),
      safe(pc.readContract({ ...mc, functionName: "reactivityGasLimit" })),
      safe(pc.readContract({ ...mc, functionName: "reactivityMaxFeePerGas" })),
      safe(pc.readContract({ ...mc, functionName: "reactivityPriorityFeePerGas" })),
      safe(pc.readContract({ ...mc, functionName: "operatorId" })),
      safe(pc.readContract({ ...mc, functionName: "venueId" })),
    ]);
    marketCreator = {
      marketCount: (marketCount) ?? 0n,
      owner: (owner) ?? null,
      reactivityGasLimit: (gasLimit) ?? 0n,
      reactivityMaxFeePerGas: (maxFee) ?? 0n,
      reactivityPriorityFeePerGas: (prioFee) ?? 0n,
      operatorId: Number((operatorId as number | bigint | null) ?? 0),
      venueId: ((venueId as string | null) ?? `0x${"00".repeat(32)}`).toLowerCase(),
    };
  }

  let oracle: SystemInfo["oracle"] = null;
  if (a.fakeOracle) {
    const fo = { address: a.fakeOracle, abi: SystemAbi.fakeOracleReadAbi } as const;
    const [owner, binaryModule] = await Promise.all([
      safe(pc.readContract({ ...fo, functionName: "owner" })),
      safe(pc.readContract({ ...fo, functionName: "RECEIVER" })),
    ]);
    oracle = { owner: (owner) ?? null, binaryModule: (binaryModule) ?? null };
  }

  let usdc: SystemInfo["usdc"] = null;
  const collateral = a.collateral ?? a.testUsdc;
  if (collateral) {
    const tu = { address: collateral, abi: SystemAbi.erc20MetaAbi } as const;
    const [symbol, decimals] = await Promise.all([
      safe(pc.readContract({ ...tu, functionName: "symbol" })),
      safe(pc.readContract({ ...tu, functionName: "decimals" })),
    ]);
    usdc = {
      symbol: (symbol) ?? null,
      decimals: decimals == null ? null : Number(decimals),
    };
  }

  return { clobFactory, binaryMarketImpl, factoryMismatch, settlement, settlementMismatch, marketCreator, oracle, usdc };
}

/** Native (gas-token) balance of an address. */
export async function getNativeBalance(address: Address, client: PublicClient): Promise<bigint> {
  return client.getBalance({ address });
}
