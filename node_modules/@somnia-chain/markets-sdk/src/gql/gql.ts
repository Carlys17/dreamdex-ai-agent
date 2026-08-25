/* eslint-disable */
import * as types from './graphql.js';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment PortfolioMarketFields on Market {\n    id\n    marketAddress\n    poolAddress\n    asset\n    question\n    status: clobStatus\n    lastPrice\n    strike\n    expiry\n    winningOutcome\n    voided\n    quoteDecimals\n    intervalSec\n  }\n": typeof types.PortfolioMarketFieldsFragmentDoc,
    "\n  query Portfolio($acct: String!, $fillWhere: Fill_bool_exp!, $ordersLimit: Int, $tradesLimit: Int) {\n    OutcomeBalance(\n      where: { account: { _eq: $acct }, balance: { _gt: \"0\" } }\n      order_by: { balance: desc }\n      limit: 200\n    ) {\n      outcomeIndex\n      tokenId\n      balance\n      market {\n        ...PortfolioMarketFields\n      }\n    }\n    ClobOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"BINARY\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      side\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...PortfolioMarketFields\n      }\n    }\n    ClobFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      timestamp\n      txHash\n      maker\n      makerSide\n      takerOrder {\n        owner\n        side\n      }\n      market {\n        marketAddress\n        asset\n        quoteDecimals\n      }\n    }\n  }\n": typeof types.PortfolioDocument,
    "\n  query OutcomeBalances($acct: String!, $mkt: String!) {\n        OutcomeBalance(where: {account: {_eq: $acct}, market: {marketAddress: {_eq: $mkt}}}) { outcomeIndex balance }\n      }\n": typeof types.OutcomeBalancesDocument,
    "\n  query VaultPayoutFallbacks($where: VaultPayoutFallback_bool_exp!, $limit: Int, $offset: Int) {\n         VaultPayoutFallback(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id owner token amount market: market_id timestamp txHash\n         }\n       }\n": typeof types.VaultPayoutFallbacksDocument,
    "\n  query MarketResolution($id: String!) {\n         MarketResolutionEvent(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {\n           id market: market_id kind winningOutcome: outcomeIdx payoutNumerators payoutDenominator voided blockNumber timestamp txHash\n         }\n         MarketReferenceLink(where: {market_id: {_eq: $id}}, limit: 1) {\n           id market: market_id oracleQuestionId: referenceQuestionId pending\n         }\n         Market_by_pk(id: $id) { oracleQuestionId }\n       }\n": typeof types.MarketResolutionDocument,
    "\n  query OracleAnswers($closingQid: String!, $openingQid: String!) {\n         closing: OracleAnswer_by_pk(id: $closingQid) { oracleQuestionId numericValue outcomeLabel voidReason resolvedAt txHash }\n         opening: OracleAnswer_by_pk(id: $openingQid) { oracleQuestionId numericValue outcomeLabel voidReason resolvedAt txHash }\n       }\n": typeof types.OracleAnswersDocument,
    "\n  query Candles($where: Candle_bool_exp!, $limit: Int) {\n        Candle(where: $where, order_by: {bucketStart: desc}, limit: $limit) {\n          bucketStart openPrice high low closePrice baseVolume quoteVolume tradeCount\n        }\n      }\n": typeof types.CandlesDocument,
    "\n  fragment ProtocolFeeFields on ProtocolFeeRecord {\n    id\n    orderId\n    recipient\n    payer\n    token\n    amount\n    isTakerSide\n    market: market_id\n    pool\n    timestamp\n    txHash\n  }\n": typeof types.ProtocolFeeFieldsFragmentDoc,
    "\n  fragment BuilderFeeFields on BuilderFeeRecord {\n    id\n    orderId\n    builder\n    payer\n    token\n    amount\n    market: market_id\n    pool\n    timestamp\n    txHash\n  }\n": typeof types.BuilderFeeFieldsFragmentDoc,
    "\n  fragment SettlementFeeFields on SettlementFeeRecord {\n    id\n    recipient: feeRecipient\n    amount: fee\n    winningBacking\n    market: market_id\n    timestamp\n    txHash\n  }\n": typeof types.SettlementFeeFieldsFragmentDoc,
    "\n  query BuilderApprovals($where: BuilderApproval_bool_exp!, $limit: Int, $offset: Int) {\n         BuilderApproval(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id market_id market { poolAddress } user builder maxFeeBpsTimes1k blockNumber timestamp txHash\n         }\n       }\n": typeof types.BuilderApprovalsDocument,
    "\n  query ProtocolFees($where: ProtocolFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         ProtocolFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...ProtocolFeeFields }\n       }\n": typeof types.ProtocolFeesDocument,
    "\n  query BuilderFees($where: BuilderFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         BuilderFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...BuilderFeeFields }\n       }\n": typeof types.BuilderFeesDocument,
    "\n  query SettlementFees($where: SettlementFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         SettlementFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...SettlementFeeFields }\n       }\n": typeof types.SettlementFeesDocument,
    "\n  fragment FillQueryFields on Fill {\n    id\n    market: market_id\n    pool\n    fillPrice\n    quantity\n    quoteQuantity\n    maker\n    makerSide\n    taker\n    takerSide\n    kind\n    takerIsBid\n    timestamp\n    txHash\n    # The taker's ORDER, not just the denormalized copy on the fill. On binary\n    # the fill's takerSide is backfilled by the PendingTakerFill bridge only\n    # once BinaryOrderPlaced lands, so it can still be null on a row whose\n    # taker is already stamped. The Order carries the authoritative side from\n    # the moment it exists, which is what the portfolio reads have always used.\n    takerOrder { owner side }\n  }\n": typeof types.FillQueryFieldsFragmentDoc,
    "\n  query Fills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {\n        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {\n          ...FillQueryFields\n        }\n      }\n": typeof types.FillsDocument,
    "\n  query UserFills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {\n        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {\n          ...FillQueryFields\n        }\n      }\n": typeof types.UserFillsDocument,
    "\n  fragment SeriesFields on Series {\n    id\n    creatorAddress\n    seriesId\n    collateral\n    asset\n    intervalSec\n    createdAtTimestamp\n    updatedAtTimestamp\n  }\n": typeof types.SeriesFieldsFragmentDoc,
    "\n  fragment MarketCreatorFields on MarketCreator {\n    id\n    owner\n    policy\n    core\n    adapter\n    operatorId\n    venueId\n    factory\n    createdAtBlock\n    createdAtTimestamp\n  }\n": typeof types.MarketCreatorFieldsFragmentDoc,
    "\n  fragment OracleAdapterFields on OracleAdapter {\n    id\n    owner\n    factory\n    approved\n    approvedAtTimestamp\n    createdAtTimestamp\n  }\n": typeof types.OracleAdapterFieldsFragmentDoc,
    "\n  query MarketCreators($where: MarketCreator_bool_exp!, $limit: Int, $offset: Int) {\n         MarketCreator(where: $where, order_by: {createdAtBlock: desc}, limit: $limit, offset: $offset) {\n           ...MarketCreatorFields\n           series(order_by: {seriesId: asc}) { ...SeriesFields }\n         }\n       }\n": typeof types.MarketCreatorsDocument,
    "\n  query MarketCreatorByPk($id: String!) {\n         MarketCreator_by_pk(id: $id) {\n           ...MarketCreatorFields\n           series(order_by: {seriesId: asc}) { ...SeriesFields }\n         }\n       }\n": typeof types.MarketCreatorByPkDocument,
    "\n  query OracleAdapters($where: OracleAdapter_bool_exp!, $limit: Int, $offset: Int) {\n         OracleAdapter(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleAdapterFields }\n       }\n": typeof types.OracleAdaptersDocument,
    "\n  query OracleAdapterByPk($id: String!) { OracleAdapter_by_pk(id: $id) { ...OracleAdapterFields } }\n": typeof types.OracleAdapterByPkDocument,
    "\n  query SeriesList($where: Series_bool_exp!, $limit: Int, $offset: Int) {\n         Series(where: $where, order_by: {createdAtTimestamp: asc}, limit: $limit, offset: $offset) { ...SeriesFields }\n       }\n": typeof types.SeriesListDocument,
    "\n  fragment MarketFields on Market {\n    id\n    marketType\n    poolAddress\n    lastPrice\n    lastTradeAt\n    cumulativeBaseVolume\n    cumulativeQuoteVolume\n    tradeCount\n    baseDecimals\n    quoteDecimals\n    createdAtTimestamp\n    baseToken\n    quoteToken\n    baseSymbol\n    quoteSymbol\n    baseIsNative\n    tickSize\n    lotSize\n    minQuantity\n    markPrice\n    rawMidpoint\n    markPriceUpdatedAt\n    stopRegistry\n    marginBank\n    initialMarginBps\n    fundingRate\n    cumulativeFundingPerUnit\n    indexPrice\n    fundingUpdatedAt\n    fundingWindowSec\n    fundingIntervalSec\n    openInterest\n    openInterestUpdatedAt\n    marketId\n    marketAddress\n    yesTokenId\n    noTokenId\n    collateral\n    asset\n    question\n    oracleQuestion\n    oracleQuestionId\n    status: clobStatus\n    strike\n    tradingStart\n    expiry\n    winningOutcome\n    payoutNumerators\n    payoutDenominator\n    resolvedAtBlock\n    resolvedAtTimestamp\n    createdByTx\n    creator\n    voided\n    backing\n    nonce\n    finalized\n    netBacking\n    context\n    intervalSec\n    operatorId\n    venueId\n  }\n": typeof types.MarketFieldsFragmentDoc,
    "\n  query RegistryMarkets($where: Market_bool_exp!, $limit: Int, $offset: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": typeof types.RegistryMarketsDocument,
    "\n  query Markets($where: Market_bool_exp!, $limit: Int, $offset: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": typeof types.MarketsDocument,
    "\n  query MarketByPk($id: String!) {\n    Market_by_pk(id: $id) {\n      ...MarketFields\n    }\n  }\n": typeof types.MarketByPkDocument,
    "\n  query MarketByAddress($a: String!) {\n    Market(\n      where: { marketAddress: { _eq: $a } }\n      order_by: { createdAtTimestamp: desc }\n      limit: 1\n    ) {\n      ...MarketFields\n    }\n  }\n": typeof types.MarketByAddressDocument,
    "\n  query BinaryMarkets($where: Market_bool_exp!, $orderBy: [Market_order_by!], $limit: Int) {\n    Market(where: $where, order_by: $orderBy, limit: $limit) {\n      ...MarketFields\n    }\n  }\n": typeof types.BinaryMarketsDocument,
    "\n  query SpotMarkets($where: Market_bool_exp!, $limit: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {\n      ...MarketFields\n    }\n  }\n": typeof types.SpotMarketsDocument,
    "\n  query PerpMarkets($where: Market_bool_exp!, $limit: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {\n      ...MarketFields\n    }\n  }\n": typeof types.PerpMarketsDocument,
    "\n  query LiveBinaryMarkets(\n    $where: Market_bool_exp!\n    $orderBy: [Market_order_by!]\n    $limit: Int!\n    $offset: Int!\n  ) {\n    Market(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": typeof types.LiveBinaryMarketsDocument,
    "\n  query PastBinaryMarkets($where: Market_bool_exp!, $limit: Int!, $offset: Int!) {\n    Market(where: $where, order_by: { expiry: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": typeof types.PastBinaryMarketsDocument,
    "\n  query BinaryOriginPairs {\n         Market(\n           distinct_on: [operatorId, venueId],\n           where: {marketType: {_eq: \"BINARY\"}, operatorId: {_is_null: false}, venueId: {_is_null: false}},\n           order_by: [{operatorId: asc}, {venueId: asc}]\n         ) {\n           operatorId\n           venueId\n         }\n       }\n": typeof types.BinaryOriginPairsDocument,
    "\n  query BinaryAssets {\n         Market(distinct_on: asset, where: {marketType: {_eq: \"BINARY\"}, asset: {_is_null: false}}, order_by: {asset: asc}) {\n           asset\n         }\n       }\n": typeof types.BinaryAssetsDocument,
    "\n  query MarketFees($id: String!) {\n         MarketVenue_by_pk(id: $id) {\n           operatorId venueId feeRecipient\n           makerFeeBps takerFeeBps maxBuilderFeeBps routingFeeBps settlementFeeBps settlementFeesCollected\n         }\n       }\n": typeof types.MarketFeesDocument,
    "\n  query MarketStatusHistory($id: String!) {\n         MarketStatusUpdate(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {\n           oldStatus newStatus blockNumber timestamp txHash\n         }\n       }\n": typeof types.MarketStatusHistoryDocument,
    "\n  query OpeningAnswers($qids: [String!]) {\n         OracleAnswer(where: {id: {_in: $qids}}) { id numericValue }\n       }\n": typeof types.OpeningAnswersDocument,
    "\n  query OpeningRefs($ids: [String!]) {\n         MarketReferenceLink(where: {market_id: {_in: $ids}}) { market: market_id referenceQuestionId }\n       }\n": typeof types.OpeningRefsDocument,
    "\n  fragment OperatorFields on Operator {\n    operatorId\n    owner\n    feeRecipient\n    enabled\n    policy\n    context\n    pendingOwner\n    venueCount\n    createdAtTimestamp\n    updatedAtTimestamp\n    marketCount\n    cumulativeQuoteVolume\n    protocolFeesCollected\n    settlementFeesCollected\n    builderFeesCollected\n  }\n": typeof types.OperatorFieldsFragmentDoc,
    "\n  fragment VenueFields on Venue {\n    venueId\n    operatorId\n    marketType\n    feeParams\n    feeRecipientOverride\n    policy\n    signer\n    creationEnabled\n    context\n    createdAtTimestamp\n    updatedAtTimestamp\n    marketCount\n    cumulativeQuoteVolume\n    protocolFeesCollected\n    settlementFeesCollected\n    builderFeesCollected\n  }\n": typeof types.VenueFieldsFragmentDoc,
    "\n  query Operators($where: Operator_bool_exp!, $limit: Int, $offset: Int) {\n         Operator(where: $where, order_by: {operatorId: desc}, limit: $limit, offset: $offset) { ...OperatorFields }\n       }\n": typeof types.OperatorsDocument,
    "\n  query OperatorByPk($id: String!) { Operator_by_pk(id: $id) { ...OperatorFields } }\n": typeof types.OperatorByPkDocument,
    "\n  query Venues($where: Venue_bool_exp!, $limit: Int, $offset: Int) {\n         Venue(where: $where, order_by: {createdAtTimestamp: asc}, limit: $limit, offset: $offset) { ...VenueFields }\n       }\n": typeof types.VenuesDocument,
    "\n  query VenueByPk($id: String!) { Venue_by_pk(id: $id) { ...VenueFields } }\n": typeof types.VenueByPkDocument,
    "\n  fragment OracleQuestionFields on OracleQuestion {\n    id\n    questionKey\n    scheduler\n    oracleCost\n    bindCount\n    reuseCount\n    createdAtBlock\n    createdAtTimestamp\n  }\n": typeof types.OracleQuestionFieldsFragmentDoc,
    "\n  fragment OperatorHubAccountFields on OperatorHubAccount {\n    id\n    operatorId\n    earmarked\n    credit\n    outstanding\n    createdAtBlock\n    createdAtTimestamp\n    updatedAtBlock\n    updatedAtTimestamp\n  }\n": typeof types.OperatorHubAccountFieldsFragmentDoc,
    "\n  fragment OracleBindFields on OracleBind {\n    id\n    oracleQuestionId\n    bindIndex\n    operatorId\n    measuredGas\n    overheadShare\n    cost\n    charged\n    subsidy\n    resolvedAt\n    boundAtBlock\n    boundAtTimestamp\n    txHash\n  }\n": typeof types.OracleBindFieldsFragmentDoc,
    "\n  fragment OracleCallbackFields on OracleCallback {\n    id\n    marketsResolved\n    gasPrice\n    measuredGas\n    overheadGasAttributed\n    totalCost\n    totalCharged\n    subsidy\n    pendingRemaining\n    blockNumber\n    timestamp\n    txHash\n  }\n": typeof types.OracleCallbackFieldsFragmentDoc,
    "\n  query OracleQuestion($id: String!) {\n         OracleQuestion_by_pk(id: $id) { ...OracleQuestionFields }\n       }\n": typeof types.OracleQuestionDocument,
    "\n  query OracleQuestions($where: OracleQuestion_bool_exp!, $limit: Int, $offset: Int) {\n         OracleQuestion(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleQuestionFields }\n       }\n": typeof types.OracleQuestionsDocument,
    "\n  query OperatorHubAccount($id: String!) {\n         OperatorHubAccount_by_pk(id: $id) { ...OperatorHubAccountFields }\n       }\n": typeof types.OperatorHubAccountDocument,
    "\n  query OperatorHubAccounts($limit: Int, $offset: Int) {\n         OperatorHubAccount(order_by: {updatedAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OperatorHubAccountFields }\n       }\n": typeof types.OperatorHubAccountsDocument,
    "\n  query OracleBinds($where: OracleBind_bool_exp!, $limit: Int, $offset: Int) {\n         OracleBind(where: $where, order_by: {boundAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleBindFields }\n       }\n": typeof types.OracleBindsDocument,
    "\n  query OracleCallbacks($limit: Int, $offset: Int) {\n         OracleCallback(order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...OracleCallbackFields }\n       }\n": typeof types.OracleCallbacksDocument,
    "\n  fragment OrderMarketFields on Market {\n    marketAddress\n    asset\n    question\n    expiry\n    tradingStart\n    quoteDecimals\n    intervalSec\n  }\n": typeof types.OrderMarketFieldsFragmentDoc,
    "\n  query SweepableOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: [{expireTimestampNs: asc}, {id: asc}], limit: $limit, offset: $offset) {\n          id orderId owner isBid price quantityRemaining expireTimestampNs placedAtTimestamp\n          market: market_id\n          marketRow: market { poolAddress marketType ...OrderMarketFields }\n        }\n      }\n": typeof types.SweepableOrdersDocument,
    "\n  query OpenOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {\n          id orderId side isBid price quantityRemaining\n          market: market_id\n          marketRow: market { poolAddress ...OrderMarketFields }\n        }\n      }\n": typeof types.OpenOrdersDocument,
    "\n  query Orders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {\n          id orderId side isBid price quantityRemaining fullQuantity filledQuantity status\n          rested expireTimestampNs placedTxHash placedAtTimestamp\n          cancelReason amendedFromOrderId amendedToOrderId\n          market: market_id\n          marketRow: market { poolAddress ...OrderMarketFields }\n        }\n      }\n": typeof types.OrdersDocument,
    "\n  query BookTops($bidWhere: Order_bool_exp!, $askWhere: Order_bool_exp!) {\n         bids: Order(where: $bidWhere, distinct_on: market_id, order_by: [{market_id: desc}, {price: desc}]) {\n           market: market_id price\n         }\n         asks: Order(where: $askWhere, distinct_on: market_id, order_by: [{market_id: asc}, {price: asc}]) {\n           market: market_id price\n         }\n       }\n": typeof types.BookTopsDocument,
    "\n  query FundingPayments($where: FundingPayment_bool_exp!, $limit: Int, $offset: Int) {\n         FundingPayment(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool amount timestamp txHash\n         }\n       }\n": typeof types.FundingPaymentsDocument,
    "\n  query MarginEvents($account: String!, $limit: Int, $offset: Int) {\n         MarginEvent(where: {account: {_eq: $account}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account kind pool amount granter timestamp txHash\n         }\n       }\n": typeof types.MarginEventsDocument,
    "\n  query Liquidations($where: LiquidationEvent_bool_exp!, $limit: Int, $offset: Int) {\n         LiquidationEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool kind size price counterparty penalty\n           badDebt insuranceCovered deficit coverageDeclined collateralAmount equity\n           positionsProcessed stageReached marginStatusBefore marginStatusAfter\n           timestamp blockNumber txHash\n         }\n       }\n": typeof types.LiquidationsDocument,
    "\n  query FundingRateHistory($where: FundingRateUpdate_bool_exp!, $orderBy: [FundingRateUpdate_order_by!], $limit: Int, $offset: Int) {\n         FundingRateUpdate(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n           id pool fundingRate cumulativeFundingPerUnit indexPrice markPrice\n           intervalsSettled intervalsAccrued fundingWindowSec fundingIntervalSec\n           spanStart spanEnd anchorResynced timestamp blockNumber txHash\n         }\n       }\n": typeof types.FundingRateHistoryDocument,
    "\n  query FundingRateCandles($where: FundingRateCandle_bool_exp!, $limit: Int, $offset: Int) {\n         FundingRateCandle(where: $where, order_by: {bucketStart: desc}, limit: $limit, offset: $offset) {\n           id pool intervalSeconds bucketStart\n           avgFundingRate8h minFundingRate8h maxFundingRate8h coverage\n           cumulativeFundingStart cumulativeFundingEnd\n           fundingWindowSec fundingIntervalSec paramsChangedInBucket\n           indexPriceEnd openInterestEnd updateCount\n         }\n       }\n": typeof types.FundingRateCandlesDocument,
    "\n  query PerpFees($where: PerpFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         PerpFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool amount isRebate kind insurancePortion tier fillNotional builder timestamp txHash\n         }\n       }\n": typeof types.PerpFeesDocument,
    "\n  query OpenInterestHistory($pool: String!, $limit: Int, $offset: Int) {\n         OpenInterestSnapshot(where: {pool: {_eq: $pool}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id pool openInterest timestamp blockNumber\n         }\n       }\n": typeof types.OpenInterestHistoryDocument,
    "\n  fragment PerpPortfolioMarketFields on Market {\n    poolAddress\n    baseSymbol\n    quoteSymbol\n    baseDecimals\n    quoteDecimals\n    tickSize\n    lotSize\n    minQuantity\n    lastPrice\n    marginBank\n    initialMarginBps\n    fundingRate\n    indexPrice\n    stopRegistry\n  }\n": typeof types.PerpPortfolioMarketFieldsFragmentDoc,
    "\n  query PerpPortfolio(\n    $acct: String!\n    $fillWhere: Fill_bool_exp!\n    $ordersLimit: Int\n    $tradesLimit: Int\n  ) {\n    PerpOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"PERP\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n    PerpFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      quoteQuantity\n      timestamp\n      txHash\n      maker\n      taker\n      takerIsBid\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n  }\n": typeof types.PerpPortfolioDocument,
    "\n  query PerpOrderHistory($where: Order_bool_exp!, $orderBy: [Order_order_by!], $limit: Int, $offset: Int) {\n    Order(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      status\n      rested\n      expireTimestampNs\n      placedAtTimestamp\n      placedTxHash\n      lastUpdatedAtTimestamp\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n  }\n": typeof types.PerpOrderHistoryDocument,
    "\n  query PerpPositions($where: PerpPosition_bool_exp!, $limit: Int, $offset: Int) {\n    PerpPosition(where: $where, order_by: { updatedAt: desc }, limit: $limit, offset: $offset) {\n      id\n      pool\n      account\n      size\n      isLong\n      entryPriceX18\n      realizedPnl\n      updatedAt\n      updatedAtBlock\n    }\n  }\n": typeof types.PerpPositionsDocument,
    "\n  query PerpStopOrders($where: StopOrder_bool_exp!, $limit: Int, $offset: Int) {\n    StopOrder(where: $where, order_by: { createdAt: desc }, limit: $limit, offset: $offset) {\n      id\n      registry\n      orderIdRaw\n      owner\n      isBid\n      quantity\n      triggerPrice\n      triggerOperator\n      orderType\n      builder\n      builderFeeBpsTimes1k\n      status\n      placedOrderId\n      dropReason\n      createdAt\n      updatedAt\n      txHash\n      market {\n        poolAddress\n        baseSymbol\n        quoteSymbol\n        baseDecimals\n        quoteDecimals\n      }\n    }\n  }\n": typeof types.PerpStopOrdersDocument,
    "\n  query MarketByPool($pool: String!) {\n    Market(\n      where: { poolAddress: { _eq: $pool } }\n      order_by: { createdAtTimestamp: desc }\n      limit: 1\n    ) {\n      ...MarketFields\n    }\n  }\n": typeof types.MarketByPoolDocument,
    "\n  query PoolBindings($pool: String!) {\n         PoolBinding(where: {poolAddress: {_eq: $pool}}, order_by: {nonce: desc}) {\n           id poolAddress marketId nonce fromBlock fromLogIndex fromTimestamp\n           toBlock toLogIndex toTimestamp closedBy\n         }\n       }\n": typeof types.PoolBindingsDocument,
    "\n  query PoolByPk($id: String!) {\n         Pool_by_pk(id: $id) {\n           id address collateral creator currentMarketId currentNonce generationCount\n           createdAtTimestamp updatedAtTimestamp\n         }\n       }\n": typeof types.PoolByPkDocument,
    "\n  fragment RouterActionFields on RouterActionRecord {\n    id\n    kind\n    account\n    market: market_id\n    amount\n    payout\n    routedVia\n    timestamp\n    txHash\n  }\n": typeof types.RouterActionFieldsFragmentDoc,
    "\n  query RouterActions($where: RouterActionRecord_bool_exp!, $limit: Int, $offset: Int) {\n         RouterActionRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...RouterActionFields }\n       }\n": typeof types.RouterActionsDocument,
    "\n  fragment SpotPortfolioMarketFields on Market {\n    poolAddress\n    baseSymbol\n    quoteSymbol\n    baseToken\n    quoteToken\n    baseDecimals\n    quoteDecimals\n    baseIsNative\n    tickSize\n    lotSize\n    minQuantity\n    lastPrice\n    markPrice\n    stopRegistry\n  }\n": typeof types.SpotPortfolioMarketFieldsFragmentDoc,
    "\n  query SpotPortfolio(\n    $acct: String!\n    $fillWhere: Fill_bool_exp!\n    $ordersLimit: Int\n    $tradesLimit: Int\n  ) {\n    SpotOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"SPOT\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n    SpotStopOrder: StopOrder(\n      where: { owner: { _eq: $acct }, status: { _eq: \"PENDING\" } }\n      order_by: { createdAt: desc }\n      limit: $ordersLimit\n    ) {\n      ...SpotStopOrderFields\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n    SpotFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      quoteQuantity\n      timestamp\n      txHash\n      maker\n      taker\n      takerIsBid\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n  }\n": typeof types.SpotPortfolioDocument,
    "\n  fragment SpotStopOrderFields on StopOrder {\n    id\n    registry\n    orderId: orderIdRaw\n    isBid\n    quantity\n    triggerPrice\n    triggerOperator\n    orderType\n    status\n    placedOrderId\n    createdAt\n  }\n": typeof types.SpotStopOrderFieldsFragmentDoc,
    "\n  query SpotStopOrders($where: StopOrder_bool_exp!, $limit: Int) {\n    StopOrder(where: $where, order_by: { createdAt: desc }, limit: $limit) {\n      ...SpotStopOrderFields\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n  }\n": typeof types.SpotStopOrdersDocument,
    "\n  query SyncStatus($chainId: Int!) {\n    chain_metadata(where: { chain_id: { _eq: $chainId } }) {\n      chain_id\n      latest_processed_block\n      block_height\n      num_events_processed\n    }\n  }\n": typeof types.SyncStatusDocument,
};
const documents: Documents = {
    "\n  fragment PortfolioMarketFields on Market {\n    id\n    marketAddress\n    poolAddress\n    asset\n    question\n    status: clobStatus\n    lastPrice\n    strike\n    expiry\n    winningOutcome\n    voided\n    quoteDecimals\n    intervalSec\n  }\n": types.PortfolioMarketFieldsFragmentDoc,
    "\n  query Portfolio($acct: String!, $fillWhere: Fill_bool_exp!, $ordersLimit: Int, $tradesLimit: Int) {\n    OutcomeBalance(\n      where: { account: { _eq: $acct }, balance: { _gt: \"0\" } }\n      order_by: { balance: desc }\n      limit: 200\n    ) {\n      outcomeIndex\n      tokenId\n      balance\n      market {\n        ...PortfolioMarketFields\n      }\n    }\n    ClobOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"BINARY\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      side\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...PortfolioMarketFields\n      }\n    }\n    ClobFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      timestamp\n      txHash\n      maker\n      makerSide\n      takerOrder {\n        owner\n        side\n      }\n      market {\n        marketAddress\n        asset\n        quoteDecimals\n      }\n    }\n  }\n": types.PortfolioDocument,
    "\n  query OutcomeBalances($acct: String!, $mkt: String!) {\n        OutcomeBalance(where: {account: {_eq: $acct}, market: {marketAddress: {_eq: $mkt}}}) { outcomeIndex balance }\n      }\n": types.OutcomeBalancesDocument,
    "\n  query VaultPayoutFallbacks($where: VaultPayoutFallback_bool_exp!, $limit: Int, $offset: Int) {\n         VaultPayoutFallback(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id owner token amount market: market_id timestamp txHash\n         }\n       }\n": types.VaultPayoutFallbacksDocument,
    "\n  query MarketResolution($id: String!) {\n         MarketResolutionEvent(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {\n           id market: market_id kind winningOutcome: outcomeIdx payoutNumerators payoutDenominator voided blockNumber timestamp txHash\n         }\n         MarketReferenceLink(where: {market_id: {_eq: $id}}, limit: 1) {\n           id market: market_id oracleQuestionId: referenceQuestionId pending\n         }\n         Market_by_pk(id: $id) { oracleQuestionId }\n       }\n": types.MarketResolutionDocument,
    "\n  query OracleAnswers($closingQid: String!, $openingQid: String!) {\n         closing: OracleAnswer_by_pk(id: $closingQid) { oracleQuestionId numericValue outcomeLabel voidReason resolvedAt txHash }\n         opening: OracleAnswer_by_pk(id: $openingQid) { oracleQuestionId numericValue outcomeLabel voidReason resolvedAt txHash }\n       }\n": types.OracleAnswersDocument,
    "\n  query Candles($where: Candle_bool_exp!, $limit: Int) {\n        Candle(where: $where, order_by: {bucketStart: desc}, limit: $limit) {\n          bucketStart openPrice high low closePrice baseVolume quoteVolume tradeCount\n        }\n      }\n": types.CandlesDocument,
    "\n  fragment ProtocolFeeFields on ProtocolFeeRecord {\n    id\n    orderId\n    recipient\n    payer\n    token\n    amount\n    isTakerSide\n    market: market_id\n    pool\n    timestamp\n    txHash\n  }\n": types.ProtocolFeeFieldsFragmentDoc,
    "\n  fragment BuilderFeeFields on BuilderFeeRecord {\n    id\n    orderId\n    builder\n    payer\n    token\n    amount\n    market: market_id\n    pool\n    timestamp\n    txHash\n  }\n": types.BuilderFeeFieldsFragmentDoc,
    "\n  fragment SettlementFeeFields on SettlementFeeRecord {\n    id\n    recipient: feeRecipient\n    amount: fee\n    winningBacking\n    market: market_id\n    timestamp\n    txHash\n  }\n": types.SettlementFeeFieldsFragmentDoc,
    "\n  query BuilderApprovals($where: BuilderApproval_bool_exp!, $limit: Int, $offset: Int) {\n         BuilderApproval(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id market_id market { poolAddress } user builder maxFeeBpsTimes1k blockNumber timestamp txHash\n         }\n       }\n": types.BuilderApprovalsDocument,
    "\n  query ProtocolFees($where: ProtocolFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         ProtocolFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...ProtocolFeeFields }\n       }\n": types.ProtocolFeesDocument,
    "\n  query BuilderFees($where: BuilderFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         BuilderFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...BuilderFeeFields }\n       }\n": types.BuilderFeesDocument,
    "\n  query SettlementFees($where: SettlementFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         SettlementFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...SettlementFeeFields }\n       }\n": types.SettlementFeesDocument,
    "\n  fragment FillQueryFields on Fill {\n    id\n    market: market_id\n    pool\n    fillPrice\n    quantity\n    quoteQuantity\n    maker\n    makerSide\n    taker\n    takerSide\n    kind\n    takerIsBid\n    timestamp\n    txHash\n    # The taker's ORDER, not just the denormalized copy on the fill. On binary\n    # the fill's takerSide is backfilled by the PendingTakerFill bridge only\n    # once BinaryOrderPlaced lands, so it can still be null on a row whose\n    # taker is already stamped. The Order carries the authoritative side from\n    # the moment it exists, which is what the portfolio reads have always used.\n    takerOrder { owner side }\n  }\n": types.FillQueryFieldsFragmentDoc,
    "\n  query Fills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {\n        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {\n          ...FillQueryFields\n        }\n      }\n": types.FillsDocument,
    "\n  query UserFills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {\n        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {\n          ...FillQueryFields\n        }\n      }\n": types.UserFillsDocument,
    "\n  fragment SeriesFields on Series {\n    id\n    creatorAddress\n    seriesId\n    collateral\n    asset\n    intervalSec\n    createdAtTimestamp\n    updatedAtTimestamp\n  }\n": types.SeriesFieldsFragmentDoc,
    "\n  fragment MarketCreatorFields on MarketCreator {\n    id\n    owner\n    policy\n    core\n    adapter\n    operatorId\n    venueId\n    factory\n    createdAtBlock\n    createdAtTimestamp\n  }\n": types.MarketCreatorFieldsFragmentDoc,
    "\n  fragment OracleAdapterFields on OracleAdapter {\n    id\n    owner\n    factory\n    approved\n    approvedAtTimestamp\n    createdAtTimestamp\n  }\n": types.OracleAdapterFieldsFragmentDoc,
    "\n  query MarketCreators($where: MarketCreator_bool_exp!, $limit: Int, $offset: Int) {\n         MarketCreator(where: $where, order_by: {createdAtBlock: desc}, limit: $limit, offset: $offset) {\n           ...MarketCreatorFields\n           series(order_by: {seriesId: asc}) { ...SeriesFields }\n         }\n       }\n": types.MarketCreatorsDocument,
    "\n  query MarketCreatorByPk($id: String!) {\n         MarketCreator_by_pk(id: $id) {\n           ...MarketCreatorFields\n           series(order_by: {seriesId: asc}) { ...SeriesFields }\n         }\n       }\n": types.MarketCreatorByPkDocument,
    "\n  query OracleAdapters($where: OracleAdapter_bool_exp!, $limit: Int, $offset: Int) {\n         OracleAdapter(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleAdapterFields }\n       }\n": types.OracleAdaptersDocument,
    "\n  query OracleAdapterByPk($id: String!) { OracleAdapter_by_pk(id: $id) { ...OracleAdapterFields } }\n": types.OracleAdapterByPkDocument,
    "\n  query SeriesList($where: Series_bool_exp!, $limit: Int, $offset: Int) {\n         Series(where: $where, order_by: {createdAtTimestamp: asc}, limit: $limit, offset: $offset) { ...SeriesFields }\n       }\n": types.SeriesListDocument,
    "\n  fragment MarketFields on Market {\n    id\n    marketType\n    poolAddress\n    lastPrice\n    lastTradeAt\n    cumulativeBaseVolume\n    cumulativeQuoteVolume\n    tradeCount\n    baseDecimals\n    quoteDecimals\n    createdAtTimestamp\n    baseToken\n    quoteToken\n    baseSymbol\n    quoteSymbol\n    baseIsNative\n    tickSize\n    lotSize\n    minQuantity\n    markPrice\n    rawMidpoint\n    markPriceUpdatedAt\n    stopRegistry\n    marginBank\n    initialMarginBps\n    fundingRate\n    cumulativeFundingPerUnit\n    indexPrice\n    fundingUpdatedAt\n    fundingWindowSec\n    fundingIntervalSec\n    openInterest\n    openInterestUpdatedAt\n    marketId\n    marketAddress\n    yesTokenId\n    noTokenId\n    collateral\n    asset\n    question\n    oracleQuestion\n    oracleQuestionId\n    status: clobStatus\n    strike\n    tradingStart\n    expiry\n    winningOutcome\n    payoutNumerators\n    payoutDenominator\n    resolvedAtBlock\n    resolvedAtTimestamp\n    createdByTx\n    creator\n    voided\n    backing\n    nonce\n    finalized\n    netBacking\n    context\n    intervalSec\n    operatorId\n    venueId\n  }\n": types.MarketFieldsFragmentDoc,
    "\n  query RegistryMarkets($where: Market_bool_exp!, $limit: Int, $offset: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": types.RegistryMarketsDocument,
    "\n  query Markets($where: Market_bool_exp!, $limit: Int, $offset: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": types.MarketsDocument,
    "\n  query MarketByPk($id: String!) {\n    Market_by_pk(id: $id) {\n      ...MarketFields\n    }\n  }\n": types.MarketByPkDocument,
    "\n  query MarketByAddress($a: String!) {\n    Market(\n      where: { marketAddress: { _eq: $a } }\n      order_by: { createdAtTimestamp: desc }\n      limit: 1\n    ) {\n      ...MarketFields\n    }\n  }\n": types.MarketByAddressDocument,
    "\n  query BinaryMarkets($where: Market_bool_exp!, $orderBy: [Market_order_by!], $limit: Int) {\n    Market(where: $where, order_by: $orderBy, limit: $limit) {\n      ...MarketFields\n    }\n  }\n": types.BinaryMarketsDocument,
    "\n  query SpotMarkets($where: Market_bool_exp!, $limit: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {\n      ...MarketFields\n    }\n  }\n": types.SpotMarketsDocument,
    "\n  query PerpMarkets($where: Market_bool_exp!, $limit: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {\n      ...MarketFields\n    }\n  }\n": types.PerpMarketsDocument,
    "\n  query LiveBinaryMarkets(\n    $where: Market_bool_exp!\n    $orderBy: [Market_order_by!]\n    $limit: Int!\n    $offset: Int!\n  ) {\n    Market(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": types.LiveBinaryMarketsDocument,
    "\n  query PastBinaryMarkets($where: Market_bool_exp!, $limit: Int!, $offset: Int!) {\n    Market(where: $where, order_by: { expiry: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n": types.PastBinaryMarketsDocument,
    "\n  query BinaryOriginPairs {\n         Market(\n           distinct_on: [operatorId, venueId],\n           where: {marketType: {_eq: \"BINARY\"}, operatorId: {_is_null: false}, venueId: {_is_null: false}},\n           order_by: [{operatorId: asc}, {venueId: asc}]\n         ) {\n           operatorId\n           venueId\n         }\n       }\n": types.BinaryOriginPairsDocument,
    "\n  query BinaryAssets {\n         Market(distinct_on: asset, where: {marketType: {_eq: \"BINARY\"}, asset: {_is_null: false}}, order_by: {asset: asc}) {\n           asset\n         }\n       }\n": types.BinaryAssetsDocument,
    "\n  query MarketFees($id: String!) {\n         MarketVenue_by_pk(id: $id) {\n           operatorId venueId feeRecipient\n           makerFeeBps takerFeeBps maxBuilderFeeBps routingFeeBps settlementFeeBps settlementFeesCollected\n         }\n       }\n": types.MarketFeesDocument,
    "\n  query MarketStatusHistory($id: String!) {\n         MarketStatusUpdate(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {\n           oldStatus newStatus blockNumber timestamp txHash\n         }\n       }\n": types.MarketStatusHistoryDocument,
    "\n  query OpeningAnswers($qids: [String!]) {\n         OracleAnswer(where: {id: {_in: $qids}}) { id numericValue }\n       }\n": types.OpeningAnswersDocument,
    "\n  query OpeningRefs($ids: [String!]) {\n         MarketReferenceLink(where: {market_id: {_in: $ids}}) { market: market_id referenceQuestionId }\n       }\n": types.OpeningRefsDocument,
    "\n  fragment OperatorFields on Operator {\n    operatorId\n    owner\n    feeRecipient\n    enabled\n    policy\n    context\n    pendingOwner\n    venueCount\n    createdAtTimestamp\n    updatedAtTimestamp\n    marketCount\n    cumulativeQuoteVolume\n    protocolFeesCollected\n    settlementFeesCollected\n    builderFeesCollected\n  }\n": types.OperatorFieldsFragmentDoc,
    "\n  fragment VenueFields on Venue {\n    venueId\n    operatorId\n    marketType\n    feeParams\n    feeRecipientOverride\n    policy\n    signer\n    creationEnabled\n    context\n    createdAtTimestamp\n    updatedAtTimestamp\n    marketCount\n    cumulativeQuoteVolume\n    protocolFeesCollected\n    settlementFeesCollected\n    builderFeesCollected\n  }\n": types.VenueFieldsFragmentDoc,
    "\n  query Operators($where: Operator_bool_exp!, $limit: Int, $offset: Int) {\n         Operator(where: $where, order_by: {operatorId: desc}, limit: $limit, offset: $offset) { ...OperatorFields }\n       }\n": types.OperatorsDocument,
    "\n  query OperatorByPk($id: String!) { Operator_by_pk(id: $id) { ...OperatorFields } }\n": types.OperatorByPkDocument,
    "\n  query Venues($where: Venue_bool_exp!, $limit: Int, $offset: Int) {\n         Venue(where: $where, order_by: {createdAtTimestamp: asc}, limit: $limit, offset: $offset) { ...VenueFields }\n       }\n": types.VenuesDocument,
    "\n  query VenueByPk($id: String!) { Venue_by_pk(id: $id) { ...VenueFields } }\n": types.VenueByPkDocument,
    "\n  fragment OracleQuestionFields on OracleQuestion {\n    id\n    questionKey\n    scheduler\n    oracleCost\n    bindCount\n    reuseCount\n    createdAtBlock\n    createdAtTimestamp\n  }\n": types.OracleQuestionFieldsFragmentDoc,
    "\n  fragment OperatorHubAccountFields on OperatorHubAccount {\n    id\n    operatorId\n    earmarked\n    credit\n    outstanding\n    createdAtBlock\n    createdAtTimestamp\n    updatedAtBlock\n    updatedAtTimestamp\n  }\n": types.OperatorHubAccountFieldsFragmentDoc,
    "\n  fragment OracleBindFields on OracleBind {\n    id\n    oracleQuestionId\n    bindIndex\n    operatorId\n    measuredGas\n    overheadShare\n    cost\n    charged\n    subsidy\n    resolvedAt\n    boundAtBlock\n    boundAtTimestamp\n    txHash\n  }\n": types.OracleBindFieldsFragmentDoc,
    "\n  fragment OracleCallbackFields on OracleCallback {\n    id\n    marketsResolved\n    gasPrice\n    measuredGas\n    overheadGasAttributed\n    totalCost\n    totalCharged\n    subsidy\n    pendingRemaining\n    blockNumber\n    timestamp\n    txHash\n  }\n": types.OracleCallbackFieldsFragmentDoc,
    "\n  query OracleQuestion($id: String!) {\n         OracleQuestion_by_pk(id: $id) { ...OracleQuestionFields }\n       }\n": types.OracleQuestionDocument,
    "\n  query OracleQuestions($where: OracleQuestion_bool_exp!, $limit: Int, $offset: Int) {\n         OracleQuestion(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleQuestionFields }\n       }\n": types.OracleQuestionsDocument,
    "\n  query OperatorHubAccount($id: String!) {\n         OperatorHubAccount_by_pk(id: $id) { ...OperatorHubAccountFields }\n       }\n": types.OperatorHubAccountDocument,
    "\n  query OperatorHubAccounts($limit: Int, $offset: Int) {\n         OperatorHubAccount(order_by: {updatedAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OperatorHubAccountFields }\n       }\n": types.OperatorHubAccountsDocument,
    "\n  query OracleBinds($where: OracleBind_bool_exp!, $limit: Int, $offset: Int) {\n         OracleBind(where: $where, order_by: {boundAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleBindFields }\n       }\n": types.OracleBindsDocument,
    "\n  query OracleCallbacks($limit: Int, $offset: Int) {\n         OracleCallback(order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...OracleCallbackFields }\n       }\n": types.OracleCallbacksDocument,
    "\n  fragment OrderMarketFields on Market {\n    marketAddress\n    asset\n    question\n    expiry\n    tradingStart\n    quoteDecimals\n    intervalSec\n  }\n": types.OrderMarketFieldsFragmentDoc,
    "\n  query SweepableOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: [{expireTimestampNs: asc}, {id: asc}], limit: $limit, offset: $offset) {\n          id orderId owner isBid price quantityRemaining expireTimestampNs placedAtTimestamp\n          market: market_id\n          marketRow: market { poolAddress marketType ...OrderMarketFields }\n        }\n      }\n": types.SweepableOrdersDocument,
    "\n  query OpenOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {\n          id orderId side isBid price quantityRemaining\n          market: market_id\n          marketRow: market { poolAddress ...OrderMarketFields }\n        }\n      }\n": types.OpenOrdersDocument,
    "\n  query Orders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {\n          id orderId side isBid price quantityRemaining fullQuantity filledQuantity status\n          rested expireTimestampNs placedTxHash placedAtTimestamp\n          cancelReason amendedFromOrderId amendedToOrderId\n          market: market_id\n          marketRow: market { poolAddress ...OrderMarketFields }\n        }\n      }\n": types.OrdersDocument,
    "\n  query BookTops($bidWhere: Order_bool_exp!, $askWhere: Order_bool_exp!) {\n         bids: Order(where: $bidWhere, distinct_on: market_id, order_by: [{market_id: desc}, {price: desc}]) {\n           market: market_id price\n         }\n         asks: Order(where: $askWhere, distinct_on: market_id, order_by: [{market_id: asc}, {price: asc}]) {\n           market: market_id price\n         }\n       }\n": types.BookTopsDocument,
    "\n  query FundingPayments($where: FundingPayment_bool_exp!, $limit: Int, $offset: Int) {\n         FundingPayment(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool amount timestamp txHash\n         }\n       }\n": types.FundingPaymentsDocument,
    "\n  query MarginEvents($account: String!, $limit: Int, $offset: Int) {\n         MarginEvent(where: {account: {_eq: $account}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account kind pool amount granter timestamp txHash\n         }\n       }\n": types.MarginEventsDocument,
    "\n  query Liquidations($where: LiquidationEvent_bool_exp!, $limit: Int, $offset: Int) {\n         LiquidationEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool kind size price counterparty penalty\n           badDebt insuranceCovered deficit coverageDeclined collateralAmount equity\n           positionsProcessed stageReached marginStatusBefore marginStatusAfter\n           timestamp blockNumber txHash\n         }\n       }\n": types.LiquidationsDocument,
    "\n  query FundingRateHistory($where: FundingRateUpdate_bool_exp!, $orderBy: [FundingRateUpdate_order_by!], $limit: Int, $offset: Int) {\n         FundingRateUpdate(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n           id pool fundingRate cumulativeFundingPerUnit indexPrice markPrice\n           intervalsSettled intervalsAccrued fundingWindowSec fundingIntervalSec\n           spanStart spanEnd anchorResynced timestamp blockNumber txHash\n         }\n       }\n": types.FundingRateHistoryDocument,
    "\n  query FundingRateCandles($where: FundingRateCandle_bool_exp!, $limit: Int, $offset: Int) {\n         FundingRateCandle(where: $where, order_by: {bucketStart: desc}, limit: $limit, offset: $offset) {\n           id pool intervalSeconds bucketStart\n           avgFundingRate8h minFundingRate8h maxFundingRate8h coverage\n           cumulativeFundingStart cumulativeFundingEnd\n           fundingWindowSec fundingIntervalSec paramsChangedInBucket\n           indexPriceEnd openInterestEnd updateCount\n         }\n       }\n": types.FundingRateCandlesDocument,
    "\n  query PerpFees($where: PerpFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         PerpFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool amount isRebate kind insurancePortion tier fillNotional builder timestamp txHash\n         }\n       }\n": types.PerpFeesDocument,
    "\n  query OpenInterestHistory($pool: String!, $limit: Int, $offset: Int) {\n         OpenInterestSnapshot(where: {pool: {_eq: $pool}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id pool openInterest timestamp blockNumber\n         }\n       }\n": types.OpenInterestHistoryDocument,
    "\n  fragment PerpPortfolioMarketFields on Market {\n    poolAddress\n    baseSymbol\n    quoteSymbol\n    baseDecimals\n    quoteDecimals\n    tickSize\n    lotSize\n    minQuantity\n    lastPrice\n    marginBank\n    initialMarginBps\n    fundingRate\n    indexPrice\n    stopRegistry\n  }\n": types.PerpPortfolioMarketFieldsFragmentDoc,
    "\n  query PerpPortfolio(\n    $acct: String!\n    $fillWhere: Fill_bool_exp!\n    $ordersLimit: Int\n    $tradesLimit: Int\n  ) {\n    PerpOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"PERP\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n    PerpFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      quoteQuantity\n      timestamp\n      txHash\n      maker\n      taker\n      takerIsBid\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n  }\n": types.PerpPortfolioDocument,
    "\n  query PerpOrderHistory($where: Order_bool_exp!, $orderBy: [Order_order_by!], $limit: Int, $offset: Int) {\n    Order(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      status\n      rested\n      expireTimestampNs\n      placedAtTimestamp\n      placedTxHash\n      lastUpdatedAtTimestamp\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n  }\n": types.PerpOrderHistoryDocument,
    "\n  query PerpPositions($where: PerpPosition_bool_exp!, $limit: Int, $offset: Int) {\n    PerpPosition(where: $where, order_by: { updatedAt: desc }, limit: $limit, offset: $offset) {\n      id\n      pool\n      account\n      size\n      isLong\n      entryPriceX18\n      realizedPnl\n      updatedAt\n      updatedAtBlock\n    }\n  }\n": types.PerpPositionsDocument,
    "\n  query PerpStopOrders($where: StopOrder_bool_exp!, $limit: Int, $offset: Int) {\n    StopOrder(where: $where, order_by: { createdAt: desc }, limit: $limit, offset: $offset) {\n      id\n      registry\n      orderIdRaw\n      owner\n      isBid\n      quantity\n      triggerPrice\n      triggerOperator\n      orderType\n      builder\n      builderFeeBpsTimes1k\n      status\n      placedOrderId\n      dropReason\n      createdAt\n      updatedAt\n      txHash\n      market {\n        poolAddress\n        baseSymbol\n        quoteSymbol\n        baseDecimals\n        quoteDecimals\n      }\n    }\n  }\n": types.PerpStopOrdersDocument,
    "\n  query MarketByPool($pool: String!) {\n    Market(\n      where: { poolAddress: { _eq: $pool } }\n      order_by: { createdAtTimestamp: desc }\n      limit: 1\n    ) {\n      ...MarketFields\n    }\n  }\n": types.MarketByPoolDocument,
    "\n  query PoolBindings($pool: String!) {\n         PoolBinding(where: {poolAddress: {_eq: $pool}}, order_by: {nonce: desc}) {\n           id poolAddress marketId nonce fromBlock fromLogIndex fromTimestamp\n           toBlock toLogIndex toTimestamp closedBy\n         }\n       }\n": types.PoolBindingsDocument,
    "\n  query PoolByPk($id: String!) {\n         Pool_by_pk(id: $id) {\n           id address collateral creator currentMarketId currentNonce generationCount\n           createdAtTimestamp updatedAtTimestamp\n         }\n       }\n": types.PoolByPkDocument,
    "\n  fragment RouterActionFields on RouterActionRecord {\n    id\n    kind\n    account\n    market: market_id\n    amount\n    payout\n    routedVia\n    timestamp\n    txHash\n  }\n": types.RouterActionFieldsFragmentDoc,
    "\n  query RouterActions($where: RouterActionRecord_bool_exp!, $limit: Int, $offset: Int) {\n         RouterActionRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...RouterActionFields }\n       }\n": types.RouterActionsDocument,
    "\n  fragment SpotPortfolioMarketFields on Market {\n    poolAddress\n    baseSymbol\n    quoteSymbol\n    baseToken\n    quoteToken\n    baseDecimals\n    quoteDecimals\n    baseIsNative\n    tickSize\n    lotSize\n    minQuantity\n    lastPrice\n    markPrice\n    stopRegistry\n  }\n": types.SpotPortfolioMarketFieldsFragmentDoc,
    "\n  query SpotPortfolio(\n    $acct: String!\n    $fillWhere: Fill_bool_exp!\n    $ordersLimit: Int\n    $tradesLimit: Int\n  ) {\n    SpotOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"SPOT\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n    SpotStopOrder: StopOrder(\n      where: { owner: { _eq: $acct }, status: { _eq: \"PENDING\" } }\n      order_by: { createdAt: desc }\n      limit: $ordersLimit\n    ) {\n      ...SpotStopOrderFields\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n    SpotFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      quoteQuantity\n      timestamp\n      txHash\n      maker\n      taker\n      takerIsBid\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n  }\n": types.SpotPortfolioDocument,
    "\n  fragment SpotStopOrderFields on StopOrder {\n    id\n    registry\n    orderId: orderIdRaw\n    isBid\n    quantity\n    triggerPrice\n    triggerOperator\n    orderType\n    status\n    placedOrderId\n    createdAt\n  }\n": types.SpotStopOrderFieldsFragmentDoc,
    "\n  query SpotStopOrders($where: StopOrder_bool_exp!, $limit: Int) {\n    StopOrder(where: $where, order_by: { createdAt: desc }, limit: $limit) {\n      ...SpotStopOrderFields\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n  }\n": types.SpotStopOrdersDocument,
    "\n  query SyncStatus($chainId: Int!) {\n    chain_metadata(where: { chain_id: { _eq: $chainId } }) {\n      chain_id\n      latest_processed_block\n      block_height\n      num_events_processed\n    }\n  }\n": types.SyncStatusDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PortfolioMarketFields on Market {\n    id\n    marketAddress\n    poolAddress\n    asset\n    question\n    status: clobStatus\n    lastPrice\n    strike\n    expiry\n    winningOutcome\n    voided\n    quoteDecimals\n    intervalSec\n  }\n"): typeof import('./graphql.js').PortfolioMarketFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Portfolio($acct: String!, $fillWhere: Fill_bool_exp!, $ordersLimit: Int, $tradesLimit: Int) {\n    OutcomeBalance(\n      where: { account: { _eq: $acct }, balance: { _gt: \"0\" } }\n      order_by: { balance: desc }\n      limit: 200\n    ) {\n      outcomeIndex\n      tokenId\n      balance\n      market {\n        ...PortfolioMarketFields\n      }\n    }\n    ClobOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"BINARY\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      side\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...PortfolioMarketFields\n      }\n    }\n    ClobFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      timestamp\n      txHash\n      maker\n      makerSide\n      takerOrder {\n        owner\n        side\n      }\n      market {\n        marketAddress\n        asset\n        quoteDecimals\n      }\n    }\n  }\n"): typeof import('./graphql.js').PortfolioDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OutcomeBalances($acct: String!, $mkt: String!) {\n        OutcomeBalance(where: {account: {_eq: $acct}, market: {marketAddress: {_eq: $mkt}}}) { outcomeIndex balance }\n      }\n"): typeof import('./graphql.js').OutcomeBalancesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query VaultPayoutFallbacks($where: VaultPayoutFallback_bool_exp!, $limit: Int, $offset: Int) {\n         VaultPayoutFallback(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id owner token amount market: market_id timestamp txHash\n         }\n       }\n"): typeof import('./graphql.js').VaultPayoutFallbacksDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketResolution($id: String!) {\n         MarketResolutionEvent(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {\n           id market: market_id kind winningOutcome: outcomeIdx payoutNumerators payoutDenominator voided blockNumber timestamp txHash\n         }\n         MarketReferenceLink(where: {market_id: {_eq: $id}}, limit: 1) {\n           id market: market_id oracleQuestionId: referenceQuestionId pending\n         }\n         Market_by_pk(id: $id) { oracleQuestionId }\n       }\n"): typeof import('./graphql.js').MarketResolutionDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OracleAnswers($closingQid: String!, $openingQid: String!) {\n         closing: OracleAnswer_by_pk(id: $closingQid) { oracleQuestionId numericValue outcomeLabel voidReason resolvedAt txHash }\n         opening: OracleAnswer_by_pk(id: $openingQid) { oracleQuestionId numericValue outcomeLabel voidReason resolvedAt txHash }\n       }\n"): typeof import('./graphql.js').OracleAnswersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Candles($where: Candle_bool_exp!, $limit: Int) {\n        Candle(where: $where, order_by: {bucketStart: desc}, limit: $limit) {\n          bucketStart openPrice high low closePrice baseVolume quoteVolume tradeCount\n        }\n      }\n"): typeof import('./graphql.js').CandlesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment ProtocolFeeFields on ProtocolFeeRecord {\n    id\n    orderId\n    recipient\n    payer\n    token\n    amount\n    isTakerSide\n    market: market_id\n    pool\n    timestamp\n    txHash\n  }\n"): typeof import('./graphql.js').ProtocolFeeFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment BuilderFeeFields on BuilderFeeRecord {\n    id\n    orderId\n    builder\n    payer\n    token\n    amount\n    market: market_id\n    pool\n    timestamp\n    txHash\n  }\n"): typeof import('./graphql.js').BuilderFeeFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment SettlementFeeFields on SettlementFeeRecord {\n    id\n    recipient: feeRecipient\n    amount: fee\n    winningBacking\n    market: market_id\n    timestamp\n    txHash\n  }\n"): typeof import('./graphql.js').SettlementFeeFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BuilderApprovals($where: BuilderApproval_bool_exp!, $limit: Int, $offset: Int) {\n         BuilderApproval(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id market_id market { poolAddress } user builder maxFeeBpsTimes1k blockNumber timestamp txHash\n         }\n       }\n"): typeof import('./graphql.js').BuilderApprovalsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ProtocolFees($where: ProtocolFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         ProtocolFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...ProtocolFeeFields }\n       }\n"): typeof import('./graphql.js').ProtocolFeesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BuilderFees($where: BuilderFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         BuilderFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...BuilderFeeFields }\n       }\n"): typeof import('./graphql.js').BuilderFeesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SettlementFees($where: SettlementFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         SettlementFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...SettlementFeeFields }\n       }\n"): typeof import('./graphql.js').SettlementFeesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment FillQueryFields on Fill {\n    id\n    market: market_id\n    pool\n    fillPrice\n    quantity\n    quoteQuantity\n    maker\n    makerSide\n    taker\n    takerSide\n    kind\n    takerIsBid\n    timestamp\n    txHash\n    # The taker's ORDER, not just the denormalized copy on the fill. On binary\n    # the fill's takerSide is backfilled by the PendingTakerFill bridge only\n    # once BinaryOrderPlaced lands, so it can still be null on a row whose\n    # taker is already stamped. The Order carries the authoritative side from\n    # the moment it exists, which is what the portfolio reads have always used.\n    takerOrder { owner side }\n  }\n"): typeof import('./graphql.js').FillQueryFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Fills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {\n        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {\n          ...FillQueryFields\n        }\n      }\n"): typeof import('./graphql.js').FillsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query UserFills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {\n        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {\n          ...FillQueryFields\n        }\n      }\n"): typeof import('./graphql.js').UserFillsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment SeriesFields on Series {\n    id\n    creatorAddress\n    seriesId\n    collateral\n    asset\n    intervalSec\n    createdAtTimestamp\n    updatedAtTimestamp\n  }\n"): typeof import('./graphql.js').SeriesFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment MarketCreatorFields on MarketCreator {\n    id\n    owner\n    policy\n    core\n    adapter\n    operatorId\n    venueId\n    factory\n    createdAtBlock\n    createdAtTimestamp\n  }\n"): typeof import('./graphql.js').MarketCreatorFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OracleAdapterFields on OracleAdapter {\n    id\n    owner\n    factory\n    approved\n    approvedAtTimestamp\n    createdAtTimestamp\n  }\n"): typeof import('./graphql.js').OracleAdapterFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketCreators($where: MarketCreator_bool_exp!, $limit: Int, $offset: Int) {\n         MarketCreator(where: $where, order_by: {createdAtBlock: desc}, limit: $limit, offset: $offset) {\n           ...MarketCreatorFields\n           series(order_by: {seriesId: asc}) { ...SeriesFields }\n         }\n       }\n"): typeof import('./graphql.js').MarketCreatorsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketCreatorByPk($id: String!) {\n         MarketCreator_by_pk(id: $id) {\n           ...MarketCreatorFields\n           series(order_by: {seriesId: asc}) { ...SeriesFields }\n         }\n       }\n"): typeof import('./graphql.js').MarketCreatorByPkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OracleAdapters($where: OracleAdapter_bool_exp!, $limit: Int, $offset: Int) {\n         OracleAdapter(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleAdapterFields }\n       }\n"): typeof import('./graphql.js').OracleAdaptersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OracleAdapterByPk($id: String!) { OracleAdapter_by_pk(id: $id) { ...OracleAdapterFields } }\n"): typeof import('./graphql.js').OracleAdapterByPkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SeriesList($where: Series_bool_exp!, $limit: Int, $offset: Int) {\n         Series(where: $where, order_by: {createdAtTimestamp: asc}, limit: $limit, offset: $offset) { ...SeriesFields }\n       }\n"): typeof import('./graphql.js').SeriesListDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment MarketFields on Market {\n    id\n    marketType\n    poolAddress\n    lastPrice\n    lastTradeAt\n    cumulativeBaseVolume\n    cumulativeQuoteVolume\n    tradeCount\n    baseDecimals\n    quoteDecimals\n    createdAtTimestamp\n    baseToken\n    quoteToken\n    baseSymbol\n    quoteSymbol\n    baseIsNative\n    tickSize\n    lotSize\n    minQuantity\n    markPrice\n    rawMidpoint\n    markPriceUpdatedAt\n    stopRegistry\n    marginBank\n    initialMarginBps\n    fundingRate\n    cumulativeFundingPerUnit\n    indexPrice\n    fundingUpdatedAt\n    fundingWindowSec\n    fundingIntervalSec\n    openInterest\n    openInterestUpdatedAt\n    marketId\n    marketAddress\n    yesTokenId\n    noTokenId\n    collateral\n    asset\n    question\n    oracleQuestion\n    oracleQuestionId\n    status: clobStatus\n    strike\n    tradingStart\n    expiry\n    winningOutcome\n    payoutNumerators\n    payoutDenominator\n    resolvedAtBlock\n    resolvedAtTimestamp\n    createdByTx\n    creator\n    voided\n    backing\n    nonce\n    finalized\n    netBacking\n    context\n    intervalSec\n    operatorId\n    venueId\n  }\n"): typeof import('./graphql.js').MarketFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RegistryMarkets($where: Market_bool_exp!, $limit: Int, $offset: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').RegistryMarketsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Markets($where: Market_bool_exp!, $limit: Int, $offset: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').MarketsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketByPk($id: String!) {\n    Market_by_pk(id: $id) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').MarketByPkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketByAddress($a: String!) {\n    Market(\n      where: { marketAddress: { _eq: $a } }\n      order_by: { createdAtTimestamp: desc }\n      limit: 1\n    ) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').MarketByAddressDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BinaryMarkets($where: Market_bool_exp!, $orderBy: [Market_order_by!], $limit: Int) {\n    Market(where: $where, order_by: $orderBy, limit: $limit) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').BinaryMarketsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SpotMarkets($where: Market_bool_exp!, $limit: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').SpotMarketsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PerpMarkets($where: Market_bool_exp!, $limit: Int) {\n    Market(where: $where, order_by: { createdAtTimestamp: desc }, limit: $limit) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').PerpMarketsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LiveBinaryMarkets(\n    $where: Market_bool_exp!\n    $orderBy: [Market_order_by!]\n    $limit: Int!\n    $offset: Int!\n  ) {\n    Market(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').LiveBinaryMarketsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PastBinaryMarkets($where: Market_bool_exp!, $limit: Int!, $offset: Int!) {\n    Market(where: $where, order_by: { expiry: desc }, limit: $limit, offset: $offset) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').PastBinaryMarketsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BinaryOriginPairs {\n         Market(\n           distinct_on: [operatorId, venueId],\n           where: {marketType: {_eq: \"BINARY\"}, operatorId: {_is_null: false}, venueId: {_is_null: false}},\n           order_by: [{operatorId: asc}, {venueId: asc}]\n         ) {\n           operatorId\n           venueId\n         }\n       }\n"): typeof import('./graphql.js').BinaryOriginPairsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BinaryAssets {\n         Market(distinct_on: asset, where: {marketType: {_eq: \"BINARY\"}, asset: {_is_null: false}}, order_by: {asset: asc}) {\n           asset\n         }\n       }\n"): typeof import('./graphql.js').BinaryAssetsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketFees($id: String!) {\n         MarketVenue_by_pk(id: $id) {\n           operatorId venueId feeRecipient\n           makerFeeBps takerFeeBps maxBuilderFeeBps routingFeeBps settlementFeeBps settlementFeesCollected\n         }\n       }\n"): typeof import('./graphql.js').MarketFeesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketStatusHistory($id: String!) {\n         MarketStatusUpdate(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {\n           oldStatus newStatus blockNumber timestamp txHash\n         }\n       }\n"): typeof import('./graphql.js').MarketStatusHistoryDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OpeningAnswers($qids: [String!]) {\n         OracleAnswer(where: {id: {_in: $qids}}) { id numericValue }\n       }\n"): typeof import('./graphql.js').OpeningAnswersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OpeningRefs($ids: [String!]) {\n         MarketReferenceLink(where: {market_id: {_in: $ids}}) { market: market_id referenceQuestionId }\n       }\n"): typeof import('./graphql.js').OpeningRefsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OperatorFields on Operator {\n    operatorId\n    owner\n    feeRecipient\n    enabled\n    policy\n    context\n    pendingOwner\n    venueCount\n    createdAtTimestamp\n    updatedAtTimestamp\n    marketCount\n    cumulativeQuoteVolume\n    protocolFeesCollected\n    settlementFeesCollected\n    builderFeesCollected\n  }\n"): typeof import('./graphql.js').OperatorFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment VenueFields on Venue {\n    venueId\n    operatorId\n    marketType\n    feeParams\n    feeRecipientOverride\n    policy\n    signer\n    creationEnabled\n    context\n    createdAtTimestamp\n    updatedAtTimestamp\n    marketCount\n    cumulativeQuoteVolume\n    protocolFeesCollected\n    settlementFeesCollected\n    builderFeesCollected\n  }\n"): typeof import('./graphql.js').VenueFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Operators($where: Operator_bool_exp!, $limit: Int, $offset: Int) {\n         Operator(where: $where, order_by: {operatorId: desc}, limit: $limit, offset: $offset) { ...OperatorFields }\n       }\n"): typeof import('./graphql.js').OperatorsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OperatorByPk($id: String!) { Operator_by_pk(id: $id) { ...OperatorFields } }\n"): typeof import('./graphql.js').OperatorByPkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Venues($where: Venue_bool_exp!, $limit: Int, $offset: Int) {\n         Venue(where: $where, order_by: {createdAtTimestamp: asc}, limit: $limit, offset: $offset) { ...VenueFields }\n       }\n"): typeof import('./graphql.js').VenuesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query VenueByPk($id: String!) { Venue_by_pk(id: $id) { ...VenueFields } }\n"): typeof import('./graphql.js').VenueByPkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OracleQuestionFields on OracleQuestion {\n    id\n    questionKey\n    scheduler\n    oracleCost\n    bindCount\n    reuseCount\n    createdAtBlock\n    createdAtTimestamp\n  }\n"): typeof import('./graphql.js').OracleQuestionFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OperatorHubAccountFields on OperatorHubAccount {\n    id\n    operatorId\n    earmarked\n    credit\n    outstanding\n    createdAtBlock\n    createdAtTimestamp\n    updatedAtBlock\n    updatedAtTimestamp\n  }\n"): typeof import('./graphql.js').OperatorHubAccountFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OracleBindFields on OracleBind {\n    id\n    oracleQuestionId\n    bindIndex\n    operatorId\n    measuredGas\n    overheadShare\n    cost\n    charged\n    subsidy\n    resolvedAt\n    boundAtBlock\n    boundAtTimestamp\n    txHash\n  }\n"): typeof import('./graphql.js').OracleBindFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OracleCallbackFields on OracleCallback {\n    id\n    marketsResolved\n    gasPrice\n    measuredGas\n    overheadGasAttributed\n    totalCost\n    totalCharged\n    subsidy\n    pendingRemaining\n    blockNumber\n    timestamp\n    txHash\n  }\n"): typeof import('./graphql.js').OracleCallbackFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OracleQuestion($id: String!) {\n         OracleQuestion_by_pk(id: $id) { ...OracleQuestionFields }\n       }\n"): typeof import('./graphql.js').OracleQuestionDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OracleQuestions($where: OracleQuestion_bool_exp!, $limit: Int, $offset: Int) {\n         OracleQuestion(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleQuestionFields }\n       }\n"): typeof import('./graphql.js').OracleQuestionsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OperatorHubAccount($id: String!) {\n         OperatorHubAccount_by_pk(id: $id) { ...OperatorHubAccountFields }\n       }\n"): typeof import('./graphql.js').OperatorHubAccountDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OperatorHubAccounts($limit: Int, $offset: Int) {\n         OperatorHubAccount(order_by: {updatedAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OperatorHubAccountFields }\n       }\n"): typeof import('./graphql.js').OperatorHubAccountsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OracleBinds($where: OracleBind_bool_exp!, $limit: Int, $offset: Int) {\n         OracleBind(where: $where, order_by: {boundAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleBindFields }\n       }\n"): typeof import('./graphql.js').OracleBindsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OracleCallbacks($limit: Int, $offset: Int) {\n         OracleCallback(order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...OracleCallbackFields }\n       }\n"): typeof import('./graphql.js').OracleCallbacksDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OrderMarketFields on Market {\n    marketAddress\n    asset\n    question\n    expiry\n    tradingStart\n    quoteDecimals\n    intervalSec\n  }\n"): typeof import('./graphql.js').OrderMarketFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SweepableOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: [{expireTimestampNs: asc}, {id: asc}], limit: $limit, offset: $offset) {\n          id orderId owner isBid price quantityRemaining expireTimestampNs placedAtTimestamp\n          market: market_id\n          marketRow: market { poolAddress marketType ...OrderMarketFields }\n        }\n      }\n"): typeof import('./graphql.js').SweepableOrdersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OpenOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {\n          id orderId side isBid price quantityRemaining\n          market: market_id\n          marketRow: market { poolAddress ...OrderMarketFields }\n        }\n      }\n"): typeof import('./graphql.js').OpenOrdersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Orders($where: Order_bool_exp!, $limit: Int, $offset: Int) {\n        Order(where: $where, order_by: {placedAtTimestamp: desc}, limit: $limit, offset: $offset) {\n          id orderId side isBid price quantityRemaining fullQuantity filledQuantity status\n          rested expireTimestampNs placedTxHash placedAtTimestamp\n          cancelReason amendedFromOrderId amendedToOrderId\n          market: market_id\n          marketRow: market { poolAddress ...OrderMarketFields }\n        }\n      }\n"): typeof import('./graphql.js').OrdersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query BookTops($bidWhere: Order_bool_exp!, $askWhere: Order_bool_exp!) {\n         bids: Order(where: $bidWhere, distinct_on: market_id, order_by: [{market_id: desc}, {price: desc}]) {\n           market: market_id price\n         }\n         asks: Order(where: $askWhere, distinct_on: market_id, order_by: [{market_id: asc}, {price: asc}]) {\n           market: market_id price\n         }\n       }\n"): typeof import('./graphql.js').BookTopsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query FundingPayments($where: FundingPayment_bool_exp!, $limit: Int, $offset: Int) {\n         FundingPayment(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool amount timestamp txHash\n         }\n       }\n"): typeof import('./graphql.js').FundingPaymentsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarginEvents($account: String!, $limit: Int, $offset: Int) {\n         MarginEvent(where: {account: {_eq: $account}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account kind pool amount granter timestamp txHash\n         }\n       }\n"): typeof import('./graphql.js').MarginEventsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Liquidations($where: LiquidationEvent_bool_exp!, $limit: Int, $offset: Int) {\n         LiquidationEvent(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool kind size price counterparty penalty\n           badDebt insuranceCovered deficit coverageDeclined collateralAmount equity\n           positionsProcessed stageReached marginStatusBefore marginStatusAfter\n           timestamp blockNumber txHash\n         }\n       }\n"): typeof import('./graphql.js').LiquidationsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query FundingRateHistory($where: FundingRateUpdate_bool_exp!, $orderBy: [FundingRateUpdate_order_by!], $limit: Int, $offset: Int) {\n         FundingRateUpdate(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n           id pool fundingRate cumulativeFundingPerUnit indexPrice markPrice\n           intervalsSettled intervalsAccrued fundingWindowSec fundingIntervalSec\n           spanStart spanEnd anchorResynced timestamp blockNumber txHash\n         }\n       }\n"): typeof import('./graphql.js').FundingRateHistoryDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query FundingRateCandles($where: FundingRateCandle_bool_exp!, $limit: Int, $offset: Int) {\n         FundingRateCandle(where: $where, order_by: {bucketStart: desc}, limit: $limit, offset: $offset) {\n           id pool intervalSeconds bucketStart\n           avgFundingRate8h minFundingRate8h maxFundingRate8h coverage\n           cumulativeFundingStart cumulativeFundingEnd\n           fundingWindowSec fundingIntervalSec paramsChangedInBucket\n           indexPriceEnd openInterestEnd updateCount\n         }\n       }\n"): typeof import('./graphql.js').FundingRateCandlesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PerpFees($where: PerpFeeRecord_bool_exp!, $limit: Int, $offset: Int) {\n         PerpFeeRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id account pool amount isRebate kind insurancePortion tier fillNotional builder timestamp txHash\n         }\n       }\n"): typeof import('./graphql.js').PerpFeesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OpenInterestHistory($pool: String!, $limit: Int, $offset: Int) {\n         OpenInterestSnapshot(where: {pool: {_eq: $pool}}, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {\n           id pool openInterest timestamp blockNumber\n         }\n       }\n"): typeof import('./graphql.js').OpenInterestHistoryDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PerpPortfolioMarketFields on Market {\n    poolAddress\n    baseSymbol\n    quoteSymbol\n    baseDecimals\n    quoteDecimals\n    tickSize\n    lotSize\n    minQuantity\n    lastPrice\n    marginBank\n    initialMarginBps\n    fundingRate\n    indexPrice\n    stopRegistry\n  }\n"): typeof import('./graphql.js').PerpPortfolioMarketFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PerpPortfolio(\n    $acct: String!\n    $fillWhere: Fill_bool_exp!\n    $ordersLimit: Int\n    $tradesLimit: Int\n  ) {\n    PerpOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"PERP\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n    PerpFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      quoteQuantity\n      timestamp\n      txHash\n      maker\n      taker\n      takerIsBid\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n  }\n"): typeof import('./graphql.js').PerpPortfolioDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PerpOrderHistory($where: Order_bool_exp!, $orderBy: [Order_order_by!], $limit: Int, $offset: Int) {\n    Order(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      status\n      rested\n      expireTimestampNs\n      placedAtTimestamp\n      placedTxHash\n      lastUpdatedAtTimestamp\n      market {\n        ...PerpPortfolioMarketFields\n      }\n    }\n  }\n"): typeof import('./graphql.js').PerpOrderHistoryDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PerpPositions($where: PerpPosition_bool_exp!, $limit: Int, $offset: Int) {\n    PerpPosition(where: $where, order_by: { updatedAt: desc }, limit: $limit, offset: $offset) {\n      id\n      pool\n      account\n      size\n      isLong\n      entryPriceX18\n      realizedPnl\n      updatedAt\n      updatedAtBlock\n    }\n  }\n"): typeof import('./graphql.js').PerpPositionsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PerpStopOrders($where: StopOrder_bool_exp!, $limit: Int, $offset: Int) {\n    StopOrder(where: $where, order_by: { createdAt: desc }, limit: $limit, offset: $offset) {\n      id\n      registry\n      orderIdRaw\n      owner\n      isBid\n      quantity\n      triggerPrice\n      triggerOperator\n      orderType\n      builder\n      builderFeeBpsTimes1k\n      status\n      placedOrderId\n      dropReason\n      createdAt\n      updatedAt\n      txHash\n      market {\n        poolAddress\n        baseSymbol\n        quoteSymbol\n        baseDecimals\n        quoteDecimals\n      }\n    }\n  }\n"): typeof import('./graphql.js').PerpStopOrdersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MarketByPool($pool: String!) {\n    Market(\n      where: { poolAddress: { _eq: $pool } }\n      order_by: { createdAtTimestamp: desc }\n      limit: 1\n    ) {\n      ...MarketFields\n    }\n  }\n"): typeof import('./graphql.js').MarketByPoolDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PoolBindings($pool: String!) {\n         PoolBinding(where: {poolAddress: {_eq: $pool}}, order_by: {nonce: desc}) {\n           id poolAddress marketId nonce fromBlock fromLogIndex fromTimestamp\n           toBlock toLogIndex toTimestamp closedBy\n         }\n       }\n"): typeof import('./graphql.js').PoolBindingsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PoolByPk($id: String!) {\n         Pool_by_pk(id: $id) {\n           id address collateral creator currentMarketId currentNonce generationCount\n           createdAtTimestamp updatedAtTimestamp\n         }\n       }\n"): typeof import('./graphql.js').PoolByPkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment RouterActionFields on RouterActionRecord {\n    id\n    kind\n    account\n    market: market_id\n    amount\n    payout\n    routedVia\n    timestamp\n    txHash\n  }\n"): typeof import('./graphql.js').RouterActionFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RouterActions($where: RouterActionRecord_bool_exp!, $limit: Int, $offset: Int) {\n         RouterActionRecord(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) { ...RouterActionFields }\n       }\n"): typeof import('./graphql.js').RouterActionsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment SpotPortfolioMarketFields on Market {\n    poolAddress\n    baseSymbol\n    quoteSymbol\n    baseToken\n    quoteToken\n    baseDecimals\n    quoteDecimals\n    baseIsNative\n    tickSize\n    lotSize\n    minQuantity\n    lastPrice\n    markPrice\n    stopRegistry\n  }\n"): typeof import('./graphql.js').SpotPortfolioMarketFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SpotPortfolio(\n    $acct: String!\n    $fillWhere: Fill_bool_exp!\n    $ordersLimit: Int\n    $tradesLimit: Int\n  ) {\n    SpotOrder: Order(\n      where: {\n        owner: { _eq: $acct }\n        status: { _eq: \"Open\" }\n        market: { marketType: { _eq: \"SPOT\" } }\n      }\n      order_by: { placedAtTimestamp: desc }\n      limit: $ordersLimit\n    ) {\n      id\n      orderId\n      isBid\n      price\n      quantityRemaining\n      filledQuantity\n      fullQuantity\n      placedAtTimestamp\n      placedTxHash\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n    SpotStopOrder: StopOrder(\n      where: { owner: { _eq: $acct }, status: { _eq: \"PENDING\" } }\n      order_by: { createdAt: desc }\n      limit: $ordersLimit\n    ) {\n      ...SpotStopOrderFields\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n    SpotFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {\n      id\n      fillPrice\n      quantity\n      quoteQuantity\n      timestamp\n      txHash\n      maker\n      taker\n      takerIsBid\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n  }\n"): typeof import('./graphql.js').SpotPortfolioDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment SpotStopOrderFields on StopOrder {\n    id\n    registry\n    orderId: orderIdRaw\n    isBid\n    quantity\n    triggerPrice\n    triggerOperator\n    orderType\n    status\n    placedOrderId\n    createdAt\n  }\n"): typeof import('./graphql.js').SpotStopOrderFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SpotStopOrders($where: StopOrder_bool_exp!, $limit: Int) {\n    StopOrder(where: $where, order_by: { createdAt: desc }, limit: $limit) {\n      ...SpotStopOrderFields\n      market {\n        ...SpotPortfolioMarketFields\n      }\n    }\n  }\n"): typeof import('./graphql.js').SpotStopOrdersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SyncStatus($chainId: Int!) {\n    chain_metadata(where: { chain_id: { _eq: $chainId } }) {\n      chain_id\n      latest_processed_block\n      block_height\n      num_events_processed\n    }\n  }\n"): typeof import('./graphql.js').SyncStatusDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
