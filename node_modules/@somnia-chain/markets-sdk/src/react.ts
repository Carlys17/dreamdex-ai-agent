// React entry — "@somnia-chain/markets-sdk/react". The only React-coupled surface of
// the SDK. Kept separate from the core barrel so Node consumers (bots, scripts) can
// import "@somnia-chain/markets-sdk" without pulling in React. Wrap your tree in
// <SomniaMarketsProvider client={exchange.client}> and use the hooks.

export {
  SomniaMarketsProvider,
  useSomniaMarketsClient,
  useIsTailing,
  useLiveFills,
  useLiveMarketByAddress,
  useLiveMarketByPool,
  useLiveBinaryOrderBook,
  useLiveBinaryOrderBookByMarket,
  useLiveSpotOrderBook,
  useLiveStatus,
  useLiveUserFills,
  useLiveUserOrders,
  useWatchMarket,
  useWatchUser,
  useWatchPrice,
  useLivePrice,
  useLivePriceFeedInfo,
  useLivePriceTicks,
  useLiveMarkets,
  useIndexerQuery,
  usePortfolio,
  useMarkets,
  useCandles,
  useLiveFundingUpdates,
  useFundingRateSeries,
  useMarketFees,
  useOperators,
  useMarketCreators,
  useOracleAdapters,
  useLendReserves,
  useLendAccount,
  type IndexerQueryState,
} from "./hooks.js";

// Re-exported here too so a React consumer of useFundingRateSeries can name its result
// without also importing the core barrel.
export type { FundingRateSeries, FundingSeriesBucket } from "./funding.js";
