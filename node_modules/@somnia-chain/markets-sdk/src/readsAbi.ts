// Minimal read-side ABIs (self-contained, like abi.ts/tradeAbi.ts). Signatures
// verified against smart-contracts: BinaryPool (OrderBook), BinaryMarket, ERC-20.

import { parseAbi } from "viem";

/**
 *  The three IOrderBook order views. Spread into `binaryPoolReadAbi` below,
 *  which every pool kind's book reads already share (SpotPool/PerpPool inherit
 *  the same OrderBook base — see `getSpotOrderBook`), so one copy covers all.
 *
 *  `OrderId` is a `uint128` user-defined value type (ABI-encoded as uint128);
 *  `Order` is the 8-field struct in IOrderBook.sol. Two callable constraints
 *  live in the contract, not the types: `getOwnOpenOrders` answers for
 *  `msg.sender`, and `getAllOpenOrdersOffChain` reverts unless `msg.sender` is
 *  the zero address (the bare `eth_call` default).
 */
const orderViews = [
  "function getOrder(uint128 orderId) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs))",
  "function getOwnOpenOrders() view returns (uint128[])",
  "function getAllOpenOrdersOffChain(bool isBid, uint256 maxCount, uint64 startCursor) view returns ((uint128 orderId, bool isBid, address owner, uint64 userData, uint256 price, uint256 fullQuantity, uint256 quantityRemaining, uint64 expireTimestampNs)[] orders, bool hasMoreOrders, uint64 nextCursor)",
  // `getOrder` reverts with this for an id the pool has no ACTIVE order for
  // (unknown, filled, cancelled, or replaced by a reduce) — `getOrderOnchain`
  // reads it as a null answer, matching on its selector.
  //
  // The revert does NOT decode by name at the read boundary: that table is
  // generated from `smart-contracts/src/**`, and OrderBook lives in the dex
  // submodule under `lib/`. Declared here anyway as the single source the
  // selector and its test are both derived from.
  "error IncorrectOrder()",
] as const;

export const binaryPoolReadAbi = parseAbi([
  "function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])",
  // The tick/lot grid the pool validates orders against (IOrderBook base —
  // shared by spot/binary/perp pools; see perpPoolReadAbi's identical entry).
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  // Builder / routing-fee views (pool bps×1000 unit). Read-only, no signer —
  // these back the order form's ceiling hint + approval gate. `getEffective…`
  // clamps the user's raw approval by the pool's protocol-wide ceiling.
  "function getMaxBuilderFeeBpsTimes1k() view returns (uint256)",
  "function getBuilderApproval(address user, address builder) view returns (uint256)",
  "function getEffectiveBuilderApproval(address user, address builder) view returns (uint256)",
  // Settlement-extraction v2 pool reads. A pool is now a TIME-VARYING 1:1 binding
  // to markets (never concurrent): `marketNonce` (1 on a fresh pool, ++ on each
  // recycle) disambiguates successive markets' outcome ids; `settlement` is the
  // permanent redemption singleton; `finalized` is true between finalize and the
  // next recycle; `booksEmpty` gates release; `marketExpiryNs` is the order-expiry
  // cap. `getBinaryPoolParams` bundles the whole state (BinaryPoolInfo) in one call.
  "function marketNonce() view returns (uint64)",
  "function settlement() view returns (address)",
  "function finalized() view returns (bool)",
  "function booksEmpty() view returns (bool)",
  "function marketExpiryNs() view returns (uint64)",
  "function setBacking() view returns (uint256)",
  "function getBinaryPoolParams() view returns ((address collateralToken, address market, address outcomeToken, uint256 yesId, uint256 noId, uint256 oneCollateral, uint256 setBacking, address feeRecipient, uint256 makerFeeBpsTimes1k, uint256 takerFeeBpsTimes1k, uint256 maxBuilderFeeBpsTimes1k, uint256 settlementFeeBpsTimes1k, address settlement, uint64 marketNonce, bool finalized))",
  ...orderViews,
]);

// IBinaryPool token accessors — the trader resolves a pool's outcome singleton
// + collateral from these (one pipelined round-trip, cached per pool). v2 pools
// serve successive markets, so the pool's outcome ids depend on its CURRENT
// `marketNonce`; the SDK reads `marketNonce` here and derives ids via
// `outcomeId(pool, nonce, idx)` (see ids.ts) instead of a per-side round-trip.
export const binaryPoolTokensAbi = parseAbi([
  "function outcomeToken() view returns (address)",
  "function collateralToken() view returns (address)",
  "function marketNonce() view returns (uint64)",
]);

