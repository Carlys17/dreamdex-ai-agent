// Chain-side helpers for the operator/venue WRITE forms (createVenue /
// updateVenue). Everything a UI READS about operators/venues comes from the
// indexer (see operatorAdmin.ts `listOperators` / `getOperator` / `listVenues` /
// `getVenue`) — the control-plane state is fully indexed, so a directory never
// fans out eth_calls. What genuinely needs the chain is fee-param encoding:
// the BINARY_V1 venue `feeParams` bytes are produced by the deployed module's
// own `encodeVenueFeeParams` (so the version tag + struct shape can never
// desync from the contract), and the protocol fee cap is a live module read.

import { decodeAbiParameters, type Address, type Hex, type PublicClient } from "viem";
import { NotConfiguredError } from "./errors.js";
import * as OperatorAbi from "./operatorAbi.js";

/**
 *  `MarketTypeIds.BINARY_V1` (`bytes4(keccak256("BINARY_V1"))`) — the only
 *  market type registered today. A venue is pinned to one type forever at
 *  `createVenue`.
 */
export const MARKET_TYPE_BINARY_V1: Hex = "0x06c65d9f";

/**
 *  Schema version of the `BinaryVenueParams` payload the module encodes/decodes
 *  (mirror of `BinaryMarketsModule.FEE_PARAMS_VERSION`). Bump in lockstep with
 *  the contract; the decoder rejects any other tag.
 */
const FEE_PARAMS_VERSION = 2;

/**
 *  Plain-bps fee rates for a BINARY_V1 venue (see BinaryMarketsModule.BinaryVenueParams).
 *  Each rate is capped at the module's `MAX_FEE_BPS` (currently 1_000 = 10%).
 */
export interface BinaryVenueParams {
  /** Pool protocol fee charged on maker-side fills (bps). */
  makerFeeBps: number;
  /** Pool protocol fee charged on taker-side fills (bps). */
  takerFeeBps: number;
  /** Per-order builder/routing fee ceiling the pool enforces at placeOrder (bps). */
  maxBuilderFeeBps: number;
  /**
   *  Advertised default routing fee for frontends routing through this venue
   *  (bps); must be <= `maxBuilderFeeBps`.
   */
  routingFeeBps: number;
  /**
   *  Fee skimmed from the WINNING payout on redemption of a resolved market
   *  (bps; 0 = none). Frozen into each market at creation — a later
   *  `updateVenue` only affects markets created afterward. Never charged on
   *  voided (capital-refund) redemptions.
   */
  settlementFeeBps: number;
}

/**
 *  Build a BINARY_V1 venue's `feeParams` bytes from plain-bps rates via the
 *  deployed BinaryMarketsModule's `encodeVenueFeeParams` (a `pure` on-chain
 *  helper) — avoids re-deriving the version tag / struct encoding here, so a
 *  future `FEE_PARAMS_VERSION` bump can't silently desync client vs contract.
 */
export async function encodeBinaryVenueFeeParams(
  vp: BinaryVenueParams,
  client: PublicClient,
  binaryModule: Address | undefined,
): Promise<Hex> {
  if (!binaryModule) {
    throw new NotConfiguredError("binaryModule or config.addresses.binaryModule", "this operator read");
  }
  return (await client.readContract({
    address: binaryModule,
    abi: OperatorAbi.binaryModuleFeeParamsAbi,
    functionName: "encodeVenueFeeParams",
    args: [
      {
        makerFeeBps: BigInt(vp.makerFeeBps),
        takerFeeBps: BigInt(vp.takerFeeBps),
        maxBuilderFeeBps: BigInt(vp.maxBuilderFeeBps),
        routingFeeBps: BigInt(vp.routingFeeBps),
        settlementFeeBps: BigInt(vp.settlementFeeBps),
      },
    ],
  }));
}

const _binaryVenueParamsAbiType = {
  type: "tuple",
  components: [
    { name: "makerFeeBps", type: "uint64" },
    { name: "takerFeeBps", type: "uint64" },
    { name: "maxBuilderFeeBps", type: "uint64" },
    { name: "routingFeeBps", type: "uint64" },
    { name: "settlementFeeBps", type: "uint64" },
  ],
} as const;

/**
 *  Decode a BINARY_V1 venue's `feeParams` bytes back into (version, rates) for
 *  display — pure/local, mirrors BinaryMarketsModule's own
 *  `abi.decode(feeParams, (uint8, BinaryVenueParams))`. Returns null if the
 *  bytes aren't exactly one version-tagged, abi-encoded `BinaryVenueParams`
 *  (192 bytes / 6 static words), e.g. an empty or non-BINARY_V1 venue.
 */
export function decodeBinaryVenueFeeParams(feeParams: Hex): {
  /** The payload's schema version tag (always the module's current version when non-null). */
  version: number;
  /** The decoded plain-bps venue fee rates. */
  params: BinaryVenueParams;
} | null {
  if ((feeParams.length - 2) / 2 !== 192) return null;
  try {
    const [version, vp] = decodeAbiParameters([{ type: "uint8" }, _binaryVenueParamsAbiType], feeParams) as [
      number,
      {
        makerFeeBps: bigint;
        takerFeeBps: bigint;
        maxBuilderFeeBps: bigint;
        routingFeeBps: bigint;
        settlementFeeBps: bigint;
      },
    ];
    // Reject an unknown version rather than trusting a same-length re-layout to
    // decode into the right fields (mirrors the contract's UnsupportedFeeParamsVersion).
    if (version !== FEE_PARAMS_VERSION) return null;
    return {
      version,
      params: {
        makerFeeBps: Number(vp.makerFeeBps),
        takerFeeBps: Number(vp.takerFeeBps),
        maxBuilderFeeBps: Number(vp.maxBuilderFeeBps),
        routingFeeBps: Number(vp.routingFeeBps),
        settlementFeeBps: Number(vp.settlementFeeBps),
      },
    };
  } catch {
    return null;
  }
}

/**
 *  The module's protocol-level ceiling on any single venue fee rate, in plain
 *  bps (e.g. 1_000 = 10%) — read live so the UI never hardcodes a cap that
 *  could drift from the deployed module.
 */
export async function getMaxVenueFeeBps(client: PublicClient, binaryModule: Address | undefined): Promise<number> {
  if (!binaryModule) {
    throw new NotConfiguredError("binaryModule or config.addresses.binaryModule", "this operator read");
  }
  return Number(
    await client.readContract({ address: binaryModule, abi: OperatorAbi.binaryModuleFeeParamsAbi, functionName: "MAX_FEE_BPS" }),
  );
}
