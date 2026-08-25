// BinaryMarketsModule write + read ABIs (settlement-extraction v2). The module is
// the user-facing markets contract (config `binaryModule`): it owns the pools,
// routes redemption through the settlement singleton (external redeem/redeemFor
// signatures UNCHANGED from v1), and exposes the permissionless keeper entries
// `finalizeMarket` / `releasePool` plus the creator-scoped free-pool reads.
// Signatures mirror smart-contracts/src/modules/BinaryMarketsModule.sol EXACTLY.

import { parseAbi } from "viem";

/**
 *  BinaryMarketsModule write surface — for keepers/tooling redeeming, minting/merging
 *  complete sets, or driving `finalizeMarket`/`releasePool` directly.
 */
export const binaryModuleWriteAbi = parseAbi([
  // Redemption — trader-facing, signatures UNCHANGED from v1. The module pulls the
  // caller's winning outcome tokens then redeems through the settlement singleton;
  // `(operatorId, venueId)` are attribution-only (may be 0).
  "function redeem(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint8 outcomeIdx, uint256 amount)",
  "function redeemMany(uint32 operatorId, bytes32 venueId, bytes32[] marketIds, uint8[] outcomeIdxs, uint256[] amounts)",
  "function redeemFor(address owner, uint256 nonce, uint256 deadline, bytes sig, uint32 operatorId, bytes32 venueId, bytes32 marketId, uint8 outcomeIdx, uint256 amount)",
  // Complete-set mint / merge — pool surface unchanged; module orchestrates.
  "function mintCompleteSet(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint256 amount)",
  "function mergeCompleteSet(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint256 amount)",
  // NEW permissionless keeper entries. `finalizeMarket` sweeps the pool's backing
  // + resolution snapshot to settlement (no-op-guarded against double-finalize);
  // `releasePool` returns a finalized, drained pool to its creator's free list for
  // recycle. Both revert if the module has no settlement wired.
  "function finalizeMarket(bytes32 marketId)",
  "function releasePool(bytes32 marketId)",
  // Permissionless earmark reconcile. `BinaryMarket.voidExpired()` (the dead-oracle
  // escape hatch) flips a market Voided directly, bypassing the module — so the
  // oracle adapter's onResolved (hub earmark release) never fires. `syncSettlement`
  // drives that missing release once the market is terminal (reverts
  // `MarketNotSettled` while still live). Idempotent on the hub side.
  "function syncSettlement(bytes32 marketId)",
  // Permissionless oracle retry — the FIRST thing to try when a market is past
  // expiry with no resolution. Keyed by ORACLE QUESTION, not market: the module
  // fans out to every market bound to that question, pulls each one's adapter,
  // and resolves the ones that answer. Unanswered adapters are skipped, so a
  // partial success is a success; it reverts `OracleNotAnswered` only when none
  // answered, and `UnknownOracleQuestion` when no market is bound at all.
  "function pokeOracle(uint256 oracleQuestionId)",
]);

/**
 *  BinaryMarketsModule read surface — for keepers/tooling resolving market records,
 *  pool creators, and creator free-pool lists directly.
 */
export const binaryModuleReadAbi = parseAbi([
  // The permanent BinarySettlement singleton every pool finalizes into.
  "function settlement() view returns (address)",
  // A pool's creator (its first-deploy creator) — the only party that can reuse it.
  "function poolCreator(address pool) view returns (address creator)",
  // The creator's free (finalized + released, reusable) pools for a collateral.
  "function getFreePools(address creator, address collateral) view returns (address[] pools)",
  "function freePoolCount(address creator, address collateral) view returns (uint256 count)",
  // A market's pool nonce (part of its outcome-id encoding). Separate view — the
  // wide `markets` tuple keeps its v1 ABI.
  "function marketNonce(bytes32 marketId) view returns (uint64 nonce)",
  // marketId => the value-type MarketRecord fields (ABI unchanged from v1).
  "function markets(bytes32 marketId) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)",
]);