// BinarySettlement singleton (settlement-extraction v2) — the permanent
// redemption home. `redeem` burns the caller's outcome tokens on the ERC-6909
// singleton and pays `to`; `finalizeAndRedeem` finalizes-if-needed first;
// `claimOwed` is the pull fallback for a push that reverted; the views expose the
// per-market record, the finalized gate, and the owed balance. Signatures mirror
// IBinarySettlement exactly (verify against the dex submodule interface).
/**
 *  The BinarySettlement redemption singleton — for keepers/tooling reading
 *  settlement records or finalizing/redeeming against it directly.
 */
export const binarySettlementAbi = parseAbi([
  "function redeem(uint256 outcomeId, uint256 amount, address to) returns (uint256 collateralOut)",
  "function finalizeAndRedeem(address pool, uint256 outcomeId, uint256 amount, address to) returns (uint256 collateralOut)",
  "function finalize(address pool) returns (uint256 marketKey)",
  "function claimOwed(address token) returns (uint256 amount)",
  "function getSettlement(uint256 marketKey) view returns ((address collateralToken, uint128 backing, bool finalized, bool voided, uint256 settlementFeeBpsTimes1k, address feeRecipient, address pool, uint64 nonce, uint256[] payoutNumerators))",
  "function isFinalized(uint256 outcomeId) view returns (bool)",
  "function owed(address user, address token) view returns (uint256)",
  "function isPoolApproved(address pool) view returns (bool)",
  "function poolRegistrar() view returns (address)",
  "function outcomeToken() view returns (address)",
]);

export const binaryMarketReadAbi = parseAbi([
  // Outcome positions are ids on the shared ERC-6909 singleton (`outcomeToken`),
  // not per-market ERC-20 token addresses.
  "function outcomeToken() view returns (address)",
  "function yesId() view returns (uint256)",
  "function noId() view returns (uint256)",
  "function pool() view returns (address)",
  "function collateral() view returns (address)",
  "function status() view returns (uint8)",
  "function backing() view returns (uint256)",
  "function expiry() view returns (uint64)",
  // Seconds after `expiry` the oracle still has to resolve. `expiry +
  // settlementWindow` is the instant `voidExpired()` becomes callable.
  "function settlementWindow() view returns (uint64)",
  // Resolution state (Settlement v3 payout vectors). The market stores a payout
  // VECTOR, not a single winner — `winningOutcome()` was removed in the
  // payout-vector refactor. `getMarketOnchain` derives the winning index as the
  // argmax of this vector, gated on `isResolved`. Empty until resolved.
  "function payoutNumerators() view returns (uint256[])",
  "function isResolved() view returns (bool)",
  "function isVoided() view returns (bool)",
]);

export const erc20ReadAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// The protocol-level ERC-6909 outcome-token singleton. ONE contract holds every
// market's YES/NO positions as ids (`(uint160(pool) << 72) | (nonce << 8) |
// outcomeIdx`, see ids.ts), so it replaces the per-market ERC-20 outcome tokens.
// Approval is per-operator (`setOperator`) — one approval covers every market —
// not per-token allowance.
/**
 *  The protocol-wide ERC-6909 outcome-token singleton — for keepers/tooling reading
 *  outcome balances or wiring operator approvals/transfers directly.
 */
export const erc6909Abi = parseAbi([
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
  "function allowance(address owner, address spender, uint256 id) view returns (uint256)",
  "function isOperator(address owner, address spender) view returns (bool)",
  "function approve(address spender, uint256 id, uint256 amount) returns (bool)",
  "function setOperator(address spender, bool approved) returns (bool)",
  "function transfer(address receiver, uint256 id, uint256 amount) returns (bool)",
  "function transferFrom(address sender, address receiver, uint256 id, uint256 amount) returns (bool)",
]);

export const spotStopRegistryReadAbi = parseAbi([
  "function somiPaymentPerOrder() view returns (uint256)",
]);

