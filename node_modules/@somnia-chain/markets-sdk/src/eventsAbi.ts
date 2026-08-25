// Event ABI subsets the local materializer decodes from chain logs. Mirrors the
// events the Envio indexer consumes (indexer/config.yaml) — these signatures are
// the source of truth for client-side log decoding via viem.
//
// EVENTS ONLY — the file is named for what it holds. (It was `abi.ts` and also
// carried the CollateralRouter WRITE abi, the one ABI module whose name said
// nothing about its contents; that write surface now lives with the other write
// ABIs in tradeAbi.ts, next to its only consumer.)
//
// SpotPool and BinaryPool both extend the somnia-dex OrderBook base and emit
// byte-identical order events, so ONE ABI decodes both books. Fills emit as
// `OrderFilled(takerOrderId, makerOrderId, quantityFilled, takerRemaining,
// makerRemaining, fillPrice)`. The taker side is unknown when OrderFilled fires
// (the taker's OrderPlaced lands later in the same tx); the reducer resolves
// the maker side via the in-memory store and defers taker classification.

/** Order lifecycle events shared by SpotPool + BinaryPool (the OrderBook base). */
export const orderBookEventsAbi = [
  {
    type: "event",
    name: "OrderPlaced",
    inputs: [
      { name: "orderId", type: "uint128", indexed: true },
      {
        name: "placedOrder",
        type: "tuple",
        indexed: false,
        components: [
          { name: "orderId", type: "uint128" },
          { name: "isBid", type: "bool" },
          { name: "owner", type: "address" },
          { name: "userData", type: "uint64" },
          { name: "price", type: "uint256" },
          { name: "fullQuantity", type: "uint256" },
          { name: "quantityRemaining", type: "uint256" },
          { name: "expireTimestampNs", type: "uint64" },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderRested",
    inputs: [{ name: "orderId", type: "uint128", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderCancelled",
    inputs: [{ name: "orderId", type: "uint128", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderExpired",
    inputs: [{ name: "orderId", type: "uint128", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderReduced",
    inputs: [
      { name: "orderId", type: "uint128", indexed: true },
      { name: "newQuantity", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderFilled",
    inputs: [
      { name: "takerOrderId", type: "uint128", indexed: true },
      { name: "makerOrderId", type: "uint128", indexed: true },
      { name: "quantityFilled", type: "uint256", indexed: false },
      { name: "takerRemainingQuantity", type: "uint256", indexed: false },
      { name: "makerRemainingQuantity", type: "uint256", indexed: false },
      { name: "fillPrice", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  // Protocol-initiated maker removals in the base matching loop (same-owner
  // self-match with CancelMaker / the perps exceeds-position guard). Emitted by
  // newer OrderBook deployments (perp pools today); terminal like OrderCancelled.
  {
    type: "event",
    name: "OrderCancelledSelfMatch",
    inputs: [{ name: "orderId", type: "uint128", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "MakerOrderCancelledExceedsPosition",
    inputs: [{ name: "orderId", type: "uint128", indexed: true }],
    anonymous: false,
  },
] as const;


/** SpotPool-only events the live tail materializes (mark price + book params). */
export const spotPoolEventsAbi = [
  {
    type: "event",
    name: "MarkPriceUpdated",
    inputs: [
      { name: "asset", type: "address", indexed: true },
      { name: "markPrice", type: "uint256", indexed: false },
      { name: "rawMidpoint", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderBookParametersUpdated",
    inputs: [
      {
        name: "newParameters",
        type: "tuple",
        indexed: false,
        components: [
          { name: "tickSize", type: "uint256" },
          { name: "minQuantity", type: "uint256" },
          { name: "lotSize", type: "uint256" },
        ],
      },
    ],
    anonymous: false,
  },
] as const;

/**
 *  PerpPool-only events the live tail materializes (funding + open interest).
 *  Signatures verified against the DEPLOYED implementation's runtime bytecode, not
 *  against a source tree — the claim they previously carried ("mirror IPerpPool exactly,
 *  deployed testnet implementation") was false for both events here, and being false in a
 *  comment is how it survived: a wrong arity is a different topic0, so `watchEvent`
 *  filtered on something no pool ever emitted and the live funding tail silently never
 *  fired. `mise run verify:abis` in the indexer package is what now checks this class of
 *  claim mechanically.
 */
export const perpPoolEventsAbi = [
  {
    type: "event",
    // 5-arg. The 3-arg form declared here previously was never emitted by any deployed
    // pool, so `watchEvent` filtered on a topic0 that never appeared and the live
    // funding tail silently never fired.
    name: "FundingUpdated",
    inputs: [
      { name: "fundingRate", type: "int256", indexed: false },
      { name: "cumulativeFundingPerUnit", type: "int256", indexed: false },
      { name: "indexPrice", type: "uint256", indexed: false },
      // UNCLAMPED interval span; accrual is capped at n = window / interval.
      { name: "intervalsSettled", type: "uint64", indexed: false },
      // 0 is a SENTINEL for a stale/reverting mark feed, not a price.
      { name: "markPrice", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OpenInterestUpdated",
    // ONE total, not a (long, short) pair — the contract keeps a single counter because
    // the short side is provably equal in a matched CLOB. The two-arg form declared here
    // previously was a different topic0, so this subscription never matched either.
    inputs: [{ name: "openInterest", type: "uint256", indexed: false }],
    anonymous: false,
  },
] as const;

/**
 *  MarketCreator factory event (13 fields) — live discovery of new binary
 *  markets created through the rolling-series creator, so the tail's watch set
 *  grows without re-touching the indexer.
 */
export const marketCreatorEventsAbi = [
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "market", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "yesId", type: "uint256", indexed: false },
      { name: "noId", type: "uint256", indexed: false },
      { name: "collateral", type: "address", indexed: false },
      { name: "asset", type: "string", indexed: false },
      { name: "strike", type: "uint256", indexed: false },
      { name: "tradingStart", type: "uint64", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
      { name: "oracleQuestionId", type: "uint256", indexed: false },
      { name: "question", type: "string", indexed: false },
      { name: "intervalSec", type: "uint64", indexed: false },
    ],
    anonymous: false,
  },
] as const;

/**
 *  BinaryMarketsModule creation event (19 fields, different topic0 from the
 *  MarketCreator's) — EVERY market fires this (the module emits inside
 *  `createMarket`, whether called directly or via a wrapping MarketCreator), and
 *  it is the only creation event carrying the (operatorId, venueId) origin
 *  attribution. Watched alongside the MarketCreator in discovery mode so
 *  module-created markets join `watchAllMarkets(discover: true)` live.
 *  Signature mirrors smart-contracts BinaryMarketsModule exactly.
 */
export const binaryModuleEventsAbi = [
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "market", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "oracleQuestionId", type: "uint256", indexed: false },
      { name: "operatorId", type: "uint32", indexed: false },
      { name: "venueId", type: "bytes32", indexed: false },
      { name: "creator", type: "address", indexed: false },
      { name: "collateral", type: "address", indexed: false },
      { name: "yesId", type: "uint256", indexed: false },
      { name: "noId", type: "uint256", indexed: false },
      // Settlement-extraction v2: the pool's market nonce (1 fresh, ++ on recycle)
      // — part of the outcome-id encoding + the pool→market binding key.
      { name: "nonce", type: "uint64", indexed: false },
      { name: "outcomeSlotCount", type: "uint8", indexed: false },
      { name: "marketType", type: "uint8", indexed: false },
      { name: "tradingStart", type: "uint64", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
      { name: "voidPolicy", type: "uint8", indexed: false },
      { name: "asset", type: "string", indexed: false },
      { name: "strike", type: "uint256", indexed: false },
      { name: "question", type: "string", indexed: false },
      { name: "context", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  // Settlement-extraction v2 module lifecycle. `MarketFinalized` fires when a
  // market's backing + resolution snapshot are swept to the settlement singleton
  // (the redemption home). `PoolReleased` fires when the finalized, drained pool
  // is returned to its creator's free list — it CLOSES the pool→market binding
  // (the pool may next be recycled onto a different market). Both carry the pool
  // so the tail can flip the binding. Signatures mirror BinaryMarketsModule.
  {
    type: "event",
    name: "MarketFinalized",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "marketKey", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PoolReleased",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;

// Fee-event decoding (MarketFeeConfig / ProtocolFeeCharged / BuilderFeeCharged) is
// intentionally NOT done in the SDK: the per-market fee config and realized fee
// aggregates are served by the indexer (operatorAdmin.ts → MarketVenue). The settlement
// fee (`SettlementFeeCharged`) also stays indexer-only in v2 — it is now skimmed
// ONCE at finalize on the settlement singleton (not per-redeem on the pool), so it
// no longer moves the pool's live `setBacking`; the tail zeroes pool backing on
// `PoolFinalized` instead (see below). See indexer/src/handlers/binary.ts for the
// canonical fee stream (BuilderFeeRecord / ProtocolFeeRecord / SettlementFeeRecord).

/**
 *  BinaryPool v2 side-attribution + lifecycle events (settlement-extraction).
 *  `BinaryOrderPlaced(orderId, kind)` fires alongside every `OrderPlaced` on a
 *  binary pool — the ONLY authoritative side source (v2 stopped encoding the side
 *  in userData). `PoolFinalized` sweeps the pool's backing to settlement (→ pool
 *  backing 0). `PoolRecycled` re-points the pool at a fresh market (new nonce).
 *  Signatures mirror IBinaryPool exactly.
 */
export const binaryPoolEventsAbi = [
  {
    type: "event",
    name: "BinaryOrderPlaced",
    inputs: [
      { name: "orderId", type: "uint128", indexed: true },
      // OrderKind enum: 0 BUY_YES · 1 SELL_YES · 2 BUY_NO · 3 SELL_NO.
      { name: "kind", type: "uint8", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PoolFinalized",
    inputs: [
      { name: "marketNonce", type: "uint64", indexed: true },
      { name: "backing", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PoolRecycled",
    inputs: [
      { name: "marketNonce", type: "uint64", indexed: true },
      { name: "market", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;

/**
 *  BinarySettlement singleton events (settlement-extraction v2) — the permanent
 *  redemption home. `MarketFinalized` records a market's net backing;
 *  `SettlementFeeCharged` the one-time fee skim; `Redeemed` a payout (debits the
 *  settlement record's backing — NOTE the v2 signature carries `marketKey` +
 *  separate `holder`/`to`, unlike the removed v1 pool `Redeemed`); `PayoutOwed`
 *  the push-fallback booking; `OwedClaimed` the later claim. Signatures mirror
 *  IBinarySettlement exactly.
 */
export const binarySettlementEventsAbi = [
  {
    type: "event",
    name: "MarketFinalized",
    inputs: [
      { name: "marketKey", type: "uint256", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "nonce", type: "uint64", indexed: false },
      { name: "collateralToken", type: "address", indexed: false },
      { name: "netBacking", type: "uint256", indexed: false },
      { name: "voided", type: "bool", indexed: false },
      { name: "winningOutcome", type: "uint8", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SettlementFeeCharged",
    inputs: [
      { name: "marketKey", type: "uint256", indexed: true },
      { name: "feeRecipient", type: "address", indexed: true },
      { name: "grossBacking", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Redeemed",
    inputs: [
      { name: "marketKey", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "outcomeIdx", type: "uint8", indexed: false },
      { name: "amountBurned", type: "uint256", indexed: false },
      { name: "collateralOut", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PayoutOwed",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwedClaimed",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

/**
 *  BinaryMarket lifecycle events + BinaryPool `backing` events — keep live
 *  status/resolution AND collateral backing current so the tail (not the lagging
 *  indexer) is the authority on trading eligibility and on how much collateral
 *  a market holds. `SetMinted`/`SetBurned`/`Redeemed`/`SettlementFeeCharged`
 *  fire from the BinaryPool (log source = the pool) and drive the same `backing`
 *  running total the Envio indexer maintains (indexer/src/handlers/binary.ts).
 *  Signatures mirror somnia-dex-protocol IBinaryPool exactly.
 */
export const binaryMarketEventsAbi = [
  {
    type: "event",
    name: "StatusChanged",
    inputs: [
      { name: "oldStatus", type: "uint8", indexed: true },
      { name: "newStatus", type: "uint8", indexed: true },
    ],
    anonymous: false,
  },
  {
    // Settlement v3: BinaryMarket emits the payout VECTOR + denominator, not a single
    // indexed winner. The live-tail reducer derives winningOutcome as argmax(vector).
    type: "event",
    name: "Resolved",
    inputs: [
      { name: "payoutDenominator", type: "uint32", indexed: false },
      { name: "payoutNumerators", type: "uint256[]", indexed: false },
    ],
    anonymous: false,
  },
  { type: "event", name: "Voided", inputs: [], anonymous: false },
  // BinaryPool: a YES+NO pair minted from collateral → backing += amount.
  {
    type: "event",
    name: "SetMinted",
    inputs: [
      { name: "payer", type: "address", indexed: true },
      { name: "yesTo", type: "address", indexed: true },
      { name: "noTo", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  // BinaryPool: a YES+NO pair burned back to collateral → backing -= amount (floor 0).
  {
    type: "event",
    name: "SetBurned",
    inputs: [
      { name: "holder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  // v2: the pool no longer emits `Redeemed` / `SettlementFeeCharged` — redemption
  // + the fee skim moved to the BinarySettlement singleton (see
  // `binarySettlementEventsAbi`). The pool's live backing is instead zeroed by
  // `PoolFinalized` (in `binaryPoolEventsAbi`) when the market finalizes.
] as const;

/**
 *  Everything the live tail decodes, in one ABI. Event names are disjoint
 *  except `MarketCreated` (MarketCreator 13-field vs BinaryMarketsModule
 *  19-field) — those have distinct topic0 hashes, so viem's `decodeEventLog`
 *  resolves the right variant per log.
 */
export const liveEventsAbi = [
  ...orderBookEventsAbi,
  ...spotPoolEventsAbi,
  ...perpPoolEventsAbi,
  ...marketCreatorEventsAbi,
  ...binaryModuleEventsAbi,
  ...binaryMarketEventsAbi,
  ...binaryPoolEventsAbi,
  ...binarySettlementEventsAbi,
] as const;