// IPerpPool reads (perp pools share the OrderBook base, so book depth reuses
// `getBookLevels` above).
//
// The note this replaced claimed these were "verified against the deployed testnet
// implementation (somnia-dex-protocol simulator branch, commit 2c8870f)". `getOpenInterest`
// was not: it declared two outputs against a single-uint256 return, so viem needed 64
// bytes from 32 and EVERY getPerpState() call threw AbiDecodingDataSizeTooSmallError —
// taking SomniaMarkets.fetchFundingRate() down with it. Treat a "verified against commit
// X" note as a claim to re-check; `mise run verify:abis` in the indexer package checks
// this class of claim against deployed bytecode instead of asserting it in a comment.
export const perpPoolReadAbi = parseAbi([
  "function marginBank() view returns (address)",
  "function oracle() view returns (address)",
  "function getMarkPrice() view returns (uint256)",
  "function getIndexPrice() view returns (uint256 price, uint256 updatedAt)",
  "function getCurrentFundingRate() view returns (int256)",
  "function getCumulativeFundingPerUnit() view returns (int256)",
  "function getProjectedCumulativeFundingPerUnit() view returns (int256)",
  // ONE total, not a (long, short) pair. The contract keeps a single counter because
  // the short side is provably equal in a matched CLOB. Declaring two outputs made
  // viem require 64 bytes from a 32-byte return, so it threw
  // AbiDecodingDataSizeTooSmallError and getPerpState() failed for EVERY perp pool —
  // and with it SomniaMarkets.fetchFundingRate(), which is built on it.
  "function getOpenInterest() view returns (uint256 openInterest)",
  "function getOneBase() view returns (uint256)",
  // Funding parameters. `fundingCalculationWindowSec` is the rate's DENOMINATOR and
  // `fundingSettlementIntervalSec` the accrual cadence; n = window / interval is both
  // the per-interval divisor and the catch-up cap. Needed to normalize any rate.
  "function getFundingParameters() view returns ((uint256 fundingCalculationWindowSec, uint256 fundingSettlementIntervalSec, int256 interestRatePerWindow, uint256 maxFundingRatePerWindow, uint256 dampener, uint256 emaSmoothingAlpha, uint256 maxOracleStalenessSec))",
  // Last settlement anchor, in NANOseconds. anchor + fundingSettlementIntervalSec is
  // when the next settlement becomes due.
  "function getLastFundingUpdateTimestampNs() view returns (uint64)",
  // The EMA'd premium driving the funding rate: book-MIDPOINT vs index, NOT mark vs
  // index. Not recoverable from FundingUpdated — the event carries neither the midpoint
  // nor the EMA, and the rate is doubly clamped so the EMA cannot be inverted. So a
  // premium reading requires this call.
  "function getEmaPremium() view returns (int256)",
  // Mark price with an explicit liveness flag, in that output order. getMarkPrice()
  // reverts on a stale feed; this reports it instead.
  "function tryGetMarkPrice() view returns (bool ok, uint256 price)",
  "function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))",
  "function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))",
  // The OI-scaled dynamic IMF actually in force right now. NOT `initialMarginBps`,
  // which is only the curve's floor: `_effectiveIMFFromIndex` scales it with the
  // market's open notional whenever dynamic IMF is enabled. Equal to the static base
  // only when it is off (`dynamicIMFParameters.upperCap == 0`).
  "function getEffectiveIMF() view returns (uint256)",
  // Every per-market risk input a health or margin calculation needs, in ONE call —
  // the contract added it precisely so a cross-margin walk reads a market once
  // instead of making five separate cross-contract getter calls.
  //
  // `getHealthSnapshot` REVERTS on a stale or zero mark (fails closed, by design).
  // Inside a Promise.all fan-out that takes every market down with it, which is the
  // exact failure mode that made getPerpState unusable before it moved to
  // tryGetMarkPrice — so prefer the try* variant for anything spanning markets.
  "function getHealthSnapshot() view returns ((uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding, uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps) snapshot)",
  "function tryGetHealthSnapshot() view returns (bool ok, (uint256 oneBase, uint256 markPrice, int256 projectedCumulativeFunding, uint256 effectiveIMFBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps) snapshot)",
  // How much of an opposite-side order counts as purely REDUCING, plus the position
  // size and resting quantities it derives from.
  //
  // Read whole, never composed from parts: the fields move together on every fill, so
  // separate calls can straddle one and yield a capacity that was never true at any
  // block. Before this existed the only visible trace was `hasOrdersFor`, which
  // collapses both quantities to a bool — so a client could not tell whether a
  // close-sized order would be accepted.
  "function getReducingCapacity(address account) view returns ((int128 positionSize, uint256 pendingBidQuantity, uint256 pendingAskQuantity, uint256 pendingOppositeQuantity, uint256 effectiveReducingCapacity) capacity)",
  // Close-only mode: position-INCREASING orders revert MarketRestricted, while closes,
  // reduces and cancels still work. Reversible — a wind-down, not necessarily a
  // retirement. Only needed on the pre-upgrade fallback path; an upgraded factory
  // reports it for every pool in one call (perpPoolFactoryReadAbi).
  "function isRestricted() view returns (bool)",
]);

// IPerpPoolFactory + IPerpPoolFactoryMarketStatus reads — perp market DISCOVERY.
//
// `getPerpPools()` is the raw deployment history and includes markets wound down to
// close-only, so listing it unfiltered presents dead markets as tradeable. The
// market-status views split it; they live on a SEPARATE interface so the factory
// upgrade stayed a drop-in (two live rotation gates check
// `type(IPerpPoolFactory).interfaceId`, which is deliberately unchanged), which is
// why feature detection here is ERC-165 on the status interface's own id.
export const perpPoolFactoryReadAbi = parseAbi([
  "function getPerpPools() view returns (address[])",
  "function perpPoolCount() view returns (uint256)",
  "function getBaseTokenForPool(address perpPool) view returns (address)",
  "function getPoolForBaseToken(address baseToken) view returns (address)",
  "function isDeployedByFactory(address perpPool) view returns (bool)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function getPerpPoolStatuses() view returns ((address perpPool, address baseToken, bool restricted)[] statuses)",
  "function getUnrestrictedPerpPools() view returns (address[] perpPools)",
  "function getRestrictedPerpPools() view returns (address[] perpPools)",
]);

// IMarginBank reads — the cross-margin hub holding collateral + positions for
// every perp pool. `getPosition` returns the Position struct; `getAccountState`
// the account's free/locked collateral.
export const marginBankReadAbi = parseAbi([
  // The bank has no bare collateralToken() getter — read it from getSystemConfig.
  "function getSystemConfig() view returns ((address marginBank, address collateralToken, address perpPoolFactory, address liquidationEngine, address insuranceFund, address feeRecipient, uint16 maxLeverageLimit, bool fullyWired))",
  "function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))",
  "function getAccountState(address account) view returns ((int256 unlockedCollateralBalance, uint256 lockedCollateral, address[] activePerpPools))",
  "function getAccountEquity(address account) view returns (int256)",
  "function getWithdrawableCollateral(address account) view returns (uint256)",
  "function getActivePerpPools(address account) view returns (address[])",
  // Cross-margin health across all active markets: equity vs the initial /
  // maintenance / close-out margin requirements (raw collateral units). Plus the
  // MarginStatus enum: 0 Healthy · 1 MarginCall · 2 PartialLiquidation · 3 CloseOut.
  "function getAccountHealth(address account) view returns (int256 equity, uint256 imReq, uint256 mmReq, uint256 cmReq)",
  "function getMarginStatus(address account) view returns (uint8)",
  // Non-reverting equity. `getAccountEquity` propagates an oracle revert, which is
  // exactly when a health sweep most needs an answer; this reports it instead.
  "function tryGetAccountEquity(address account) view returns (bool ok, int256 equity)",
  // Collateral BACKING the account: max(0, unlocked + locked). Deliberately unlike
  // equity — one storage pair, no market walk, no oracle, cannot revert.
  "function getCollateralBasis(address account) view returns (uint256)",
  "function getInsuranceFundAddress() view returns (address)",
  // Whether the fund will absorb this pool's bad debt, and which tier it sits in.
  // `getPoolTier` is itself gated on registration, so a 0 means "uncovered OR not
  // registered" — pair it with isPerpPoolRegistered before reading anything into it.
  "function isInsuranceFundCoverageEnabled(address perpPool) view returns (bool)",
  "function getPoolTier(address perpPool) view returns (uint256)",
  // The two initial-margin probes. They differ ONLY in whether the increasing leg's
  // base IM is treated as already reserved, and that one flag decides which a client
  // can actually use:
  //
  //   quoteMeetsIMForOrder  baseImReserved = TRUE. Mirrors the placement-time check,
  //                         which runs AFTER lockCollateral has reserved the order's
  //                         base IM and depressed equity. Called cold by a client —
  //                         before any lock — the order's own margin is counted
  //                         nowhere, so it collapses to "does equity cover EXISTING
  //                         positions" and answers true for almost any size. Correct
  //                         only for a caller that has ALREADY taken the lock; wrong
  //                         as a pre-trade gate. (Its sole on-chain callers are the
  //                         sim market maker and sim taker — no production contract
  //                         uses it, so there is no live precedent to copy.)
  //   meetsIMForFill        baseImReserved = FALSE, so the increasing leg's base IM
  //                         IS charged against free equity — which is the pre-trade
  //                         situation, where nothing has been locked yet.
  //
  // Neither models the lock's adverse mark-to-entry reserve; `previewPerpOrderMargin`
  // does. Both are permissionless views gated only on `isPerpPool`.
  "function quoteMeetsIMForOrder(address account, address perpPool, uint256 additionalSize, uint256 orderPrice) view returns (bool)",
  "function meetsIMForFill(address account, address perpPool, uint256 additionalSize, uint256 orderPrice) view returns (bool)",
  // What auto-pull (T70) would take from the owner's WALLET for one order.
  // `PerpPool._onOrderPlaced` calls this before `lockCollateral` and deposits the
  // answer, so placing and funding are one transaction instead of approve+deposit
  // then placeOrder. It owns every decision about the amount — the pool holds no
  // sizing logic of its own — which is why it declines rather than reverts in three
  // cases, all of which return a bare 0:
  //
  //   increasingQuantity == 0   a purely reducing order locks nothing and needs
  //                             nothing; closing must never debit a wallet.
  //   unlocked < 0              never pull into a debt. A shortfall measured against
  //                             a negative balance includes the debt itself, so
  //                             pulling it would cure pre-existing bad debt as a side
  //                             effect of placing an order.
  //   voucher-blocked           the voucher rules forbid this increase outright, so
  //                             the placement reverts whatever the collateral says.
  //
  // A `0` therefore means "no pull", NOT "nothing needed" — read it beside the
  // account's unlocked balance, not on its own. `previewPerpOrderMargin` does that
  // for you; this is the contract's own opinion, useful as a cross-check.
  //
  // Reverts InvalidPerpPool for an unregistered market. `feeHeadroom` is the
  // worst-case fee reserve the POOL computes (`PerpPool._feeHeadroom`) — the larger
  // of the taker and floored-maker rates plus the order's builder fee, ceil-rounded
  // on the FULL order notional — not a number the bank derives, so a caller quoting
  // this directly has to supply the same one the pool would.
  "function quoteOrderTopUp(address account, address perpPool, uint256 lockAmount, uint256 feeHeadroom, uint256 increasingQuantity, uint256 orderPrice) view returns (uint256 topUp)",
  // Isolated-margin confinement. An isolated account may hold a footprint in exactly
  // one market, and `PerpPool._onOrderPlaced` rejects `IsolatedMarketBlocked` for ANY
  // order in a different one — increasing and reducing alike, unlike every other
  // placement gate. Closing the one market it is active in stays allowed, so this is
  // a market-selection constraint rather than a margin one.
  //
  // Answers true for a non-isolated account, so it is safe to read unconditionally;
  // `isolated` distinguishes "allowed because unconfined" from "allowed because this
  // is the one market", which is what a UI needs to explain the block.
  "function isolationAllowsMarket(address account, address market) view returns (bool)",
  "function isolated(address account) view returns (bool)",
  // The account's per-market leverage cap (0 = unset) and the protocol-wide ceiling
  // that clamps it. A cap STRICTER than the market's effective IMF adds margin on top
  // of the base requirement — the only way the order itself moves the placement gate.
  "function getMaxLeverage(address account, address perpPool) view returns (uint16)",
  "function getMaxLeverageLimit() view returns (uint16)",
  // Credit-voucher state. While an account carries a non-withdrawable credit floor,
  // `_meetsIM` confines position-INCREASING orders to a curated allowlist and forces
  // leverage to `voucherLeverageCap` whenever the user's own setting is unset or
  // looser. That is not a separate reject path bolted on beside the margin check — the
  // cap is fed into the SAME leverage->IM computation, so it raises the requirement.
  // A preview that ignored it would under-quote a voucher account's margin and call an
  // order affordable that placement rejects.
  "function getCreditFloor(address account) view returns (uint256)",
  "function getVoucherLeverageCap() view returns (uint16)",
  "function isVoucherMarketAllowed(address perpPool) view returns (bool)",
  // The ACTIVATION gate, independent of the factory's restriction gate. Coming from
  // the factory only proves a pool is authentic; `addPerpPool` is what makes it
  // usable, and `removePerpPool` revokes it. An unregistered pool rejects every
  // settlement callback (OnlyPerpPool) and every quote view (InvalidPerpPool) while
  // still reading as an ordinary market from the factory.
  //
  // `getPoolTier` is NOT a substitute: it is itself gated on registration, so it
  // returns 0 for an uncovered-but-registered market and an unregistered one alike.
  "function isPerpPoolRegistered(address perpPool) view returns (bool)",
  // Liquidation-keeper enumeration: the bank keeps a per-(pool, side) holder array,
  // which is what lets a keeper find every open position from head state alone — no
  // off-chain indexer. This is the bounded slice view: revert-free by construction
  // (a `start` past the end or `count` of 0 returns empty; `count` is clamped to
  // what exists, so `start + count` cannot overflow). `getPerpSideHolders` walks it
  // page by page at ONE pinned block.
  "function getSideHoldersPaginated(address pool, bool isLong, uint256 start, uint256 count) view returns (address[] holders)",
  // The bank's OWN price at which an account's position in one pool exhausts its
  // allocated equity — the number a liquidation keeper prices a bankrupt position
  // against. NOT the SDK's client-side `getLiquidationPrice` estimate.
  "function getBankruptcyPrice(address account, address perpPool) view returns (uint256 price)",
  // `getBankruptcyPrice`'s two reverts: flat-in-that-pool, and the sole-dust
  // degenerate state (total mark notional zero). Neither decodes by NAME at the
  // read boundary today — the generated contract-error table compiles only the DEX
  // contracts `smart-contracts/src` references, and MarginBank lives in the
  // submodule under `lib/`. Declared here as the single source their selectors and
  // tests derive from (the `IncorrectOrder()` pattern above); `getBankruptcyPrice`
  // names them at the call site.
  "error NoOpenPosition()",
  "error AdlZeroNotional()",
]);

// IInsuranceFund reads — the tiered backstop that absorbs bad debt when a
// liquidation cannot be covered by the account's own collateral.
export const insuranceFundReadAbi = parseAbi([
  "function getMaxTiers() view returns (uint256)",
  "function getTotalTierBalances() view returns (uint256)",
  "function getTierBalance(uint256 tier) view returns (uint256)",
  "function getPoolCountForTier(uint256 tier) view returns (uint256)",
  "function getTierForPool(address pool) view returns (uint256)",
]);

// ILiquidationEngine reads — the CONFIGURED bounds of the liquidation path, not its
// history (that is indexed as LiquidationEvent). `isLiquidatable` is the live probe.
export const liquidationEngineReadAbi = parseAbi([
  "function isLiquidatable(address account) view returns (bool)",
  "function getMarginBank() view returns (address)",
  "function getBidderCount() view returns (uint256)",
  "function getBidders() view returns (address[])",
  "function getLiquidationPenaltyBps() view returns (uint256)",
  "function getMinLiquidationSpreadBps() view returns (uint256)",
  "function getMaxLiquidationSpreadBps() view returns (uint256)",
  "function getMaxLiquidationVolumePerBlock() view returns (uint256)",
  "function getLiquidationVolumeForBlock(uint256 blockNumber) view returns (uint256)",
]);

// IERC20Vault reads — the internal token-balance vault BinaryPool/SpotPool
// extend. `getWithdrawableBalance` is the LIVE claimable amount a payout
// fallback (PayoutFallbackToVault) credited; withdraw pulls it to the wallet.
export const erc20VaultReadAbi = parseAbi([
  "function getWithdrawableBalance(address owner, address token) view returns (uint256)",
]);
