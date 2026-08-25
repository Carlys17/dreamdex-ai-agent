/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { BinaryFillKind, BinaryMarketStatus, BinarySide, OrderStatus } from '../store.js';
import { MarketType } from '../markets.js';
import { StopOrderStatus } from '../spot/stops.js';
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
export type Boolean_Comparison_Exp = {
  _eq?: boolean | null | undefined;
  _gt?: boolean | null | undefined;
  _gte?: boolean | null | undefined;
  _in?: Array<boolean> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: boolean | null | undefined;
  _lte?: boolean | null | undefined;
  _neq?: boolean | null | undefined;
  _nin?: Array<boolean> | null | undefined;
};

/** Boolean expression to filter rows from the table "BuilderApproval". All fields are combined with a logical 'AND'. */
export type BuilderApproval_Bool_Exp = {
  _and?: Array<BuilderApproval_Bool_Exp> | null | undefined;
  _not?: BuilderApproval_Bool_Exp | null | undefined;
  _or?: Array<BuilderApproval_Bool_Exp> | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  builder?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  maxFeeBpsTimes1k?: Numeric_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
  user?: String_Comparison_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "BuilderFeeRecord". All fields are combined with a logical 'AND'. */
export type BuilderFeeRecord_Bool_Exp = {
  _and?: Array<BuilderFeeRecord_Bool_Exp> | null | undefined;
  _not?: BuilderFeeRecord_Bool_Exp | null | undefined;
  _or?: Array<BuilderFeeRecord_Bool_Exp> | null | undefined;
  amount?: Numeric_Comparison_Exp | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  builder?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  orderId?: String_Comparison_Exp | null | undefined;
  payer?: String_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  token?: String_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

export type Candle_Aggregate_Bool_Exp = {
  count?: Candle_Aggregate_Bool_Exp_Count | null | undefined;
};

export type Candle_Aggregate_Bool_Exp_Count = {
  arguments?: Array<Candle_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: Candle_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** order by aggregate values of table "Candle" */
export type Candle_Aggregate_Order_By = {
  avg?: Candle_Avg_Order_By | null | undefined;
  count?: Order_By | null | undefined;
  max?: Candle_Max_Order_By | null | undefined;
  min?: Candle_Min_Order_By | null | undefined;
  stddev?: Candle_Stddev_Order_By | null | undefined;
  stddev_pop?: Candle_Stddev_Pop_Order_By | null | undefined;
  stddev_samp?: Candle_Stddev_Samp_Order_By | null | undefined;
  sum?: Candle_Sum_Order_By | null | undefined;
  var_pop?: Candle_Var_Pop_Order_By | null | undefined;
  var_samp?: Candle_Var_Samp_Order_By | null | undefined;
  variance?: Candle_Variance_Order_By | null | undefined;
};

/** order by avg() on columns of table "Candle" */
export type Candle_Avg_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "Candle". All fields are combined with a logical 'AND'. */
export type Candle_Bool_Exp = {
  _and?: Array<Candle_Bool_Exp> | null | undefined;
  _not?: Candle_Bool_Exp | null | undefined;
  _or?: Array<Candle_Bool_Exp> | null | undefined;
  baseVolume?: Numeric_Comparison_Exp | null | undefined;
  bucketStart?: Numeric_Comparison_Exp | null | undefined;
  closePrice?: Numeric_Comparison_Exp | null | undefined;
  high?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  intervalSeconds?: Int_Comparison_Exp | null | undefined;
  low?: Numeric_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  openPrice?: Numeric_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  quoteVolume?: Numeric_Comparison_Exp | null | undefined;
  tradeCount?: Int_Comparison_Exp | null | undefined;
};

/** order by max() on columns of table "Candle" */
export type Candle_Max_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  pool?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** order by min() on columns of table "Candle" */
export type Candle_Min_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  pool?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** select columns of table "Candle" */
export type Candle_Select_Column =
  /** column name */
  | 'baseVolume'
  /** column name */
  | 'bucketStart'
  /** column name */
  | 'closePrice'
  /** column name */
  | 'high'
  /** column name */
  | 'id'
  /** column name */
  | 'intervalSeconds'
  /** column name */
  | 'low'
  /** column name */
  | 'market_id'
  /** column name */
  | 'openPrice'
  /** column name */
  | 'pool'
  /** column name */
  | 'quoteVolume'
  /** column name */
  | 'tradeCount';

/** order by stddev() on columns of table "Candle" */
export type Candle_Stddev_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** order by stddev_pop() on columns of table "Candle" */
export type Candle_Stddev_Pop_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** order by stddev_samp() on columns of table "Candle" */
export type Candle_Stddev_Samp_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** order by sum() on columns of table "Candle" */
export type Candle_Sum_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** order by var_pop() on columns of table "Candle" */
export type Candle_Var_Pop_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** order by var_samp() on columns of table "Candle" */
export type Candle_Var_Samp_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

/** order by variance() on columns of table "Candle" */
export type Candle_Variance_Order_By = {
  baseVolume?: Order_By | null | undefined;
  bucketStart?: Order_By | null | undefined;
  closePrice?: Order_By | null | undefined;
  high?: Order_By | null | undefined;
  intervalSeconds?: Order_By | null | undefined;
  low?: Order_By | null | undefined;
  openPrice?: Order_By | null | undefined;
  quoteVolume?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
};

export type Fill_Aggregate_Bool_Exp = {
  bool_and?: Fill_Aggregate_Bool_Exp_Bool_And | null | undefined;
  bool_or?: Fill_Aggregate_Bool_Exp_Bool_Or | null | undefined;
  count?: Fill_Aggregate_Bool_Exp_Count | null | undefined;
};

export type Fill_Aggregate_Bool_Exp_Bool_And = {
  arguments: Fill_Select_Column_Fill_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: Fill_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type Fill_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Fill_Select_Column_Fill_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: Fill_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type Fill_Aggregate_Bool_Exp_Count = {
  arguments?: Array<Fill_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: Fill_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** order by aggregate values of table "Fill" */
export type Fill_Aggregate_Order_By = {
  avg?: Fill_Avg_Order_By | null | undefined;
  count?: Order_By | null | undefined;
  max?: Fill_Max_Order_By | null | undefined;
  min?: Fill_Min_Order_By | null | undefined;
  stddev?: Fill_Stddev_Order_By | null | undefined;
  stddev_pop?: Fill_Stddev_Pop_Order_By | null | undefined;
  stddev_samp?: Fill_Stddev_Samp_Order_By | null | undefined;
  sum?: Fill_Sum_Order_By | null | undefined;
  var_pop?: Fill_Var_Pop_Order_By | null | undefined;
  var_samp?: Fill_Var_Samp_Order_By | null | undefined;
  variance?: Fill_Variance_Order_By | null | undefined;
};

/** order by avg() on columns of table "Fill" */
export type Fill_Avg_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "Fill". All fields are combined with a logical 'AND'. */
export type Fill_Bool_Exp = {
  _and?: Array<Fill_Bool_Exp> | null | undefined;
  _not?: Fill_Bool_Exp | null | undefined;
  _or?: Array<Fill_Bool_Exp> | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  fillPrice?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  kind?: Clobfillkind_Comparison_Exp | null | undefined;
  logIndex?: Int_Comparison_Exp | null | undefined;
  maker?: String_Comparison_Exp | null | undefined;
  makerOrder?: Order_Bool_Exp | null | undefined;
  makerOrderId?: Numeric_Comparison_Exp | null | undefined;
  makerOrder_id?: String_Comparison_Exp | null | undefined;
  makerRemainingQuantity?: Numeric_Comparison_Exp | null | undefined;
  makerSide?: Cloborderside_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  quantity?: Numeric_Comparison_Exp | null | undefined;
  quoteQuantity?: Numeric_Comparison_Exp | null | undefined;
  taker?: String_Comparison_Exp | null | undefined;
  takerIsBid?: Boolean_Comparison_Exp | null | undefined;
  takerOrder?: Order_Bool_Exp | null | undefined;
  takerOrderId?: Numeric_Comparison_Exp | null | undefined;
  takerOrder_id?: String_Comparison_Exp | null | undefined;
  takerRemainingQuantity?: Numeric_Comparison_Exp | null | undefined;
  takerSide?: Cloborderside_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** order by max() on columns of table "Fill" */
export type Fill_Max_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  /** BINARY only (derived once taker side is known) */
  kind?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  maker?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerOrder_id?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** BINARY only */
  makerSide?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  pool?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  /** Denormalized via the PendingTakerFill bridge (SPOT); the taker's OrderPlaced fires after the fill */
  taker?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerOrder_id?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  /** BINARY only */
  takerSide?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
  txHash?: Order_By | null | undefined;
};

/** order by min() on columns of table "Fill" */
export type Fill_Min_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  /** BINARY only (derived once taker side is known) */
  kind?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  maker?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerOrder_id?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** BINARY only */
  makerSide?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  pool?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  /** Denormalized via the PendingTakerFill bridge (SPOT); the taker's OrderPlaced fires after the fill */
  taker?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerOrder_id?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  /** BINARY only */
  takerSide?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
  txHash?: Order_By | null | undefined;
};

/** select columns of table "Fill" */
export type Fill_Select_Column =
  /** column name */
  | 'blockNumber'
  /** column name */
  | 'fillPrice'
  /** column name */
  | 'id'
  /** column name */
  | 'kind'
  /** column name */
  | 'logIndex'
  /** column name */
  | 'maker'
  /** column name */
  | 'makerOrderId'
  /** column name */
  | 'makerOrder_id'
  /** column name */
  | 'makerRemainingQuantity'
  /** column name */
  | 'makerSide'
  /** column name */
  | 'market_id'
  /** column name */
  | 'pool'
  /** column name */
  | 'quantity'
  /** column name */
  | 'quoteQuantity'
  /** column name */
  | 'taker'
  /** column name */
  | 'takerIsBid'
  /** column name */
  | 'takerOrderId'
  /** column name */
  | 'takerOrder_id'
  /** column name */
  | 'takerRemainingQuantity'
  /** column name */
  | 'takerSide'
  /** column name */
  | 'timestamp'
  /** column name */
  | 'txHash';

/** select "Fill_aggregate_bool_exp_bool_and_arguments_columns" columns of table "Fill" */
export type Fill_Select_Column_Fill_Aggregate_Bool_Exp_Bool_And_Arguments_Columns =
  /** column name */
  | 'takerIsBid';

/** select "Fill_aggregate_bool_exp_bool_or_arguments_columns" columns of table "Fill" */
export type Fill_Select_Column_Fill_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns =
  /** column name */
  | 'takerIsBid';

/** order by stddev() on columns of table "Fill" */
export type Fill_Stddev_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by stddev_pop() on columns of table "Fill" */
export type Fill_Stddev_Pop_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by stddev_samp() on columns of table "Fill" */
export type Fill_Stddev_Samp_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by sum() on columns of table "Fill" */
export type Fill_Sum_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by var_pop() on columns of table "Fill" */
export type Fill_Var_Pop_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by var_samp() on columns of table "Fill" */
export type Fill_Var_Samp_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by variance() on columns of table "Fill" */
export type Fill_Variance_Order_By = {
  blockNumber?: Order_By | null | undefined;
  /** Execution price (SPOT: maker limit price; BINARY: fillPrice / YES probability) */
  fillPrice?: Order_By | null | undefined;
  logIndex?: Order_By | null | undefined;
  makerOrderId?: Order_By | null | undefined;
  makerRemainingQuantity?: Order_By | null | undefined;
  /** Base/outcome quantity filled (raw) */
  quantity?: Order_By | null | undefined;
  /** Quote/collateral value = quantity * fillPrice / 10^baseDecimals (raw, floor) */
  quoteQuantity?: Order_By | null | undefined;
  takerOrderId?: Order_By | null | undefined;
  takerRemainingQuantity?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "FundingPayment". All fields are combined with a logical 'AND'. */
export type FundingPayment_Bool_Exp = {
  _and?: Array<FundingPayment_Bool_Exp> | null | undefined;
  _not?: FundingPayment_Bool_Exp | null | undefined;
  _or?: Array<FundingPayment_Bool_Exp> | null | undefined;
  account?: String_Comparison_Exp | null | undefined;
  amount?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "FundingRateCandle". All fields are combined with a logical 'AND'. */
export type FundingRateCandle_Bool_Exp = {
  _and?: Array<FundingRateCandle_Bool_Exp> | null | undefined;
  _not?: FundingRateCandle_Bool_Exp | null | undefined;
  _or?: Array<FundingRateCandle_Bool_Exp> | null | undefined;
  avgFundingRate8h?: Numeric_Comparison_Exp | null | undefined;
  bucketStart?: Numeric_Comparison_Exp | null | undefined;
  coverage?: Numeric_Comparison_Exp | null | undefined;
  coveredSeconds?: Numeric_Comparison_Exp | null | undefined;
  cumulativeFundingEnd?: Numeric_Comparison_Exp | null | undefined;
  cumulativeFundingStart?: Numeric_Comparison_Exp | null | undefined;
  fundingIntervalSec?: Int_Comparison_Exp | null | undefined;
  fundingWindowSec?: Int_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  indexPriceEnd?: Numeric_Comparison_Exp | null | undefined;
  intervalSeconds?: Int_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  maxFundingRate8h?: Numeric_Comparison_Exp | null | undefined;
  minFundingRate8h?: Numeric_Comparison_Exp | null | undefined;
  openInterestEnd?: Numeric_Comparison_Exp | null | undefined;
  paramsChangedInBucket?: Boolean_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  updateCount?: Int_Comparison_Exp | null | undefined;
  weightedRate8hSeconds?: Numeric_Comparison_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "FundingRateUpdate". All fields are combined with a logical 'AND'. */
export type FundingRateUpdate_Bool_Exp = {
  _and?: Array<FundingRateUpdate_Bool_Exp> | null | undefined;
  _not?: FundingRateUpdate_Bool_Exp | null | undefined;
  _or?: Array<FundingRateUpdate_Bool_Exp> | null | undefined;
  anchorResynced?: Boolean_Comparison_Exp | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  cumulativeFundingPerUnit?: Numeric_Comparison_Exp | null | undefined;
  fundingIntervalSec?: Int_Comparison_Exp | null | undefined;
  fundingRate?: Numeric_Comparison_Exp | null | undefined;
  fundingWindowSec?: Int_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  indexPrice?: Numeric_Comparison_Exp | null | undefined;
  intervalsAccrued?: Numeric_Comparison_Exp | null | undefined;
  intervalsSettled?: Numeric_Comparison_Exp | null | undefined;
  markPrice?: Numeric_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  spanEnd?: Numeric_Comparison_Exp | null | undefined;
  spanStart?: Numeric_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** Ordering options when selecting data from "FundingRateUpdate". */
export type FundingRateUpdate_Order_By = {
  anchorResynced?: Order_By | null | undefined;
  blockNumber?: Order_By | null | undefined;
  cumulativeFundingPerUnit?: Order_By | null | undefined;
  fundingIntervalSec?: Order_By | null | undefined;
  fundingRate?: Order_By | null | undefined;
  fundingWindowSec?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  indexPrice?: Order_By | null | undefined;
  intervalsAccrued?: Order_By | null | undefined;
  intervalsSettled?: Order_By | null | undefined;
  markPrice?: Order_By | null | undefined;
  market?: Market_Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  pool?: Order_By | null | undefined;
  spanEnd?: Order_By | null | undefined;
  spanStart?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
  txHash?: Order_By | null | undefined;
};

/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
export type Int_Comparison_Exp = {
  _eq?: number | null | undefined;
  _gt?: number | null | undefined;
  _gte?: number | null | undefined;
  _in?: Array<number> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: number | null | undefined;
  _lte?: number | null | undefined;
  _neq?: number | null | undefined;
  _nin?: Array<number> | null | undefined;
};

/** Boolean expression to filter rows from the table "LiquidationEvent". All fields are combined with a logical 'AND'. */
export type LiquidationEvent_Bool_Exp = {
  _and?: Array<LiquidationEvent_Bool_Exp> | null | undefined;
  _not?: LiquidationEvent_Bool_Exp | null | undefined;
  _or?: Array<LiquidationEvent_Bool_Exp> | null | undefined;
  account?: String_Comparison_Exp | null | undefined;
  badDebt?: Numeric_Comparison_Exp | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  collateralAmount?: Numeric_Comparison_Exp | null | undefined;
  counterparty?: String_Comparison_Exp | null | undefined;
  coverageDeclined?: Numeric_Comparison_Exp | null | undefined;
  deficit?: Numeric_Comparison_Exp | null | undefined;
  equity?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  insuranceCovered?: Numeric_Comparison_Exp | null | undefined;
  kind?: String_Comparison_Exp | null | undefined;
  marginStatusAfter?: Int_Comparison_Exp | null | undefined;
  marginStatusBefore?: Int_Comparison_Exp | null | undefined;
  penalty?: Numeric_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  positionsProcessed?: Numeric_Comparison_Exp | null | undefined;
  price?: Numeric_Comparison_Exp | null | undefined;
  size?: Numeric_Comparison_Exp | null | undefined;
  stageReached?: Int_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "MarketCreator". All fields are combined with a logical 'AND'. */
export type MarketCreator_Bool_Exp = {
  _and?: Array<MarketCreator_Bool_Exp> | null | undefined;
  _not?: MarketCreator_Bool_Exp | null | undefined;
  _or?: Array<MarketCreator_Bool_Exp> | null | undefined;
  adapter?: String_Comparison_Exp | null | undefined;
  core?: String_Comparison_Exp | null | undefined;
  createdAtBlock?: Int_Comparison_Exp | null | undefined;
  createdAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  factory?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  operatorId?: Int_Comparison_Exp | null | undefined;
  owner?: String_Comparison_Exp | null | undefined;
  policy?: String_Comparison_Exp | null | undefined;
  series?: Series_Bool_Exp | null | undefined;
  series_aggregate?: Series_Aggregate_Bool_Exp | null | undefined;
  venueId?: String_Comparison_Exp | null | undefined;
};

export type MarketStatusUpdate_Aggregate_Bool_Exp = {
  count?: MarketStatusUpdate_Aggregate_Bool_Exp_Count | null | undefined;
};

export type MarketStatusUpdate_Aggregate_Bool_Exp_Count = {
  arguments?: Array<MarketStatusUpdate_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: MarketStatusUpdate_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** order by aggregate values of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Aggregate_Order_By = {
  avg?: MarketStatusUpdate_Avg_Order_By | null | undefined;
  count?: Order_By | null | undefined;
  max?: MarketStatusUpdate_Max_Order_By | null | undefined;
  min?: MarketStatusUpdate_Min_Order_By | null | undefined;
  stddev?: MarketStatusUpdate_Stddev_Order_By | null | undefined;
  stddev_pop?: MarketStatusUpdate_Stddev_Pop_Order_By | null | undefined;
  stddev_samp?: MarketStatusUpdate_Stddev_Samp_Order_By | null | undefined;
  sum?: MarketStatusUpdate_Sum_Order_By | null | undefined;
  var_pop?: MarketStatusUpdate_Var_Pop_Order_By | null | undefined;
  var_samp?: MarketStatusUpdate_Var_Samp_Order_By | null | undefined;
  variance?: MarketStatusUpdate_Variance_Order_By | null | undefined;
};

/** order by avg() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Avg_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "MarketStatusUpdate". All fields are combined with a logical 'AND'. */
export type MarketStatusUpdate_Bool_Exp = {
  _and?: Array<MarketStatusUpdate_Bool_Exp> | null | undefined;
  _not?: MarketStatusUpdate_Bool_Exp | null | undefined;
  _or?: Array<MarketStatusUpdate_Bool_Exp> | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  newStatus?: Clobmarketstatus_Comparison_Exp | null | undefined;
  oldStatus?: Clobmarketstatus_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** order by max() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Max_Order_By = {
  blockNumber?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  newStatus?: Order_By | null | undefined;
  oldStatus?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
  txHash?: Order_By | null | undefined;
};

/** order by min() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Min_Order_By = {
  blockNumber?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  newStatus?: Order_By | null | undefined;
  oldStatus?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
  txHash?: Order_By | null | undefined;
};

/** select columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Select_Column =
  /** column name */
  | 'blockNumber'
  /** column name */
  | 'id'
  /** column name */
  | 'market_id'
  /** column name */
  | 'newStatus'
  /** column name */
  | 'oldStatus'
  /** column name */
  | 'timestamp'
  /** column name */
  | 'txHash';

/** order by stddev() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Stddev_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by stddev_pop() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Stddev_Pop_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by stddev_samp() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Stddev_Samp_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by sum() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Sum_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by var_pop() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Var_Pop_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by var_samp() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Var_Samp_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** order by variance() on columns of table "MarketStatusUpdate" */
export type MarketStatusUpdate_Variance_Order_By = {
  blockNumber?: Order_By | null | undefined;
  timestamp?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "Market". All fields are combined with a logical 'AND'. */
export type Market_Bool_Exp = {
  _and?: Array<Market_Bool_Exp> | null | undefined;
  _not?: Market_Bool_Exp | null | undefined;
  _or?: Array<Market_Bool_Exp> | null | undefined;
  asset?: String_Comparison_Exp | null | undefined;
  backing?: Numeric_Comparison_Exp | null | undefined;
  baseDecimals?: Int_Comparison_Exp | null | undefined;
  baseIsNative?: Boolean_Comparison_Exp | null | undefined;
  baseSymbol?: String_Comparison_Exp | null | undefined;
  baseToken?: String_Comparison_Exp | null | undefined;
  binaryPoolAddress?: String_Comparison_Exp | null | undefined;
  candles?: Candle_Bool_Exp | null | undefined;
  candles_aggregate?: Candle_Aggregate_Bool_Exp | null | undefined;
  clobStatus?: Clobmarketstatus_Comparison_Exp | null | undefined;
  collateral?: String_Comparison_Exp | null | undefined;
  context?: String_Comparison_Exp | null | undefined;
  createdAtBlock?: Numeric_Comparison_Exp | null | undefined;
  createdAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  createdByTx?: String_Comparison_Exp | null | undefined;
  creator?: String_Comparison_Exp | null | undefined;
  cumulativeBaseVolume?: Numeric_Comparison_Exp | null | undefined;
  cumulativeFundingPerUnit?: Numeric_Comparison_Exp | null | undefined;
  cumulativeQuoteVolume?: Numeric_Comparison_Exp | null | undefined;
  expiry?: Numeric_Comparison_Exp | null | undefined;
  fills?: Fill_Bool_Exp | null | undefined;
  fills_aggregate?: Fill_Aggregate_Bool_Exp | null | undefined;
  finalized?: Boolean_Comparison_Exp | null | undefined;
  fundingIntervalSec?: Int_Comparison_Exp | null | undefined;
  fundingRate?: Numeric_Comparison_Exp | null | undefined;
  fundingUpdatedAt?: Numeric_Comparison_Exp | null | undefined;
  fundingWindowSec?: Int_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  indexPrice?: Numeric_Comparison_Exp | null | undefined;
  initialMarginBps?: Int_Comparison_Exp | null | undefined;
  intervalSec?: Numeric_Comparison_Exp | null | undefined;
  lastPrice?: Numeric_Comparison_Exp | null | undefined;
  lastTradeAt?: Numeric_Comparison_Exp | null | undefined;
  lotSize?: Numeric_Comparison_Exp | null | undefined;
  marginBank?: String_Comparison_Exp | null | undefined;
  markPrice?: Numeric_Comparison_Exp | null | undefined;
  markPriceUpdatedAt?: Numeric_Comparison_Exp | null | undefined;
  marketAddress?: String_Comparison_Exp | null | undefined;
  marketId?: String_Comparison_Exp | null | undefined;
  marketType?: Markettype_Comparison_Exp | null | undefined;
  minQuantity?: Numeric_Comparison_Exp | null | undefined;
  netBacking?: Numeric_Comparison_Exp | null | undefined;
  noTokenId?: String_Comparison_Exp | null | undefined;
  nonce?: Numeric_Comparison_Exp | null | undefined;
  openInterest?: Numeric_Comparison_Exp | null | undefined;
  openInterestUpdatedAt?: Numeric_Comparison_Exp | null | undefined;
  operatorId?: Int_Comparison_Exp | null | undefined;
  oracleQuestion?: String_Comparison_Exp | null | undefined;
  oracleQuestionId?: Numeric_Comparison_Exp | null | undefined;
  orders?: Order_Bool_Exp | null | undefined;
  orders_aggregate?: Order_Aggregate_Bool_Exp | null | undefined;
  outcomeBalances?: OutcomeBalance_Bool_Exp | null | undefined;
  outcomeBalances_aggregate?: OutcomeBalance_Aggregate_Bool_Exp | null | undefined;
  outcomeSlotCount?: Int_Comparison_Exp | null | undefined;
  payoutDenominator?: Numeric_Comparison_Exp | null | undefined;
  payoutNumerators?: String_Array_Comparison_Exp | null | undefined;
  poolAddress?: String_Comparison_Exp | null | undefined;
  question?: String_Comparison_Exp | null | undefined;
  quoteDecimals?: Int_Comparison_Exp | null | undefined;
  quoteSymbol?: String_Comparison_Exp | null | undefined;
  quoteToken?: String_Comparison_Exp | null | undefined;
  rawMidpoint?: Numeric_Comparison_Exp | null | undefined;
  resolvedAtBlock?: Numeric_Comparison_Exp | null | undefined;
  resolvedAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  statusUpdates?: MarketStatusUpdate_Bool_Exp | null | undefined;
  statusUpdates_aggregate?: MarketStatusUpdate_Aggregate_Bool_Exp | null | undefined;
  stopOrders?: StopOrder_Bool_Exp | null | undefined;
  stopOrders_aggregate?: StopOrder_Aggregate_Bool_Exp | null | undefined;
  stopRegistry?: String_Comparison_Exp | null | undefined;
  strike?: Numeric_Comparison_Exp | null | undefined;
  tickSize?: Numeric_Comparison_Exp | null | undefined;
  tradeCount?: Numeric_Comparison_Exp | null | undefined;
  tradingStart?: Numeric_Comparison_Exp | null | undefined;
  venueId?: String_Comparison_Exp | null | undefined;
  voidPolicy?: Int_Comparison_Exp | null | undefined;
  voided?: Boolean_Comparison_Exp | null | undefined;
  winningOutcome?: Int_Comparison_Exp | null | undefined;
  yesTokenId?: String_Comparison_Exp | null | undefined;
};

/** Ordering options when selecting data from "Market". */
export type Market_Order_By = {
  asset?: Order_By | null | undefined;
  backing?: Order_By | null | undefined;
  baseDecimals?: Order_By | null | undefined;
  baseIsNative?: Order_By | null | undefined;
  baseSymbol?: Order_By | null | undefined;
  baseToken?: Order_By | null | undefined;
  binaryPoolAddress?: Order_By | null | undefined;
  candles_aggregate?: Candle_Aggregate_Order_By | null | undefined;
  clobStatus?: Order_By | null | undefined;
  collateral?: Order_By | null | undefined;
  context?: Order_By | null | undefined;
  createdAtBlock?: Order_By | null | undefined;
  createdAtTimestamp?: Order_By | null | undefined;
  createdByTx?: Order_By | null | undefined;
  creator?: Order_By | null | undefined;
  cumulativeBaseVolume?: Order_By | null | undefined;
  cumulativeFundingPerUnit?: Order_By | null | undefined;
  cumulativeQuoteVolume?: Order_By | null | undefined;
  expiry?: Order_By | null | undefined;
  fills_aggregate?: Fill_Aggregate_Order_By | null | undefined;
  finalized?: Order_By | null | undefined;
  fundingIntervalSec?: Order_By | null | undefined;
  fundingRate?: Order_By | null | undefined;
  fundingUpdatedAt?: Order_By | null | undefined;
  fundingWindowSec?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  indexPrice?: Order_By | null | undefined;
  initialMarginBps?: Order_By | null | undefined;
  intervalSec?: Order_By | null | undefined;
  lastPrice?: Order_By | null | undefined;
  lastTradeAt?: Order_By | null | undefined;
  lotSize?: Order_By | null | undefined;
  marginBank?: Order_By | null | undefined;
  markPrice?: Order_By | null | undefined;
  markPriceUpdatedAt?: Order_By | null | undefined;
  marketAddress?: Order_By | null | undefined;
  marketId?: Order_By | null | undefined;
  marketType?: Order_By | null | undefined;
  minQuantity?: Order_By | null | undefined;
  netBacking?: Order_By | null | undefined;
  noTokenId?: Order_By | null | undefined;
  nonce?: Order_By | null | undefined;
  openInterest?: Order_By | null | undefined;
  openInterestUpdatedAt?: Order_By | null | undefined;
  operatorId?: Order_By | null | undefined;
  oracleQuestion?: Order_By | null | undefined;
  oracleQuestionId?: Order_By | null | undefined;
  orders_aggregate?: Order_Aggregate_Order_By | null | undefined;
  outcomeBalances_aggregate?: OutcomeBalance_Aggregate_Order_By | null | undefined;
  outcomeSlotCount?: Order_By | null | undefined;
  payoutDenominator?: Order_By | null | undefined;
  payoutNumerators?: Order_By | null | undefined;
  poolAddress?: Order_By | null | undefined;
  question?: Order_By | null | undefined;
  quoteDecimals?: Order_By | null | undefined;
  quoteSymbol?: Order_By | null | undefined;
  quoteToken?: Order_By | null | undefined;
  rawMidpoint?: Order_By | null | undefined;
  resolvedAtBlock?: Order_By | null | undefined;
  resolvedAtTimestamp?: Order_By | null | undefined;
  statusUpdates_aggregate?: MarketStatusUpdate_Aggregate_Order_By | null | undefined;
  stopOrders_aggregate?: StopOrder_Aggregate_Order_By | null | undefined;
  stopRegistry?: Order_By | null | undefined;
  strike?: Order_By | null | undefined;
  tickSize?: Order_By | null | undefined;
  tradeCount?: Order_By | null | undefined;
  tradingStart?: Order_By | null | undefined;
  venueId?: Order_By | null | undefined;
  voidPolicy?: Order_By | null | undefined;
  voided?: Order_By | null | undefined;
  winningOutcome?: Order_By | null | undefined;
  yesTokenId?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "Operator". All fields are combined with a logical 'AND'. */
export type Operator_Bool_Exp = {
  _and?: Array<Operator_Bool_Exp> | null | undefined;
  _not?: Operator_Bool_Exp | null | undefined;
  _or?: Array<Operator_Bool_Exp> | null | undefined;
  builderFeesCollected?: Numeric_Comparison_Exp | null | undefined;
  context?: String_Comparison_Exp | null | undefined;
  createdAtBlock?: Numeric_Comparison_Exp | null | undefined;
  createdAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  cumulativeQuoteVolume?: Numeric_Comparison_Exp | null | undefined;
  enabled?: Boolean_Comparison_Exp | null | undefined;
  feeRecipient?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  marketCount?: Int_Comparison_Exp | null | undefined;
  operatorId?: Int_Comparison_Exp | null | undefined;
  owner?: String_Comparison_Exp | null | undefined;
  pendingOwner?: String_Comparison_Exp | null | undefined;
  policy?: String_Comparison_Exp | null | undefined;
  protocolFeesCollected?: Numeric_Comparison_Exp | null | undefined;
  settlementFeesCollected?: Numeric_Comparison_Exp | null | undefined;
  updatedAtBlock?: Numeric_Comparison_Exp | null | undefined;
  updatedAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  venueCount?: Int_Comparison_Exp | null | undefined;
  venues?: Venue_Bool_Exp | null | undefined;
  venues_aggregate?: Venue_Aggregate_Bool_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "OracleAdapter". All fields are combined with a logical 'AND'. */
export type OracleAdapter_Bool_Exp = {
  _and?: Array<OracleAdapter_Bool_Exp> | null | undefined;
  _not?: OracleAdapter_Bool_Exp | null | undefined;
  _or?: Array<OracleAdapter_Bool_Exp> | null | undefined;
  approved?: Boolean_Comparison_Exp | null | undefined;
  approvedAtBlock?: Int_Comparison_Exp | null | undefined;
  approvedAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  createdAtBlock?: Int_Comparison_Exp | null | undefined;
  createdAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  factory?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  owner?: String_Comparison_Exp | null | undefined;
};

export type OracleBind_Aggregate_Bool_Exp = {
  count?: OracleBind_Aggregate_Bool_Exp_Count | null | undefined;
};

export type OracleBind_Aggregate_Bool_Exp_Count = {
  arguments?: Array<OracleBind_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: OracleBind_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** Boolean expression to filter rows from the table "OracleBind". All fields are combined with a logical 'AND'. */
export type OracleBind_Bool_Exp = {
  _and?: Array<OracleBind_Bool_Exp> | null | undefined;
  _not?: OracleBind_Bool_Exp | null | undefined;
  _or?: Array<OracleBind_Bool_Exp> | null | undefined;
  bindIndex?: Int_Comparison_Exp | null | undefined;
  boundAtBlock?: Numeric_Comparison_Exp | null | undefined;
  boundAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  charged?: Numeric_Comparison_Exp | null | undefined;
  cost?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  measuredGas?: Numeric_Comparison_Exp | null | undefined;
  operatorId?: Int_Comparison_Exp | null | undefined;
  oracleQuestionId?: Numeric_Comparison_Exp | null | undefined;
  overheadShare?: Numeric_Comparison_Exp | null | undefined;
  question?: OracleQuestion_Bool_Exp | null | undefined;
  question_id?: String_Comparison_Exp | null | undefined;
  resolvedAt?: Numeric_Comparison_Exp | null | undefined;
  resolvedAtBlock?: Numeric_Comparison_Exp | null | undefined;
  subsidy?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** select columns of table "OracleBind" */
export type OracleBind_Select_Column =
  /** column name */
  | 'bindIndex'
  /** column name */
  | 'boundAtBlock'
  /** column name */
  | 'boundAtTimestamp'
  /** column name */
  | 'charged'
  /** column name */
  | 'cost'
  /** column name */
  | 'id'
  /** column name */
  | 'market_id'
  /** column name */
  | 'measuredGas'
  /** column name */
  | 'operatorId'
  /** column name */
  | 'oracleQuestionId'
  /** column name */
  | 'overheadShare'
  /** column name */
  | 'question_id'
  /** column name */
  | 'resolvedAt'
  /** column name */
  | 'resolvedAtBlock'
  /** column name */
  | 'subsidy'
  /** column name */
  | 'txHash';

/** Boolean expression to filter rows from the table "OracleQuestion". All fields are combined with a logical 'AND'. */
export type OracleQuestion_Bool_Exp = {
  _and?: Array<OracleQuestion_Bool_Exp> | null | undefined;
  _not?: OracleQuestion_Bool_Exp | null | undefined;
  _or?: Array<OracleQuestion_Bool_Exp> | null | undefined;
  bindCount?: Int_Comparison_Exp | null | undefined;
  binds?: OracleBind_Bool_Exp | null | undefined;
  binds_aggregate?: OracleBind_Aggregate_Bool_Exp | null | undefined;
  createdAtBlock?: Numeric_Comparison_Exp | null | undefined;
  createdAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  oracleCost?: Numeric_Comparison_Exp | null | undefined;
  oracleQuestionId?: Numeric_Comparison_Exp | null | undefined;
  payoutDenominator?: Numeric_Comparison_Exp | null | undefined;
  payoutNumerators?: String_Array_Comparison_Exp | null | undefined;
  questionKey?: String_Comparison_Exp | null | undefined;
  resolvedAt?: Numeric_Comparison_Exp | null | undefined;
  resolvedAtBlock?: Numeric_Comparison_Exp | null | undefined;
  reuseCount?: Int_Comparison_Exp | null | undefined;
  scheduler?: String_Comparison_Exp | null | undefined;
  supersededByQuestionId?: Numeric_Comparison_Exp | null | undefined;
  voided?: Boolean_Comparison_Exp | null | undefined;
};

export type Order_Aggregate_Bool_Exp = {
  bool_and?: Order_Aggregate_Bool_Exp_Bool_And | null | undefined;
  bool_or?: Order_Aggregate_Bool_Exp_Bool_Or | null | undefined;
  count?: Order_Aggregate_Bool_Exp_Count | null | undefined;
};

export type Order_Aggregate_Bool_Exp_Bool_And = {
  arguments: Order_Select_Column_Order_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: Order_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type Order_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Order_Select_Column_Order_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: Order_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type Order_Aggregate_Bool_Exp_Count = {
  arguments?: Array<Order_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: Order_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** order by aggregate values of table "Order" */
export type Order_Aggregate_Order_By = {
  avg?: Order_Avg_Order_By | null | undefined;
  count?: Order_By | null | undefined;
  max?: Order_Max_Order_By | null | undefined;
  min?: Order_Min_Order_By | null | undefined;
  stddev?: Order_Stddev_Order_By | null | undefined;
  stddev_pop?: Order_Stddev_Pop_Order_By | null | undefined;
  stddev_samp?: Order_Stddev_Samp_Order_By | null | undefined;
  sum?: Order_Sum_Order_By | null | undefined;
  var_pop?: Order_Var_Pop_Order_By | null | undefined;
  var_samp?: Order_Var_Samp_Order_By | null | undefined;
  variance?: Order_Variance_Order_By | null | undefined;
};

/** order by avg() on columns of table "Order" */
export type Order_Avg_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "Order". All fields are combined with a logical 'AND'. */
export type Order_Bool_Exp = {
  _and?: Array<Order_Bool_Exp> | null | undefined;
  _not?: Order_Bool_Exp | null | undefined;
  _or?: Array<Order_Bool_Exp> | null | undefined;
  amendedFromOrderId?: Numeric_Comparison_Exp | null | undefined;
  amendedToOrderId?: Numeric_Comparison_Exp | null | undefined;
  cancelReason?: String_Comparison_Exp | null | undefined;
  expireTimestampNs?: Numeric_Comparison_Exp | null | undefined;
  filledQuantity?: Numeric_Comparison_Exp | null | undefined;
  fullQuantity?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  isBid?: Boolean_Comparison_Exp | null | undefined;
  lastUpdatedAtBlock?: Numeric_Comparison_Exp | null | undefined;
  lastUpdatedAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  orderId?: String_Comparison_Exp | null | undefined;
  orderIdRaw?: Numeric_Comparison_Exp | null | undefined;
  owner?: String_Comparison_Exp | null | undefined;
  placedAtBlock?: Numeric_Comparison_Exp | null | undefined;
  placedAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  placedTxHash?: String_Comparison_Exp | null | undefined;
  price?: Numeric_Comparison_Exp | null | undefined;
  quantityRemaining?: Numeric_Comparison_Exp | null | undefined;
  rested?: Boolean_Comparison_Exp | null | undefined;
  side?: Cloborderside_Comparison_Exp | null | undefined;
  status?: Orderstatus_Comparison_Exp | null | undefined;
  userData?: Numeric_Comparison_Exp | null | undefined;
};

/** order by max() on columns of table "Order" */
export type Order_Max_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  /**
   * WHY the order was cancelled, when the protocol (not the owner) removed it. Null for
   * an owner cancel and for orders that were never cancelled.
   *
   *   SelfMatch       — same-owner match, the CancelMaker path
   *   ExceedsPosition — perps guard: filling would push the maker past maxPositionSize
   *   NegativeEquity  — perps guard: the maker's equity would go negative
   *   PreFill         — the base pre-fill guard fired with no more specific reason tag
   *
   * Recorded because it is free during this reset and would cost a whole reset later.
   * NegativeEquity is the one that motivated it: that event was never subscribed, so
   * those cancels left the order `Open` in the index forever.
   */
  cancelReason?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  /** uint128 OrderId as a decimal string (SDK canonical) */
  orderId?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  owner?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  placedTxHash?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** BINARY only (null on SPOT). The YES/NO side, mapped from BinaryPool.BinaryOrderPlaced.kind (0=BUY_YES, 1=SELL_YES, 2=BUY_NO, 3=SELL_NO) — the authoritative side-attribution source. NEVER derived from userData. Null until the paired BinaryOrderPlaced arrives (may lag OrderPlaced within a tx; upsert-safe either way). */
  side?: Order_By | null | undefined;
  status?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** order by min() on columns of table "Order" */
export type Order_Min_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  /**
   * WHY the order was cancelled, when the protocol (not the owner) removed it. Null for
   * an owner cancel and for orders that were never cancelled.
   *
   *   SelfMatch       — same-owner match, the CancelMaker path
   *   ExceedsPosition — perps guard: filling would push the maker past maxPositionSize
   *   NegativeEquity  — perps guard: the maker's equity would go negative
   *   PreFill         — the base pre-fill guard fired with no more specific reason tag
   *
   * Recorded because it is free during this reset and would cost a whole reset later.
   * NegativeEquity is the one that motivated it: that event was never subscribed, so
   * those cancels left the order `Open` in the index forever.
   */
  cancelReason?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  /** uint128 OrderId as a decimal string (SDK canonical) */
  orderId?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  owner?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  placedTxHash?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** BINARY only (null on SPOT). The YES/NO side, mapped from BinaryPool.BinaryOrderPlaced.kind (0=BUY_YES, 1=SELL_YES, 2=BUY_NO, 3=SELL_NO) — the authoritative side-attribution source. NEVER derived from userData. Null until the paired BinaryOrderPlaced arrives (may lag OrderPlaced within a tx; upsert-safe either way). */
  side?: Order_By | null | undefined;
  status?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** Ordering options when selecting data from "Order". */
export type Order_Order_By = {
  amendedFromOrderId?: Order_By | null | undefined;
  amendedToOrderId?: Order_By | null | undefined;
  cancelReason?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  isBid?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  market?: Market_Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  orderId?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  owner?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  placedTxHash?: Order_By | null | undefined;
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  rested?: Order_By | null | undefined;
  side?: Order_By | null | undefined;
  status?: Order_By | null | undefined;
  userData?: Order_By | null | undefined;
};

/** select columns of table "Order" */
export type Order_Select_Column =
  /** column name */
  | 'amendedFromOrderId'
  /** column name */
  | 'amendedToOrderId'
  /** column name */
  | 'cancelReason'
  /** column name */
  | 'expireTimestampNs'
  /** column name */
  | 'filledQuantity'
  /** column name */
  | 'fullQuantity'
  /** column name */
  | 'id'
  /** column name */
  | 'isBid'
  /** column name */
  | 'lastUpdatedAtBlock'
  /** column name */
  | 'lastUpdatedAtTimestamp'
  /** column name */
  | 'market_id'
  /** column name */
  | 'orderId'
  /** column name */
  | 'orderIdRaw'
  /** column name */
  | 'owner'
  /** column name */
  | 'placedAtBlock'
  /** column name */
  | 'placedAtTimestamp'
  /** column name */
  | 'placedTxHash'
  /** column name */
  | 'price'
  /** column name */
  | 'quantityRemaining'
  /** column name */
  | 'rested'
  /** column name */
  | 'side'
  /** column name */
  | 'status'
  /** column name */
  | 'userData';

/** select "Order_aggregate_bool_exp_bool_and_arguments_columns" columns of table "Order" */
export type Order_Select_Column_Order_Aggregate_Bool_Exp_Bool_And_Arguments_Columns =
  /** column name */
  | 'isBid'
  /** column name */
  | 'rested';

/** select "Order_aggregate_bool_exp_bool_or_arguments_columns" columns of table "Order" */
export type Order_Select_Column_Order_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns =
  /** column name */
  | 'isBid'
  /** column name */
  | 'rested';

/** order by stddev() on columns of table "Order" */
export type Order_Stddev_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** order by stddev_pop() on columns of table "Order" */
export type Order_Stddev_Pop_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** order by stddev_samp() on columns of table "Order" */
export type Order_Stddev_Samp_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** order by sum() on columns of table "Order" */
export type Order_Sum_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** order by var_pop() on columns of table "Order" */
export type Order_Var_Pop_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** order by var_samp() on columns of table "Order" */
export type Order_Var_Samp_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

/** order by variance() on columns of table "Order" */
export type Order_Variance_Order_By = {
  /** For an amended order: the id this order REPLACED (PerpPool.OrderAmended). Amendment fires alongside the replacement's OrderPlaced/OrderRested and usually the old order's OrderCancelled, all of which are already handled — so this is attribution only, linking the two rows. */
  amendedFromOrderId?: Order_By | null | undefined;
  /** For an amended order: the id that REPLACED this one. */
  amendedToOrderId?: Order_By | null | undefined;
  expireTimestampNs?: Order_By | null | undefined;
  filledQuantity?: Order_By | null | undefined;
  fullQuantity?: Order_By | null | undefined;
  lastUpdatedAtBlock?: Order_By | null | undefined;
  lastUpdatedAtTimestamp?: Order_By | null | undefined;
  /** Raw uint128 order id: (orderIndex << 64) | uniqueId */
  orderIdRaw?: Order_By | null | undefined;
  placedAtBlock?: Order_By | null | undefined;
  placedAtTimestamp?: Order_By | null | undefined;
  /** Limit price, raw quote units per whole base (BINARY: YES probability) */
  price?: Order_By | null | undefined;
  quantityRemaining?: Order_By | null | undefined;
  /** Opaque market-maker bookkeeping id round-tripped verbatim by the base OrderBook (BinaryPool v2 no longer consumes it for side derivation). NEVER decode this for YES/NO attribution — use `side` (from BinaryPool.BinaryOrderPlaced.kind) instead. 0 on SPOT / PERP. */
  userData?: Order_By | null | undefined;
};

export type OutcomeBalance_Aggregate_Bool_Exp = {
  count?: OutcomeBalance_Aggregate_Bool_Exp_Count | null | undefined;
};

export type OutcomeBalance_Aggregate_Bool_Exp_Count = {
  arguments?: Array<OutcomeBalance_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: OutcomeBalance_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** order by aggregate values of table "OutcomeBalance" */
export type OutcomeBalance_Aggregate_Order_By = {
  avg?: OutcomeBalance_Avg_Order_By | null | undefined;
  count?: Order_By | null | undefined;
  max?: OutcomeBalance_Max_Order_By | null | undefined;
  min?: OutcomeBalance_Min_Order_By | null | undefined;
  stddev?: OutcomeBalance_Stddev_Order_By | null | undefined;
  stddev_pop?: OutcomeBalance_Stddev_Pop_Order_By | null | undefined;
  stddev_samp?: OutcomeBalance_Stddev_Samp_Order_By | null | undefined;
  sum?: OutcomeBalance_Sum_Order_By | null | undefined;
  var_pop?: OutcomeBalance_Var_Pop_Order_By | null | undefined;
  var_samp?: OutcomeBalance_Var_Samp_Order_By | null | undefined;
  variance?: OutcomeBalance_Variance_Order_By | null | undefined;
};

/** order by avg() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Avg_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "OutcomeBalance". All fields are combined with a logical 'AND'. */
export type OutcomeBalance_Bool_Exp = {
  _and?: Array<OutcomeBalance_Bool_Exp> | null | undefined;
  _not?: OutcomeBalance_Bool_Exp | null | undefined;
  _or?: Array<OutcomeBalance_Bool_Exp> | null | undefined;
  account?: String_Comparison_Exp | null | undefined;
  balance?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  outcomeIndex?: Int_Comparison_Exp | null | undefined;
  tokenId?: String_Comparison_Exp | null | undefined;
};

/** order by max() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Max_Order_By = {
  account?: Order_By | null | undefined;
  balance?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
  /** ERC-6909 id (decimal string) on the shared outcome-token singleton. */
  tokenId?: Order_By | null | undefined;
};

/** order by min() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Min_Order_By = {
  account?: Order_By | null | undefined;
  balance?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
  /** ERC-6909 id (decimal string) on the shared outcome-token singleton. */
  tokenId?: Order_By | null | undefined;
};

/** select columns of table "OutcomeBalance" */
export type OutcomeBalance_Select_Column =
  /** column name */
  | 'account'
  /** column name */
  | 'balance'
  /** column name */
  | 'id'
  /** column name */
  | 'market_id'
  /** column name */
  | 'outcomeIndex'
  /** column name */
  | 'tokenId';

/** order by stddev() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Stddev_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** order by stddev_pop() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Stddev_Pop_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** order by stddev_samp() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Stddev_Samp_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** order by sum() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Sum_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** order by var_pop() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Var_Pop_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** order by var_samp() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Var_Samp_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** order by variance() on columns of table "OutcomeBalance" */
export type OutcomeBalance_Variance_Order_By = {
  balance?: Order_By | null | undefined;
  /** 0 = YES, 1 = NO */
  outcomeIndex?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "PerpFeeRecord". All fields are combined with a logical 'AND'. */
export type PerpFeeRecord_Bool_Exp = {
  _and?: Array<PerpFeeRecord_Bool_Exp> | null | undefined;
  _not?: PerpFeeRecord_Bool_Exp | null | undefined;
  _or?: Array<PerpFeeRecord_Bool_Exp> | null | undefined;
  account?: String_Comparison_Exp | null | undefined;
  amount?: Numeric_Comparison_Exp | null | undefined;
  builder?: String_Comparison_Exp | null | undefined;
  fillNotional?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  insurancePortion?: Numeric_Comparison_Exp | null | undefined;
  isRebate?: Boolean_Comparison_Exp | null | undefined;
  kind?: String_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  tier?: Numeric_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "PerpPosition". All fields are combined with a logical 'AND'. */
export type PerpPosition_Bool_Exp = {
  _and?: Array<PerpPosition_Bool_Exp> | null | undefined;
  _not?: PerpPosition_Bool_Exp | null | undefined;
  _or?: Array<PerpPosition_Bool_Exp> | null | undefined;
  account?: String_Comparison_Exp | null | undefined;
  entryFundingIndex?: Numeric_Comparison_Exp | null | undefined;
  entryPriceX18?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  isLong?: Boolean_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  realizedPnl?: Numeric_Comparison_Exp | null | undefined;
  size?: Numeric_Comparison_Exp | null | undefined;
  updatedAt?: Numeric_Comparison_Exp | null | undefined;
  updatedAtBlock?: Int_Comparison_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "ProtocolFeeRecord". All fields are combined with a logical 'AND'. */
export type ProtocolFeeRecord_Bool_Exp = {
  _and?: Array<ProtocolFeeRecord_Bool_Exp> | null | undefined;
  _not?: ProtocolFeeRecord_Bool_Exp | null | undefined;
  _or?: Array<ProtocolFeeRecord_Bool_Exp> | null | undefined;
  amount?: Numeric_Comparison_Exp | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  isTakerSide?: Boolean_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  orderId?: String_Comparison_Exp | null | undefined;
  payer?: String_Comparison_Exp | null | undefined;
  pool?: String_Comparison_Exp | null | undefined;
  recipient?: String_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  token?: String_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

/** Boolean expression to filter rows from the table "RouterActionRecord". All fields are combined with a logical 'AND'. */
export type RouterActionRecord_Bool_Exp = {
  _and?: Array<RouterActionRecord_Bool_Exp> | null | undefined;
  _not?: RouterActionRecord_Bool_Exp | null | undefined;
  _or?: Array<RouterActionRecord_Bool_Exp> | null | undefined;
  account?: String_Comparison_Exp | null | undefined;
  amount?: Numeric_Comparison_Exp | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  kind?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  operatorId?: Int_Comparison_Exp | null | undefined;
  payout?: Numeric_Comparison_Exp | null | undefined;
  routedVia?: String_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
  venueId?: String_Comparison_Exp | null | undefined;
};

export type Series_Aggregate_Bool_Exp = {
  count?: Series_Aggregate_Bool_Exp_Count | null | undefined;
};

export type Series_Aggregate_Bool_Exp_Count = {
  arguments?: Array<Series_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: Series_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** Boolean expression to filter rows from the table "Series". All fields are combined with a logical 'AND'. */
export type Series_Bool_Exp = {
  _and?: Array<Series_Bool_Exp> | null | undefined;
  _not?: Series_Bool_Exp | null | undefined;
  _or?: Array<Series_Bool_Exp> | null | undefined;
  asset?: String_Comparison_Exp | null | undefined;
  collateral?: String_Comparison_Exp | null | undefined;
  createdAtBlock?: Int_Comparison_Exp | null | undefined;
  createdAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  creator?: MarketCreator_Bool_Exp | null | undefined;
  creatorAddress?: String_Comparison_Exp | null | undefined;
  creator_id?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  intervalSec?: Numeric_Comparison_Exp | null | undefined;
  seriesId?: Int_Comparison_Exp | null | undefined;
  updatedAtBlock?: Int_Comparison_Exp | null | undefined;
  updatedAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
};

/** select columns of table "Series" */
export type Series_Select_Column =
  /** column name */
  | 'asset'
  /** column name */
  | 'collateral'
  /** column name */
  | 'createdAtBlock'
  /** column name */
  | 'createdAtTimestamp'
  /** column name */
  | 'creatorAddress'
  /** column name */
  | 'creator_id'
  /** column name */
  | 'id'
  /** column name */
  | 'intervalSec'
  /** column name */
  | 'seriesId'
  /** column name */
  | 'updatedAtBlock'
  /** column name */
  | 'updatedAtTimestamp';

/** Boolean expression to filter rows from the table "SettlementFeeRecord". All fields are combined with a logical 'AND'. */
export type SettlementFeeRecord_Bool_Exp = {
  _and?: Array<SettlementFeeRecord_Bool_Exp> | null | undefined;
  _not?: SettlementFeeRecord_Bool_Exp | null | undefined;
  _or?: Array<SettlementFeeRecord_Bool_Exp> | null | undefined;
  blockNumber?: Numeric_Comparison_Exp | null | undefined;
  fee?: Numeric_Comparison_Exp | null | undefined;
  feeRecipient?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
  winningBacking?: Numeric_Comparison_Exp | null | undefined;
};

export type StopOrder_Aggregate_Bool_Exp = {
  bool_and?: StopOrder_Aggregate_Bool_Exp_Bool_And | null | undefined;
  bool_or?: StopOrder_Aggregate_Bool_Exp_Bool_Or | null | undefined;
  count?: StopOrder_Aggregate_Bool_Exp_Count | null | undefined;
};

export type StopOrder_Aggregate_Bool_Exp_Bool_And = {
  arguments: StopOrder_Select_Column_StopOrder_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: StopOrder_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type StopOrder_Aggregate_Bool_Exp_Bool_Or = {
  arguments: StopOrder_Select_Column_StopOrder_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: StopOrder_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type StopOrder_Aggregate_Bool_Exp_Count = {
  arguments?: Array<StopOrder_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: StopOrder_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** order by aggregate values of table "StopOrder" */
export type StopOrder_Aggregate_Order_By = {
  avg?: StopOrder_Avg_Order_By | null | undefined;
  count?: Order_By | null | undefined;
  max?: StopOrder_Max_Order_By | null | undefined;
  min?: StopOrder_Min_Order_By | null | undefined;
  stddev?: StopOrder_Stddev_Order_By | null | undefined;
  stddev_pop?: StopOrder_Stddev_Pop_Order_By | null | undefined;
  stddev_samp?: StopOrder_Stddev_Samp_Order_By | null | undefined;
  sum?: StopOrder_Sum_Order_By | null | undefined;
  var_pop?: StopOrder_Var_Pop_Order_By | null | undefined;
  var_samp?: StopOrder_Var_Samp_Order_By | null | undefined;
  variance?: StopOrder_Variance_Order_By | null | undefined;
};

/** order by avg() on columns of table "StopOrder" */
export type StopOrder_Avg_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** Boolean expression to filter rows from the table "StopOrder". All fields are combined with a logical 'AND'. */
export type StopOrder_Bool_Exp = {
  _and?: Array<StopOrder_Bool_Exp> | null | undefined;
  _not?: StopOrder_Bool_Exp | null | undefined;
  _or?: Array<StopOrder_Bool_Exp> | null | undefined;
  builder?: String_Comparison_Exp | null | undefined;
  builderFeeBpsTimes1k?: Numeric_Comparison_Exp | null | undefined;
  createdAt?: Numeric_Comparison_Exp | null | undefined;
  dropReason?: Int_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  isBid?: Boolean_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  orderIdRaw?: Numeric_Comparison_Exp | null | undefined;
  orderType?: Int_Comparison_Exp | null | undefined;
  owner?: String_Comparison_Exp | null | undefined;
  placedOrderId?: Numeric_Comparison_Exp | null | undefined;
  quantity?: Numeric_Comparison_Exp | null | undefined;
  registry?: String_Comparison_Exp | null | undefined;
  status?: Stoporderstatus_Comparison_Exp | null | undefined;
  triggerOperator?: Int_Comparison_Exp | null | undefined;
  triggerPrice?: Numeric_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
  updatedAt?: Numeric_Comparison_Exp | null | undefined;
};

/** order by max() on columns of table "StopOrder" */
export type StopOrder_Max_Order_By = {
  builder?: Order_By | null | undefined;
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  owner?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  registry?: Order_By | null | undefined;
  status?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  txHash?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** order by min() on columns of table "StopOrder" */
export type StopOrder_Min_Order_By = {
  builder?: Order_By | null | undefined;
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  id?: Order_By | null | undefined;
  market_id?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  owner?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  registry?: Order_By | null | undefined;
  status?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  txHash?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** select columns of table "StopOrder" */
export type StopOrder_Select_Column =
  /** column name */
  | 'builder'
  /** column name */
  | 'builderFeeBpsTimes1k'
  /** column name */
  | 'createdAt'
  /** column name */
  | 'dropReason'
  /** column name */
  | 'id'
  /** column name */
  | 'isBid'
  /** column name */
  | 'market_id'
  /** column name */
  | 'orderIdRaw'
  /** column name */
  | 'orderType'
  /** column name */
  | 'owner'
  /** column name */
  | 'placedOrderId'
  /** column name */
  | 'quantity'
  /** column name */
  | 'registry'
  /** column name */
  | 'status'
  /** column name */
  | 'triggerOperator'
  /** column name */
  | 'triggerPrice'
  /** column name */
  | 'txHash'
  /** column name */
  | 'updatedAt';

/** select "StopOrder_aggregate_bool_exp_bool_and_arguments_columns" columns of table "StopOrder" */
export type StopOrder_Select_Column_StopOrder_Aggregate_Bool_Exp_Bool_And_Arguments_Columns =
  /** column name */
  | 'isBid';

/** select "StopOrder_aggregate_bool_exp_bool_or_arguments_columns" columns of table "StopOrder" */
export type StopOrder_Select_Column_StopOrder_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns =
  /** column name */
  | 'isBid';

/** order by stddev() on columns of table "StopOrder" */
export type StopOrder_Stddev_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** order by stddev_pop() on columns of table "StopOrder" */
export type StopOrder_Stddev_Pop_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** order by stddev_samp() on columns of table "StopOrder" */
export type StopOrder_Stddev_Samp_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** order by sum() on columns of table "StopOrder" */
export type StopOrder_Sum_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** order by var_pop() on columns of table "StopOrder" */
export type StopOrder_Var_Pop_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** order by var_samp() on columns of table "StopOrder" */
export type StopOrder_Var_Samp_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** order by variance() on columns of table "StopOrder" */
export type StopOrder_Variance_Order_By = {
  /**
   * PERP only — the builder fee the triggered IOC will charge, in bps x 1000 (so 1500 =
   * 1.5bps). Zero on a spot stop, whose registry event carries no such field.
   *
   * Indexed because this is the only chance to capture it. The registry deletes a pending
   * order on every fire, so once triggered nothing on chain can answer what fee was
   * agreed, and `PendingOrderCreated` is the sole record — a column added later would be
   * null for every order that has already fired, and populating it would need another
   * full reindex.
   */
  builderFeeBpsTimes1k?: Order_By | null | undefined;
  createdAt?: Order_By | null | undefined;
  /**
   * PERP only — WHY a trigger placed nothing, when `status` is TRIGGER_FAILED.
   *
   *   0 None                    (unused here; a successful trigger records null)
   *   1 ReduceOnlyNoPosition    fired with no position left to reduce
   *   2 ReduceOnlyWrongSide     the position flipped before it fired
   *   3 ReduceOnlyBelowMinQty   what remained was below the pool's minimum
   *   4 PlacementFailed         the pool rejected the order outright
   *
   * Null on spot, and null on success. The distinction is load-bearing for a UI: 1-3 are
   * ordinary outcomes of a stop that was overtaken by events, while 4 is a real failure —
   * collapsing them to "failed" makes routine behaviour look broken. SOMI is consumed on
   * every fire regardless.
   */
  dropReason?: Order_By | null | undefined;
  orderIdRaw?: Order_By | null | undefined;
  /** 0 = LIMIT, 1 = MARKET */
  orderType?: Order_By | null | undefined;
  /**
   * Pool order id created on a successful trigger — a SpotPool order for a SPOT market,
   * a PerpPool order for a PERP one. Null until triggered, and null on a trigger that
   * fired but placed nothing (see dropReason). Renamed from `spotOrderId` when perps
   * joined this entity: one registry shape serves both, and a spot-only name on a shared
   * column reads as "perps do not trigger", which is the opposite of true.
   */
  placedOrderId?: Order_By | null | undefined;
  quantity?: Order_By | null | undefined;
  /** 0 = GTE, 1 = LTE (mark price vs trigger price) */
  triggerOperator?: Order_By | null | undefined;
  triggerPrice?: Order_By | null | undefined;
  updatedAt?: Order_By | null | undefined;
};

/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
export type String_Array_Comparison_Exp = {
  /** is the array contained in the given array value */
  _contained_in?: Array<string> | null | undefined;
  /** does the array contain the given value */
  _contains?: Array<string> | null | undefined;
  _eq?: Array<string> | null | undefined;
  _gt?: Array<string> | null | undefined;
  _gte?: Array<string> | null | undefined;
  _in?: Array<Array<string>> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: Array<string> | null | undefined;
  _lte?: Array<string> | null | undefined;
  _neq?: Array<string> | null | undefined;
  _nin?: Array<Array<string>> | null | undefined;
};

/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
export type String_Comparison_Exp = {
  _eq?: string | null | undefined;
  _gt?: string | null | undefined;
  _gte?: string | null | undefined;
  /** does the column match the given case-insensitive pattern */
  _ilike?: string | null | undefined;
  _in?: Array<string> | null | undefined;
  /** does the column match the given POSIX regular expression, case insensitive */
  _iregex?: string | null | undefined;
  _is_null?: boolean | null | undefined;
  /** does the column match the given pattern */
  _like?: string | null | undefined;
  _lt?: string | null | undefined;
  _lte?: string | null | undefined;
  _neq?: string | null | undefined;
  /** does the column NOT match the given case-insensitive pattern */
  _nilike?: string | null | undefined;
  _nin?: Array<string> | null | undefined;
  /** does the column NOT match the given POSIX regular expression, case insensitive */
  _niregex?: string | null | undefined;
  /** does the column NOT match the given pattern */
  _nlike?: string | null | undefined;
  /** does the column NOT match the given POSIX regular expression, case sensitive */
  _nregex?: string | null | undefined;
  /** does the column NOT match the given SQL regular expression */
  _nsimilar?: string | null | undefined;
  /** does the column match the given POSIX regular expression, case sensitive */
  _regex?: string | null | undefined;
  /** does the column match the given SQL regular expression */
  _similar?: string | null | undefined;
};

/** Boolean expression to filter rows from the table "VaultPayoutFallback". All fields are combined with a logical 'AND'. */
export type VaultPayoutFallback_Bool_Exp = {
  _and?: Array<VaultPayoutFallback_Bool_Exp> | null | undefined;
  _not?: VaultPayoutFallback_Bool_Exp | null | undefined;
  _or?: Array<VaultPayoutFallback_Bool_Exp> | null | undefined;
  amount?: Numeric_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  market?: Market_Bool_Exp | null | undefined;
  market_id?: String_Comparison_Exp | null | undefined;
  owner?: String_Comparison_Exp | null | undefined;
  timestamp?: Numeric_Comparison_Exp | null | undefined;
  token?: String_Comparison_Exp | null | undefined;
  txHash?: String_Comparison_Exp | null | undefined;
};

export type Venue_Aggregate_Bool_Exp = {
  bool_and?: Venue_Aggregate_Bool_Exp_Bool_And | null | undefined;
  bool_or?: Venue_Aggregate_Bool_Exp_Bool_Or | null | undefined;
  count?: Venue_Aggregate_Bool_Exp_Count | null | undefined;
};

export type Venue_Aggregate_Bool_Exp_Bool_And = {
  arguments: Venue_Select_Column_Venue_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: Venue_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type Venue_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Venue_Select_Column_Venue_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: boolean | null | undefined;
  filter?: Venue_Bool_Exp | null | undefined;
  predicate: Boolean_Comparison_Exp;
};

export type Venue_Aggregate_Bool_Exp_Count = {
  arguments?: Array<Venue_Select_Column> | null | undefined;
  distinct?: boolean | null | undefined;
  filter?: Venue_Bool_Exp | null | undefined;
  predicate: Int_Comparison_Exp;
};

/** Boolean expression to filter rows from the table "Venue". All fields are combined with a logical 'AND'. */
export type Venue_Bool_Exp = {
  _and?: Array<Venue_Bool_Exp> | null | undefined;
  _not?: Venue_Bool_Exp | null | undefined;
  _or?: Array<Venue_Bool_Exp> | null | undefined;
  builderFeesCollected?: Numeric_Comparison_Exp | null | undefined;
  context?: String_Comparison_Exp | null | undefined;
  createdAtBlock?: Numeric_Comparison_Exp | null | undefined;
  createdAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  creationEnabled?: Boolean_Comparison_Exp | null | undefined;
  cumulativeQuoteVolume?: Numeric_Comparison_Exp | null | undefined;
  feeParams?: String_Comparison_Exp | null | undefined;
  feeRecipientOverride?: String_Comparison_Exp | null | undefined;
  id?: String_Comparison_Exp | null | undefined;
  marketCount?: Int_Comparison_Exp | null | undefined;
  marketType?: String_Comparison_Exp | null | undefined;
  operator?: Operator_Bool_Exp | null | undefined;
  operatorId?: Int_Comparison_Exp | null | undefined;
  operator_id?: String_Comparison_Exp | null | undefined;
  policy?: String_Comparison_Exp | null | undefined;
  protocolFeesCollected?: Numeric_Comparison_Exp | null | undefined;
  settlementFeesCollected?: Numeric_Comparison_Exp | null | undefined;
  signer?: String_Comparison_Exp | null | undefined;
  updatedAtBlock?: Numeric_Comparison_Exp | null | undefined;
  updatedAtTimestamp?: Numeric_Comparison_Exp | null | undefined;
  venueId?: String_Comparison_Exp | null | undefined;
};

/** select columns of table "Venue" */
export type Venue_Select_Column =
  /** column name */
  | 'builderFeesCollected'
  /** column name */
  | 'context'
  /** column name */
  | 'createdAtBlock'
  /** column name */
  | 'createdAtTimestamp'
  /** column name */
  | 'creationEnabled'
  /** column name */
  | 'cumulativeQuoteVolume'
  /** column name */
  | 'feeParams'
  /** column name */
  | 'feeRecipientOverride'
  /** column name */
  | 'id'
  /** column name */
  | 'marketCount'
  /** column name */
  | 'marketType'
  /** column name */
  | 'operatorId'
  /** column name */
  | 'operator_id'
  /** column name */
  | 'policy'
  /** column name */
  | 'protocolFeesCollected'
  /** column name */
  | 'settlementFeesCollected'
  /** column name */
  | 'signer'
  /** column name */
  | 'updatedAtBlock'
  /** column name */
  | 'updatedAtTimestamp'
  /** column name */
  | 'venueId';

/** select "Venue_aggregate_bool_exp_bool_and_arguments_columns" columns of table "Venue" */
export type Venue_Select_Column_Venue_Aggregate_Bool_Exp_Bool_And_Arguments_Columns =
  /** column name */
  | 'creationEnabled';

/** select "Venue_aggregate_bool_exp_bool_or_arguments_columns" columns of table "Venue" */
export type Venue_Select_Column_Venue_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns =
  /** column name */
  | 'creationEnabled';

/** Boolean expression to compare columns of type "clobfillkind". All fields are combined with logical 'AND'. */
export type Clobfillkind_Comparison_Exp = {
  _eq?: BinaryFillKind | null | undefined;
  _gt?: BinaryFillKind | null | undefined;
  _gte?: BinaryFillKind | null | undefined;
  _in?: Array<BinaryFillKind> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: BinaryFillKind | null | undefined;
  _lte?: BinaryFillKind | null | undefined;
  _neq?: BinaryFillKind | null | undefined;
  _nin?: Array<BinaryFillKind> | null | undefined;
};

/** Boolean expression to compare columns of type "clobmarketstatus". All fields are combined with logical 'AND'. */
export type Clobmarketstatus_Comparison_Exp = {
  _eq?: BinaryMarketStatus | null | undefined;
  _gt?: BinaryMarketStatus | null | undefined;
  _gte?: BinaryMarketStatus | null | undefined;
  _in?: Array<BinaryMarketStatus> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: BinaryMarketStatus | null | undefined;
  _lte?: BinaryMarketStatus | null | undefined;
  _neq?: BinaryMarketStatus | null | undefined;
  _nin?: Array<BinaryMarketStatus> | null | undefined;
};

/** Boolean expression to compare columns of type "cloborderside". All fields are combined with logical 'AND'. */
export type Cloborderside_Comparison_Exp = {
  _eq?: BinarySide | null | undefined;
  _gt?: BinarySide | null | undefined;
  _gte?: BinarySide | null | undefined;
  _in?: Array<BinarySide> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: BinarySide | null | undefined;
  _lte?: BinarySide | null | undefined;
  _neq?: BinarySide | null | undefined;
  _nin?: Array<BinarySide> | null | undefined;
};

/** Boolean expression to compare columns of type "markettype". All fields are combined with logical 'AND'. */
export type Markettype_Comparison_Exp = {
  _eq?: MarketType | null | undefined;
  _gt?: MarketType | null | undefined;
  _gte?: MarketType | null | undefined;
  _in?: Array<MarketType> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: MarketType | null | undefined;
  _lte?: MarketType | null | undefined;
  _neq?: MarketType | null | undefined;
  _nin?: Array<MarketType> | null | undefined;
};

/** Boolean expression to compare columns of type "numeric". All fields are combined with logical 'AND'. */
export type Numeric_Comparison_Exp = {
  _eq?: string | null | undefined;
  _gt?: string | null | undefined;
  _gte?: string | null | undefined;
  _in?: Array<string> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: string | null | undefined;
  _lte?: string | null | undefined;
  _neq?: string | null | undefined;
  _nin?: Array<string> | null | undefined;
};

/** column ordering options */
export type Order_By =
  /** in ascending order, nulls last */
  | 'asc'
  /** in ascending order, nulls first */
  | 'asc_nulls_first'
  /** in ascending order, nulls last */
  | 'asc_nulls_last'
  /** in descending order, nulls first */
  | 'desc'
  /** in descending order, nulls first */
  | 'desc_nulls_first'
  /** in descending order, nulls last */
  | 'desc_nulls_last';

/** Boolean expression to compare columns of type "orderstatus". All fields are combined with logical 'AND'. */
export type Orderstatus_Comparison_Exp = {
  _eq?: OrderStatus | null | undefined;
  _gt?: OrderStatus | null | undefined;
  _gte?: OrderStatus | null | undefined;
  _in?: Array<OrderStatus> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: OrderStatus | null | undefined;
  _lte?: OrderStatus | null | undefined;
  _neq?: OrderStatus | null | undefined;
  _nin?: Array<OrderStatus> | null | undefined;
};

/** Boolean expression to compare columns of type "stoporderstatus". All fields are combined with logical 'AND'. */
export type Stoporderstatus_Comparison_Exp = {
  _eq?: StopOrderStatus | null | undefined;
  _gt?: StopOrderStatus | null | undefined;
  _gte?: StopOrderStatus | null | undefined;
  _in?: Array<StopOrderStatus> | null | undefined;
  _is_null?: boolean | null | undefined;
  _lt?: StopOrderStatus | null | undefined;
  _lte?: StopOrderStatus | null | undefined;
  _neq?: StopOrderStatus | null | undefined;
  _nin?: Array<StopOrderStatus> | null | undefined;
};

export type PortfolioMarketFieldsFragment = { id: string, marketAddress: string | null, poolAddress: string, asset: string | null, question: string | null, lastPrice: string | null, strike: string | null, expiry: string | null, winningOutcome: number | null, voided: boolean, quoteDecimals: number, intervalSec: string | null, status: BinaryMarketStatus | null };

export type PortfolioQueryVariables = Exact<{
  acct: string;
  fillWhere: Fill_Bool_Exp;
  ordersLimit?: number | null | undefined;
  tradesLimit?: number | null | undefined;
}>;


export type PortfolioQuery = { OutcomeBalance: Array<{ outcomeIndex: number, tokenId: string, balance: string, market: { id: string, marketAddress: string | null, poolAddress: string, asset: string | null, question: string | null, lastPrice: string | null, strike: string | null, expiry: string | null, winningOutcome: number | null, voided: boolean, quoteDecimals: number, intervalSec: string | null, status: BinaryMarketStatus | null } | null }>, ClobOrder: Array<{ id: string, orderId: string, side: BinarySide | null, price: string, quantityRemaining: string, filledQuantity: string, fullQuantity: string, placedAtTimestamp: string, placedTxHash: string, market: { id: string, marketAddress: string | null, poolAddress: string, asset: string | null, question: string | null, lastPrice: string | null, strike: string | null, expiry: string | null, winningOutcome: number | null, voided: boolean, quoteDecimals: number, intervalSec: string | null, status: BinaryMarketStatus | null } | null }>, ClobFill: Array<{ id: string, fillPrice: string, quantity: string, timestamp: string, txHash: string, maker: string | null, makerSide: BinarySide | null, takerOrder: { owner: string, side: BinarySide | null } | null, market: { marketAddress: string | null, asset: string | null, quoteDecimals: number } | null }> };

export type OutcomeBalancesQueryVariables = Exact<{
  acct: string;
  mkt: string;
}>;


export type OutcomeBalancesQuery = { OutcomeBalance: Array<{ outcomeIndex: number, balance: string }> };

export type VaultPayoutFallbacksQueryVariables = Exact<{
  where: VaultPayoutFallback_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type VaultPayoutFallbacksQuery = { VaultPayoutFallback: Array<{ id: string, owner: string, token: string, amount: string, timestamp: string, txHash: string, market: string }> };

export type MarketResolutionQueryVariables = Exact<{
  id: string;
}>;


export type MarketResolutionQuery = { MarketResolutionEvent: Array<{ id: string, kind: string, payoutNumerators: Array<string> | null, payoutDenominator: string | null, voided: boolean | null, blockNumber: string, timestamp: string, txHash: string, market: string, winningOutcome: number | null }>, MarketReferenceLink: Array<{ id: string, pending: boolean, market: string, oracleQuestionId: string }>, Market_by_pk: { oracleQuestionId: string | null } | null };

export type OracleAnswersQueryVariables = Exact<{
  closingQid: string;
  openingQid: string;
}>;


export type OracleAnswersQuery = { closing: { oracleQuestionId: string, numericValue: string | null, outcomeLabel: string | null, voidReason: number | null, resolvedAt: string | null, txHash: string | null } | null, opening: { oracleQuestionId: string, numericValue: string | null, outcomeLabel: string | null, voidReason: number | null, resolvedAt: string | null, txHash: string | null } | null };

export type CandlesQueryVariables = Exact<{
  where: Candle_Bool_Exp;
  limit?: number | null | undefined;
}>;


export type CandlesQuery = { Candle: Array<{ bucketStart: string, openPrice: string, high: string, low: string, closePrice: string, baseVolume: string, quoteVolume: string, tradeCount: number }> };

export type ProtocolFeeFieldsFragment = { id: string, orderId: string, recipient: string, payer: string | null, token: string, amount: string, isTakerSide: boolean, pool: string, timestamp: string, txHash: string, market: string };

export type BuilderFeeFieldsFragment = { id: string, orderId: string, builder: string, payer: string | null, token: string, amount: string, pool: string, timestamp: string, txHash: string, market: string };

export type SettlementFeeFieldsFragment = { id: string, winningBacking: string, timestamp: string, txHash: string, recipient: string, amount: string, market: string };

export type BuilderApprovalsQueryVariables = Exact<{
  where: BuilderApproval_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type BuilderApprovalsQuery = { BuilderApproval: Array<{ id: string, market_id: string, user: string, builder: string, maxFeeBpsTimes1k: string, blockNumber: string, timestamp: string, txHash: string, market: { poolAddress: string } | null }> };

export type ProtocolFeesQueryVariables = Exact<{
  where: ProtocolFeeRecord_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type ProtocolFeesQuery = { ProtocolFeeRecord: Array<{ id: string, orderId: string, recipient: string, payer: string | null, token: string, amount: string, isTakerSide: boolean, pool: string, timestamp: string, txHash: string, market: string }> };

export type BuilderFeesQueryVariables = Exact<{
  where: BuilderFeeRecord_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type BuilderFeesQuery = { BuilderFeeRecord: Array<{ id: string, orderId: string, builder: string, payer: string | null, token: string, amount: string, pool: string, timestamp: string, txHash: string, market: string }> };

export type SettlementFeesQueryVariables = Exact<{
  where: SettlementFeeRecord_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type SettlementFeesQuery = { SettlementFeeRecord: Array<{ id: string, winningBacking: string, timestamp: string, txHash: string, recipient: string, amount: string, market: string }> };

export type FillQueryFieldsFragment = { id: string, pool: string, fillPrice: string, quantity: string, quoteQuantity: string, maker: string | null, makerSide: BinarySide | null, taker: string | null, takerSide: BinarySide | null, kind: BinaryFillKind | null, takerIsBid: boolean | null, timestamp: string, txHash: string, market: string, takerOrder: { owner: string, side: BinarySide | null } | null };

export type FillsQueryVariables = Exact<{
  where: Fill_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type FillsQuery = { Fill: Array<{ id: string, pool: string, fillPrice: string, quantity: string, quoteQuantity: string, maker: string | null, makerSide: BinarySide | null, taker: string | null, takerSide: BinarySide | null, kind: BinaryFillKind | null, takerIsBid: boolean | null, timestamp: string, txHash: string, market: string, takerOrder: { owner: string, side: BinarySide | null } | null }> };

export type UserFillsQueryVariables = Exact<{
  where: Fill_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type UserFillsQuery = { Fill: Array<{ id: string, pool: string, fillPrice: string, quantity: string, quoteQuantity: string, maker: string | null, makerSide: BinarySide | null, taker: string | null, takerSide: BinarySide | null, kind: BinaryFillKind | null, takerIsBid: boolean | null, timestamp: string, txHash: string, market: string, takerOrder: { owner: string, side: BinarySide | null } | null }> };

export type SeriesFieldsFragment = { id: string, creatorAddress: string, seriesId: number, collateral: string, asset: string, intervalSec: string, createdAtTimestamp: string | null, updatedAtTimestamp: string | null };

export type MarketCreatorFieldsFragment = { id: string, owner: string, policy: string, core: string, adapter: string, operatorId: number, venueId: string, factory: string | null, createdAtBlock: number | null, createdAtTimestamp: string | null };

export type OracleAdapterFieldsFragment = { id: string, owner: string, factory: string | null, approved: boolean, approvedAtTimestamp: string | null, createdAtTimestamp: string | null };

export type MarketCreatorsQueryVariables = Exact<{
  where: MarketCreator_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type MarketCreatorsQuery = { MarketCreator: Array<{ id: string, owner: string, policy: string, core: string, adapter: string, operatorId: number, venueId: string, factory: string | null, createdAtBlock: number | null, createdAtTimestamp: string | null, series: Array<{ id: string, creatorAddress: string, seriesId: number, collateral: string, asset: string, intervalSec: string, createdAtTimestamp: string | null, updatedAtTimestamp: string | null }> }> };

export type MarketCreatorByPkQueryVariables = Exact<{
  id: string;
}>;


export type MarketCreatorByPkQuery = { MarketCreator_by_pk: { id: string, owner: string, policy: string, core: string, adapter: string, operatorId: number, venueId: string, factory: string | null, createdAtBlock: number | null, createdAtTimestamp: string | null, series: Array<{ id: string, creatorAddress: string, seriesId: number, collateral: string, asset: string, intervalSec: string, createdAtTimestamp: string | null, updatedAtTimestamp: string | null }> } | null };

export type OracleAdaptersQueryVariables = Exact<{
  where: OracleAdapter_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OracleAdaptersQuery = { OracleAdapter: Array<{ id: string, owner: string, factory: string | null, approved: boolean, approvedAtTimestamp: string | null, createdAtTimestamp: string | null }> };

export type OracleAdapterByPkQueryVariables = Exact<{
  id: string;
}>;


export type OracleAdapterByPkQuery = { OracleAdapter_by_pk: { id: string, owner: string, factory: string | null, approved: boolean, approvedAtTimestamp: string | null, createdAtTimestamp: string | null } | null };

export type SeriesListQueryVariables = Exact<{
  where: Series_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type SeriesListQuery = { Series: Array<{ id: string, creatorAddress: string, seriesId: number, collateral: string, asset: string, intervalSec: string, createdAtTimestamp: string | null, updatedAtTimestamp: string | null }> };

export type MarketFieldsFragment = { id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null };

export type RegistryMarketsQueryVariables = Exact<{
  where: Market_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type RegistryMarketsQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type MarketsQueryVariables = Exact<{
  where: Market_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type MarketsQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type MarketByPkQueryVariables = Exact<{
  id: string;
}>;


export type MarketByPkQuery = { Market_by_pk: { id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null } | null };

export type MarketByAddressQueryVariables = Exact<{
  a: string;
}>;


export type MarketByAddressQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type BinaryMarketsQueryVariables = Exact<{
  where: Market_Bool_Exp;
  orderBy?: Array<Market_Order_By> | Market_Order_By | null | undefined;
  limit?: number | null | undefined;
}>;


export type BinaryMarketsQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type SpotMarketsQueryVariables = Exact<{
  where: Market_Bool_Exp;
  limit?: number | null | undefined;
}>;


export type SpotMarketsQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type PerpMarketsQueryVariables = Exact<{
  where: Market_Bool_Exp;
  limit?: number | null | undefined;
}>;


export type PerpMarketsQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type LiveBinaryMarketsQueryVariables = Exact<{
  where: Market_Bool_Exp;
  orderBy?: Array<Market_Order_By> | Market_Order_By | null | undefined;
  limit: number;
  offset: number;
}>;


export type LiveBinaryMarketsQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type PastBinaryMarketsQueryVariables = Exact<{
  where: Market_Bool_Exp;
  limit: number;
  offset: number;
}>;


export type PastBinaryMarketsQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type BinaryOriginPairsQueryVariables = Exact<{ [key: string]: never; }>;


export type BinaryOriginPairsQuery = { Market: Array<{ operatorId: number | null, venueId: string | null }> };

export type BinaryAssetsQueryVariables = Exact<{ [key: string]: never; }>;


export type BinaryAssetsQuery = { Market: Array<{ asset: string | null }> };

export type MarketFeesQueryVariables = Exact<{
  id: string;
}>;


export type MarketFeesQuery = { MarketVenue_by_pk: { operatorId: number, venueId: string, feeRecipient: string | null, makerFeeBps: string | null, takerFeeBps: string | null, maxBuilderFeeBps: string | null, routingFeeBps: string | null, settlementFeeBps: string | null, settlementFeesCollected: string | null } | null };

export type MarketStatusHistoryQueryVariables = Exact<{
  id: string;
}>;


export type MarketStatusHistoryQuery = { MarketStatusUpdate: Array<{ oldStatus: BinaryMarketStatus, newStatus: BinaryMarketStatus, blockNumber: string, timestamp: string, txHash: string }> };

export type OpeningAnswersQueryVariables = Exact<{
  qids?: Array<string> | string | null | undefined;
}>;


export type OpeningAnswersQuery = { OracleAnswer: Array<{ id: string, numericValue: string | null }> };

export type OpeningRefsQueryVariables = Exact<{
  ids?: Array<string> | string | null | undefined;
}>;


export type OpeningRefsQuery = { MarketReferenceLink: Array<{ referenceQuestionId: string, market: string }> };

export type OperatorFieldsFragment = { operatorId: number, owner: string, feeRecipient: string, enabled: boolean, policy: string, context: string, pendingOwner: string | null, venueCount: number, createdAtTimestamp: string, updatedAtTimestamp: string, marketCount: number, cumulativeQuoteVolume: string, protocolFeesCollected: string, settlementFeesCollected: string, builderFeesCollected: string };

export type VenueFieldsFragment = { venueId: string, operatorId: number, marketType: string, feeParams: string, feeRecipientOverride: string, policy: string, signer: string, creationEnabled: boolean, context: string, createdAtTimestamp: string, updatedAtTimestamp: string, marketCount: number, cumulativeQuoteVolume: string, protocolFeesCollected: string, settlementFeesCollected: string, builderFeesCollected: string };

export type OperatorsQueryVariables = Exact<{
  where: Operator_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OperatorsQuery = { Operator: Array<{ operatorId: number, owner: string, feeRecipient: string, enabled: boolean, policy: string, context: string, pendingOwner: string | null, venueCount: number, createdAtTimestamp: string, updatedAtTimestamp: string, marketCount: number, cumulativeQuoteVolume: string, protocolFeesCollected: string, settlementFeesCollected: string, builderFeesCollected: string }> };

export type OperatorByPkQueryVariables = Exact<{
  id: string;
}>;


export type OperatorByPkQuery = { Operator_by_pk: { operatorId: number, owner: string, feeRecipient: string, enabled: boolean, policy: string, context: string, pendingOwner: string | null, venueCount: number, createdAtTimestamp: string, updatedAtTimestamp: string, marketCount: number, cumulativeQuoteVolume: string, protocolFeesCollected: string, settlementFeesCollected: string, builderFeesCollected: string } | null };

export type VenuesQueryVariables = Exact<{
  where: Venue_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type VenuesQuery = { Venue: Array<{ venueId: string, operatorId: number, marketType: string, feeParams: string, feeRecipientOverride: string, policy: string, signer: string, creationEnabled: boolean, context: string, createdAtTimestamp: string, updatedAtTimestamp: string, marketCount: number, cumulativeQuoteVolume: string, protocolFeesCollected: string, settlementFeesCollected: string, builderFeesCollected: string }> };

export type VenueByPkQueryVariables = Exact<{
  id: string;
}>;


export type VenueByPkQuery = { Venue_by_pk: { venueId: string, operatorId: number, marketType: string, feeParams: string, feeRecipientOverride: string, policy: string, signer: string, creationEnabled: boolean, context: string, createdAtTimestamp: string, updatedAtTimestamp: string, marketCount: number, cumulativeQuoteVolume: string, protocolFeesCollected: string, settlementFeesCollected: string, builderFeesCollected: string } | null };

export type OracleQuestionFieldsFragment = { id: string, questionKey: string, scheduler: string, oracleCost: string, bindCount: number, reuseCount: number, createdAtBlock: string, createdAtTimestamp: string };

export type OperatorHubAccountFieldsFragment = { id: string, operatorId: number, earmarked: string, credit: string, outstanding: string, createdAtBlock: string, createdAtTimestamp: string, updatedAtBlock: string, updatedAtTimestamp: string };

export type OracleBindFieldsFragment = { id: string, oracleQuestionId: string, bindIndex: number, operatorId: number, measuredGas: string | null, overheadShare: string | null, cost: string | null, charged: string | null, subsidy: string | null, resolvedAt: string | null, boundAtBlock: string, boundAtTimestamp: string, txHash: string };

export type OracleCallbackFieldsFragment = { id: string, marketsResolved: string, gasPrice: string, measuredGas: string, overheadGasAttributed: string, totalCost: string, totalCharged: string, subsidy: string, pendingRemaining: string, blockNumber: string, timestamp: string, txHash: string };

export type OracleQuestionQueryVariables = Exact<{
  id: string;
}>;


export type OracleQuestionQuery = { OracleQuestion_by_pk: { id: string, questionKey: string, scheduler: string, oracleCost: string, bindCount: number, reuseCount: number, createdAtBlock: string, createdAtTimestamp: string } | null };

export type OracleQuestionsQueryVariables = Exact<{
  where: OracleQuestion_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OracleQuestionsQuery = { OracleQuestion: Array<{ id: string, questionKey: string, scheduler: string, oracleCost: string, bindCount: number, reuseCount: number, createdAtBlock: string, createdAtTimestamp: string }> };

export type OperatorHubAccountQueryVariables = Exact<{
  id: string;
}>;


export type OperatorHubAccountQuery = { OperatorHubAccount_by_pk: { id: string, operatorId: number, earmarked: string, credit: string, outstanding: string, createdAtBlock: string, createdAtTimestamp: string, updatedAtBlock: string, updatedAtTimestamp: string } | null };

export type OperatorHubAccountsQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OperatorHubAccountsQuery = { OperatorHubAccount: Array<{ id: string, operatorId: number, earmarked: string, credit: string, outstanding: string, createdAtBlock: string, createdAtTimestamp: string, updatedAtBlock: string, updatedAtTimestamp: string }> };

export type OracleBindsQueryVariables = Exact<{
  where: OracleBind_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OracleBindsQuery = { OracleBind: Array<{ id: string, oracleQuestionId: string, bindIndex: number, operatorId: number, measuredGas: string | null, overheadShare: string | null, cost: string | null, charged: string | null, subsidy: string | null, resolvedAt: string | null, boundAtBlock: string, boundAtTimestamp: string, txHash: string }> };

export type OracleCallbacksQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OracleCallbacksQuery = { OracleCallback: Array<{ id: string, marketsResolved: string, gasPrice: string, measuredGas: string, overheadGasAttributed: string, totalCost: string, totalCharged: string, subsidy: string, pendingRemaining: string, blockNumber: string, timestamp: string, txHash: string }> };

export type OrderMarketFieldsFragment = { marketAddress: string | null, asset: string | null, question: string | null, expiry: string | null, tradingStart: string | null, quoteDecimals: number, intervalSec: string | null };

export type SweepableOrdersQueryVariables = Exact<{
  where: Order_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type SweepableOrdersQuery = { Order: Array<{ id: string, orderId: string, owner: string, isBid: boolean, price: string, quantityRemaining: string, expireTimestampNs: string, placedAtTimestamp: string, market: string, marketRow: { poolAddress: string, marketType: MarketType, marketAddress: string | null, asset: string | null, question: string | null, expiry: string | null, tradingStart: string | null, quoteDecimals: number, intervalSec: string | null } | null }> };

export type OpenOrdersQueryVariables = Exact<{
  where: Order_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OpenOrdersQuery = { Order: Array<{ id: string, orderId: string, side: BinarySide | null, isBid: boolean, price: string, quantityRemaining: string, market: string, marketRow: { poolAddress: string, marketAddress: string | null, asset: string | null, question: string | null, expiry: string | null, tradingStart: string | null, quoteDecimals: number, intervalSec: string | null } | null }> };

export type OrdersQueryVariables = Exact<{
  where: Order_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OrdersQuery = { Order: Array<{ id: string, orderId: string, side: BinarySide | null, isBid: boolean, price: string, quantityRemaining: string, fullQuantity: string, filledQuantity: string, status: OrderStatus, rested: boolean, expireTimestampNs: string, placedTxHash: string, placedAtTimestamp: string, cancelReason: string | null, amendedFromOrderId: string | null, amendedToOrderId: string | null, market: string, marketRow: { poolAddress: string, marketAddress: string | null, asset: string | null, question: string | null, expiry: string | null, tradingStart: string | null, quoteDecimals: number, intervalSec: string | null } | null }> };

export type BookTopsQueryVariables = Exact<{
  bidWhere: Order_Bool_Exp;
  askWhere: Order_Bool_Exp;
}>;


export type BookTopsQuery = { bids: Array<{ price: string, market: string }>, asks: Array<{ price: string, market: string }> };

export type FundingPaymentsQueryVariables = Exact<{
  where: FundingPayment_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type FundingPaymentsQuery = { FundingPayment: Array<{ id: string, account: string, pool: string | null, amount: string, timestamp: string, txHash: string }> };

export type MarginEventsQueryVariables = Exact<{
  account: string;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type MarginEventsQuery = { MarginEvent: Array<{ id: string, account: string, kind: string, pool: string | null, amount: string, granter: string | null, timestamp: string, txHash: string }> };

export type LiquidationsQueryVariables = Exact<{
  where: LiquidationEvent_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type LiquidationsQuery = { LiquidationEvent: Array<{ id: string, account: string, pool: string | null, kind: string, size: string | null, price: string | null, counterparty: string | null, penalty: string | null, badDebt: string | null, insuranceCovered: string | null, deficit: string | null, coverageDeclined: string | null, collateralAmount: string | null, equity: string | null, positionsProcessed: string | null, stageReached: number | null, marginStatusBefore: number | null, marginStatusAfter: number | null, timestamp: string, blockNumber: string, txHash: string }> };

export type FundingRateHistoryQueryVariables = Exact<{
  where: FundingRateUpdate_Bool_Exp;
  orderBy?: Array<FundingRateUpdate_Order_By> | FundingRateUpdate_Order_By | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type FundingRateHistoryQuery = { FundingRateUpdate: Array<{ id: string, pool: string, fundingRate: string, cumulativeFundingPerUnit: string, indexPrice: string, markPrice: string | null, intervalsSettled: string, intervalsAccrued: string, fundingWindowSec: number, fundingIntervalSec: number, spanStart: string, spanEnd: string, anchorResynced: boolean, timestamp: string, blockNumber: string, txHash: string }> };

export type FundingRateCandlesQueryVariables = Exact<{
  where: FundingRateCandle_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type FundingRateCandlesQuery = { FundingRateCandle: Array<{ id: string, pool: string, intervalSeconds: number, bucketStart: string, avgFundingRate8h: string, minFundingRate8h: string | null, maxFundingRate8h: string | null, coverage: string, cumulativeFundingStart: string, cumulativeFundingEnd: string, fundingWindowSec: number, fundingIntervalSec: number, paramsChangedInBucket: boolean, indexPriceEnd: string | null, openInterestEnd: string | null, updateCount: number }> };

export type PerpFeesQueryVariables = Exact<{
  where: PerpFeeRecord_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type PerpFeesQuery = { PerpFeeRecord: Array<{ id: string, account: string, pool: string | null, amount: string, isRebate: boolean, kind: string, insurancePortion: string | null, tier: string | null, fillNotional: string | null, builder: string | null, timestamp: string, txHash: string }> };

export type OpenInterestHistoryQueryVariables = Exact<{
  pool: string;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type OpenInterestHistoryQuery = { OpenInterestSnapshot: Array<{ id: string, pool: string, openInterest: string, timestamp: string, blockNumber: string }> };

export type PerpPortfolioMarketFieldsFragment = { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseDecimals: number, quoteDecimals: number, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, indexPrice: string | null, stopRegistry: string | null };

export type PerpPortfolioQueryVariables = Exact<{
  acct: string;
  fillWhere: Fill_Bool_Exp;
  ordersLimit?: number | null | undefined;
  tradesLimit?: number | null | undefined;
}>;


export type PerpPortfolioQuery = { PerpOrder: Array<{ id: string, orderId: string, isBid: boolean, price: string, quantityRemaining: string, filledQuantity: string, fullQuantity: string, placedAtTimestamp: string, placedTxHash: string, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseDecimals: number, quoteDecimals: number, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, indexPrice: string | null, stopRegistry: string | null } | null }>, PerpFill: Array<{ id: string, fillPrice: string, quantity: string, quoteQuantity: string, timestamp: string, txHash: string, maker: string | null, taker: string | null, takerIsBid: boolean | null, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseDecimals: number, quoteDecimals: number, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, indexPrice: string | null, stopRegistry: string | null } | null }> };

export type PerpOrderHistoryQueryVariables = Exact<{
  where: Order_Bool_Exp;
  orderBy?: Array<Order_Order_By> | Order_Order_By | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type PerpOrderHistoryQuery = { Order: Array<{ id: string, orderId: string, isBid: boolean, price: string, quantityRemaining: string, filledQuantity: string, fullQuantity: string, status: OrderStatus, rested: boolean, expireTimestampNs: string, placedAtTimestamp: string, placedTxHash: string, lastUpdatedAtTimestamp: string, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseDecimals: number, quoteDecimals: number, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, indexPrice: string | null, stopRegistry: string | null } | null }> };

export type PerpPositionsQueryVariables = Exact<{
  where: PerpPosition_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type PerpPositionsQuery = { PerpPosition: Array<{ id: string, pool: string, account: string, size: string, isLong: boolean, entryPriceX18: string | null, realizedPnl: string | null, updatedAt: string, updatedAtBlock: number | null }> };

export type PerpStopOrdersQueryVariables = Exact<{
  where: StopOrder_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type PerpStopOrdersQuery = { StopOrder: Array<{ id: string, registry: string, orderIdRaw: string, owner: string, isBid: boolean, quantity: string, triggerPrice: string, triggerOperator: number, orderType: number, builder: string, builderFeeBpsTimes1k: string, status: StopOrderStatus, placedOrderId: string | null, dropReason: number | null, createdAt: string, updatedAt: string, txHash: string, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseDecimals: number, quoteDecimals: number } | null }> };

export type MarketByPoolQueryVariables = Exact<{
  pool: string;
}>;


export type MarketByPoolQuery = { Market: Array<{ id: string, marketType: MarketType, poolAddress: string, lastPrice: string | null, lastTradeAt: string | null, cumulativeBaseVolume: string, cumulativeQuoteVolume: string, tradeCount: string, baseDecimals: number, quoteDecimals: number, createdAtTimestamp: string, baseToken: string | null, quoteToken: string | null, baseSymbol: string | null, quoteSymbol: string | null, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, markPrice: string | null, rawMidpoint: string | null, markPriceUpdatedAt: string | null, stopRegistry: string | null, marginBank: string | null, initialMarginBps: number | null, fundingRate: string | null, cumulativeFundingPerUnit: string | null, indexPrice: string | null, fundingUpdatedAt: string | null, fundingWindowSec: number | null, fundingIntervalSec: number | null, openInterest: string | null, openInterestUpdatedAt: string | null, marketId: string | null, marketAddress: string | null, yesTokenId: string | null, noTokenId: string | null, collateral: string | null, asset: string | null, question: string | null, oracleQuestion: string | null, oracleQuestionId: string | null, strike: string | null, tradingStart: string | null, expiry: string | null, winningOutcome: number | null, payoutNumerators: Array<string> | null, payoutDenominator: string | null, resolvedAtBlock: string | null, resolvedAtTimestamp: string | null, createdByTx: string | null, creator: string | null, voided: boolean, backing: string, nonce: string | null, finalized: boolean | null, netBacking: string | null, context: string | null, intervalSec: string | null, operatorId: number | null, venueId: string | null, status: BinaryMarketStatus | null }> };

export type PoolBindingsQueryVariables = Exact<{
  pool: string;
}>;


export type PoolBindingsQuery = { PoolBinding: Array<{ id: string, poolAddress: string, marketId: string, nonce: string, fromBlock: string, fromLogIndex: number, fromTimestamp: string, toBlock: string | null, toLogIndex: number | null, toTimestamp: string | null, closedBy: string | null }> };

export type PoolByPkQueryVariables = Exact<{
  id: string;
}>;


export type PoolByPkQuery = { Pool_by_pk: { id: string, address: string, collateral: string | null, creator: string | null, currentMarketId: string | null, currentNonce: string | null, generationCount: number, createdAtTimestamp: string, updatedAtTimestamp: string } | null };

export type RouterActionFieldsFragment = { id: string, kind: string, account: string, amount: string, payout: string | null, routedVia: string | null, timestamp: string, txHash: string, market: string };

export type RouterActionsQueryVariables = Exact<{
  where: RouterActionRecord_Bool_Exp;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type RouterActionsQuery = { RouterActionRecord: Array<{ id: string, kind: string, account: string, amount: string, payout: string | null, routedVia: string | null, timestamp: string, txHash: string, market: string }> };

export type SpotPortfolioMarketFieldsFragment = { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseToken: string | null, quoteToken: string | null, baseDecimals: number, quoteDecimals: number, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, markPrice: string | null, stopRegistry: string | null };

export type SpotPortfolioQueryVariables = Exact<{
  acct: string;
  fillWhere: Fill_Bool_Exp;
  ordersLimit?: number | null | undefined;
  tradesLimit?: number | null | undefined;
}>;


export type SpotPortfolioQuery = { SpotOrder: Array<{ id: string, orderId: string, isBid: boolean, price: string, quantityRemaining: string, filledQuantity: string, fullQuantity: string, placedAtTimestamp: string, placedTxHash: string, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseToken: string | null, quoteToken: string | null, baseDecimals: number, quoteDecimals: number, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, markPrice: string | null, stopRegistry: string | null } | null }>, SpotStopOrder: Array<{ id: string, registry: string, isBid: boolean, quantity: string, triggerPrice: string, triggerOperator: number, orderType: number, status: StopOrderStatus, placedOrderId: string | null, createdAt: string, orderId: string, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseToken: string | null, quoteToken: string | null, baseDecimals: number, quoteDecimals: number, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, markPrice: string | null, stopRegistry: string | null } | null }>, SpotFill: Array<{ id: string, fillPrice: string, quantity: string, quoteQuantity: string, timestamp: string, txHash: string, maker: string | null, taker: string | null, takerIsBid: boolean | null, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseToken: string | null, quoteToken: string | null, baseDecimals: number, quoteDecimals: number, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, markPrice: string | null, stopRegistry: string | null } | null }> };

export type SpotStopOrderFieldsFragment = { id: string, registry: string, isBid: boolean, quantity: string, triggerPrice: string, triggerOperator: number, orderType: number, status: StopOrderStatus, placedOrderId: string | null, createdAt: string, orderId: string };

export type SpotStopOrdersQueryVariables = Exact<{
  where: StopOrder_Bool_Exp;
  limit?: number | null | undefined;
}>;


export type SpotStopOrdersQuery = { StopOrder: Array<{ id: string, registry: string, isBid: boolean, quantity: string, triggerPrice: string, triggerOperator: number, orderType: number, status: StopOrderStatus, placedOrderId: string | null, createdAt: string, orderId: string, market: { poolAddress: string, baseSymbol: string | null, quoteSymbol: string | null, baseToken: string | null, quoteToken: string | null, baseDecimals: number, quoteDecimals: number, baseIsNative: boolean | null, tickSize: string | null, lotSize: string | null, minQuantity: string | null, lastPrice: string | null, markPrice: string | null, stopRegistry: string | null } | null }> };

export type SyncStatusQueryVariables = Exact<{
  chainId: number;
}>;


export type SyncStatusQuery = { chain_metadata: Array<{ chain_id: number | null, latest_processed_block: number | null, block_height: number | null, num_events_processed: number | null }> };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const PortfolioMarketFieldsFragmentDoc = new TypedDocumentString(`
    fragment PortfolioMarketFields on Market {
  id
  marketAddress
  poolAddress
  asset
  question
  status: clobStatus
  lastPrice
  strike
  expiry
  winningOutcome
  voided
  quoteDecimals
  intervalSec
}
    `, {"fragmentName":"PortfolioMarketFields"}) as unknown as TypedDocumentString<PortfolioMarketFieldsFragment, unknown>;
export const ProtocolFeeFieldsFragmentDoc = new TypedDocumentString(`
    fragment ProtocolFeeFields on ProtocolFeeRecord {
  id
  orderId
  recipient
  payer
  token
  amount
  isTakerSide
  market: market_id
  pool
  timestamp
  txHash
}
    `, {"fragmentName":"ProtocolFeeFields"}) as unknown as TypedDocumentString<ProtocolFeeFieldsFragment, unknown>;
export const BuilderFeeFieldsFragmentDoc = new TypedDocumentString(`
    fragment BuilderFeeFields on BuilderFeeRecord {
  id
  orderId
  builder
  payer
  token
  amount
  market: market_id
  pool
  timestamp
  txHash
}
    `, {"fragmentName":"BuilderFeeFields"}) as unknown as TypedDocumentString<BuilderFeeFieldsFragment, unknown>;
export const SettlementFeeFieldsFragmentDoc = new TypedDocumentString(`
    fragment SettlementFeeFields on SettlementFeeRecord {
  id
  recipient: feeRecipient
  amount: fee
  winningBacking
  market: market_id
  timestamp
  txHash
}
    `, {"fragmentName":"SettlementFeeFields"}) as unknown as TypedDocumentString<SettlementFeeFieldsFragment, unknown>;
export const FillQueryFieldsFragmentDoc = new TypedDocumentString(`
    fragment FillQueryFields on Fill {
  id
  market: market_id
  pool
  fillPrice
  quantity
  quoteQuantity
  maker
  makerSide
  taker
  takerSide
  kind
  takerIsBid
  timestamp
  txHash
  takerOrder {
    owner
    side
  }
}
    `, {"fragmentName":"FillQueryFields"}) as unknown as TypedDocumentString<FillQueryFieldsFragment, unknown>;
export const SeriesFieldsFragmentDoc = new TypedDocumentString(`
    fragment SeriesFields on Series {
  id
  creatorAddress
  seriesId
  collateral
  asset
  intervalSec
  createdAtTimestamp
  updatedAtTimestamp
}
    `, {"fragmentName":"SeriesFields"}) as unknown as TypedDocumentString<SeriesFieldsFragment, unknown>;
export const MarketCreatorFieldsFragmentDoc = new TypedDocumentString(`
    fragment MarketCreatorFields on MarketCreator {
  id
  owner
  policy
  core
  adapter
  operatorId
  venueId
  factory
  createdAtBlock
  createdAtTimestamp
}
    `, {"fragmentName":"MarketCreatorFields"}) as unknown as TypedDocumentString<MarketCreatorFieldsFragment, unknown>;
export const OracleAdapterFieldsFragmentDoc = new TypedDocumentString(`
    fragment OracleAdapterFields on OracleAdapter {
  id
  owner
  factory
  approved
  approvedAtTimestamp
  createdAtTimestamp
}
    `, {"fragmentName":"OracleAdapterFields"}) as unknown as TypedDocumentString<OracleAdapterFieldsFragment, unknown>;
export const MarketFieldsFragmentDoc = new TypedDocumentString(`
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}
    `, {"fragmentName":"MarketFields"}) as unknown as TypedDocumentString<MarketFieldsFragment, unknown>;
export const OperatorFieldsFragmentDoc = new TypedDocumentString(`
    fragment OperatorFields on Operator {
  operatorId
  owner
  feeRecipient
  enabled
  policy
  context
  pendingOwner
  venueCount
  createdAtTimestamp
  updatedAtTimestamp
  marketCount
  cumulativeQuoteVolume
  protocolFeesCollected
  settlementFeesCollected
  builderFeesCollected
}
    `, {"fragmentName":"OperatorFields"}) as unknown as TypedDocumentString<OperatorFieldsFragment, unknown>;
export const VenueFieldsFragmentDoc = new TypedDocumentString(`
    fragment VenueFields on Venue {
  venueId
  operatorId
  marketType
  feeParams
  feeRecipientOverride
  policy
  signer
  creationEnabled
  context
  createdAtTimestamp
  updatedAtTimestamp
  marketCount
  cumulativeQuoteVolume
  protocolFeesCollected
  settlementFeesCollected
  builderFeesCollected
}
    `, {"fragmentName":"VenueFields"}) as unknown as TypedDocumentString<VenueFieldsFragment, unknown>;
export const OracleQuestionFieldsFragmentDoc = new TypedDocumentString(`
    fragment OracleQuestionFields on OracleQuestion {
  id
  questionKey
  scheduler
  oracleCost
  bindCount
  reuseCount
  createdAtBlock
  createdAtTimestamp
}
    `, {"fragmentName":"OracleQuestionFields"}) as unknown as TypedDocumentString<OracleQuestionFieldsFragment, unknown>;
export const OperatorHubAccountFieldsFragmentDoc = new TypedDocumentString(`
    fragment OperatorHubAccountFields on OperatorHubAccount {
  id
  operatorId
  earmarked
  credit
  outstanding
  createdAtBlock
  createdAtTimestamp
  updatedAtBlock
  updatedAtTimestamp
}
    `, {"fragmentName":"OperatorHubAccountFields"}) as unknown as TypedDocumentString<OperatorHubAccountFieldsFragment, unknown>;
export const OracleBindFieldsFragmentDoc = new TypedDocumentString(`
    fragment OracleBindFields on OracleBind {
  id
  oracleQuestionId
  bindIndex
  operatorId
  measuredGas
  overheadShare
  cost
  charged
  subsidy
  resolvedAt
  boundAtBlock
  boundAtTimestamp
  txHash
}
    `, {"fragmentName":"OracleBindFields"}) as unknown as TypedDocumentString<OracleBindFieldsFragment, unknown>;
export const OracleCallbackFieldsFragmentDoc = new TypedDocumentString(`
    fragment OracleCallbackFields on OracleCallback {
  id
  marketsResolved
  gasPrice
  measuredGas
  overheadGasAttributed
  totalCost
  totalCharged
  subsidy
  pendingRemaining
  blockNumber
  timestamp
  txHash
}
    `, {"fragmentName":"OracleCallbackFields"}) as unknown as TypedDocumentString<OracleCallbackFieldsFragment, unknown>;
export const OrderMarketFieldsFragmentDoc = new TypedDocumentString(`
    fragment OrderMarketFields on Market {
  marketAddress
  asset
  question
  expiry
  tradingStart
  quoteDecimals
  intervalSec
}
    `, {"fragmentName":"OrderMarketFields"}) as unknown as TypedDocumentString<OrderMarketFieldsFragment, unknown>;
export const PerpPortfolioMarketFieldsFragmentDoc = new TypedDocumentString(`
    fragment PerpPortfolioMarketFields on Market {
  poolAddress
  baseSymbol
  quoteSymbol
  baseDecimals
  quoteDecimals
  tickSize
  lotSize
  minQuantity
  lastPrice
  marginBank
  initialMarginBps
  fundingRate
  indexPrice
  stopRegistry
}
    `, {"fragmentName":"PerpPortfolioMarketFields"}) as unknown as TypedDocumentString<PerpPortfolioMarketFieldsFragment, unknown>;
export const RouterActionFieldsFragmentDoc = new TypedDocumentString(`
    fragment RouterActionFields on RouterActionRecord {
  id
  kind
  account
  market: market_id
  amount
  payout
  routedVia
  timestamp
  txHash
}
    `, {"fragmentName":"RouterActionFields"}) as unknown as TypedDocumentString<RouterActionFieldsFragment, unknown>;
export const SpotPortfolioMarketFieldsFragmentDoc = new TypedDocumentString(`
    fragment SpotPortfolioMarketFields on Market {
  poolAddress
  baseSymbol
  quoteSymbol
  baseToken
  quoteToken
  baseDecimals
  quoteDecimals
  baseIsNative
  tickSize
  lotSize
  minQuantity
  lastPrice
  markPrice
  stopRegistry
}
    `, {"fragmentName":"SpotPortfolioMarketFields"}) as unknown as TypedDocumentString<SpotPortfolioMarketFieldsFragment, unknown>;
export const SpotStopOrderFieldsFragmentDoc = new TypedDocumentString(`
    fragment SpotStopOrderFields on StopOrder {
  id
  registry
  orderId: orderIdRaw
  isBid
  quantity
  triggerPrice
  triggerOperator
  orderType
  status
  placedOrderId
  createdAt
}
    `, {"fragmentName":"SpotStopOrderFields"}) as unknown as TypedDocumentString<SpotStopOrderFieldsFragment, unknown>;
export const PortfolioDocument = new TypedDocumentString(`
    query Portfolio($acct: String!, $fillWhere: Fill_bool_exp!, $ordersLimit: Int, $tradesLimit: Int) {
  OutcomeBalance(
    where: {account: {_eq: $acct}, balance: {_gt: "0"}}
    order_by: {balance: desc}
    limit: 200
  ) {
    outcomeIndex
    tokenId
    balance
    market {
      ...PortfolioMarketFields
    }
  }
  ClobOrder: Order(
    where: {owner: {_eq: $acct}, status: {_eq: "Open"}, market: {marketType: {_eq: "BINARY"}}}
    order_by: {placedAtTimestamp: desc}
    limit: $ordersLimit
  ) {
    id
    orderId
    side
    price
    quantityRemaining
    filledQuantity
    fullQuantity
    placedAtTimestamp
    placedTxHash
    market {
      ...PortfolioMarketFields
    }
  }
  ClobFill: Fill(
    where: $fillWhere
    order_by: {timestamp: desc}
    limit: $tradesLimit
  ) {
    id
    fillPrice
    quantity
    timestamp
    txHash
    maker
    makerSide
    takerOrder {
      owner
      side
    }
    market {
      marketAddress
      asset
      quoteDecimals
    }
  }
}
    fragment PortfolioMarketFields on Market {
  id
  marketAddress
  poolAddress
  asset
  question
  status: clobStatus
  lastPrice
  strike
  expiry
  winningOutcome
  voided
  quoteDecimals
  intervalSec
}`) as unknown as TypedDocumentString<PortfolioQuery, PortfolioQueryVariables>;
export const OutcomeBalancesDocument = new TypedDocumentString(`
    query OutcomeBalances($acct: String!, $mkt: String!) {
  OutcomeBalance(
    where: {account: {_eq: $acct}, market: {marketAddress: {_eq: $mkt}}}
  ) {
    outcomeIndex
    balance
  }
}
    `) as unknown as TypedDocumentString<OutcomeBalancesQuery, OutcomeBalancesQueryVariables>;
export const VaultPayoutFallbacksDocument = new TypedDocumentString(`
    query VaultPayoutFallbacks($where: VaultPayoutFallback_bool_exp!, $limit: Int, $offset: Int) {
  VaultPayoutFallback(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    owner
    token
    amount
    market: market_id
    timestamp
    txHash
  }
}
    `) as unknown as TypedDocumentString<VaultPayoutFallbacksQuery, VaultPayoutFallbacksQueryVariables>;
export const MarketResolutionDocument = new TypedDocumentString(`
    query MarketResolution($id: String!) {
  MarketResolutionEvent(
    where: {market_id: {_eq: $id}}
    order_by: {timestamp: asc}
  ) {
    id
    market: market_id
    kind
    winningOutcome: outcomeIdx
    payoutNumerators
    payoutDenominator
    voided
    blockNumber
    timestamp
    txHash
  }
  MarketReferenceLink(where: {market_id: {_eq: $id}}, limit: 1) {
    id
    market: market_id
    oracleQuestionId: referenceQuestionId
    pending
  }
  Market_by_pk(id: $id) {
    oracleQuestionId
  }
}
    `) as unknown as TypedDocumentString<MarketResolutionQuery, MarketResolutionQueryVariables>;
export const OracleAnswersDocument = new TypedDocumentString(`
    query OracleAnswers($closingQid: String!, $openingQid: String!) {
  closing: OracleAnswer_by_pk(id: $closingQid) {
    oracleQuestionId
    numericValue
    outcomeLabel
    voidReason
    resolvedAt
    txHash
  }
  opening: OracleAnswer_by_pk(id: $openingQid) {
    oracleQuestionId
    numericValue
    outcomeLabel
    voidReason
    resolvedAt
    txHash
  }
}
    `) as unknown as TypedDocumentString<OracleAnswersQuery, OracleAnswersQueryVariables>;
export const CandlesDocument = new TypedDocumentString(`
    query Candles($where: Candle_bool_exp!, $limit: Int) {
  Candle(where: $where, order_by: {bucketStart: desc}, limit: $limit) {
    bucketStart
    openPrice
    high
    low
    closePrice
    baseVolume
    quoteVolume
    tradeCount
  }
}
    `) as unknown as TypedDocumentString<CandlesQuery, CandlesQueryVariables>;
export const BuilderApprovalsDocument = new TypedDocumentString(`
    query BuilderApprovals($where: BuilderApproval_bool_exp!, $limit: Int, $offset: Int) {
  BuilderApproval(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    market_id
    market {
      poolAddress
    }
    user
    builder
    maxFeeBpsTimes1k
    blockNumber
    timestamp
    txHash
  }
}
    `) as unknown as TypedDocumentString<BuilderApprovalsQuery, BuilderApprovalsQueryVariables>;
export const ProtocolFeesDocument = new TypedDocumentString(`
    query ProtocolFees($where: ProtocolFeeRecord_bool_exp!, $limit: Int, $offset: Int) {
  ProtocolFeeRecord(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...ProtocolFeeFields
  }
}
    fragment ProtocolFeeFields on ProtocolFeeRecord {
  id
  orderId
  recipient
  payer
  token
  amount
  isTakerSide
  market: market_id
  pool
  timestamp
  txHash
}`) as unknown as TypedDocumentString<ProtocolFeesQuery, ProtocolFeesQueryVariables>;
export const BuilderFeesDocument = new TypedDocumentString(`
    query BuilderFees($where: BuilderFeeRecord_bool_exp!, $limit: Int, $offset: Int) {
  BuilderFeeRecord(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...BuilderFeeFields
  }
}
    fragment BuilderFeeFields on BuilderFeeRecord {
  id
  orderId
  builder
  payer
  token
  amount
  market: market_id
  pool
  timestamp
  txHash
}`) as unknown as TypedDocumentString<BuilderFeesQuery, BuilderFeesQueryVariables>;
export const SettlementFeesDocument = new TypedDocumentString(`
    query SettlementFees($where: SettlementFeeRecord_bool_exp!, $limit: Int, $offset: Int) {
  SettlementFeeRecord(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...SettlementFeeFields
  }
}
    fragment SettlementFeeFields on SettlementFeeRecord {
  id
  recipient: feeRecipient
  amount: fee
  winningBacking
  market: market_id
  timestamp
  txHash
}`) as unknown as TypedDocumentString<SettlementFeesQuery, SettlementFeesQueryVariables>;
export const FillsDocument = new TypedDocumentString(`
    query Fills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {
  Fill(
    where: $where
    order_by: [{timestamp: desc}, {blockNumber: desc}]
    limit: $limit
    offset: $offset
  ) {
    ...FillQueryFields
  }
}
    fragment FillQueryFields on Fill {
  id
  market: market_id
  pool
  fillPrice
  quantity
  quoteQuantity
  maker
  makerSide
  taker
  takerSide
  kind
  takerIsBid
  timestamp
  txHash
  takerOrder {
    owner
    side
  }
}`) as unknown as TypedDocumentString<FillsQuery, FillsQueryVariables>;
export const UserFillsDocument = new TypedDocumentString(`
    query UserFills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {
  Fill(
    where: $where
    order_by: [{timestamp: desc}, {blockNumber: desc}]
    limit: $limit
    offset: $offset
  ) {
    ...FillQueryFields
  }
}
    fragment FillQueryFields on Fill {
  id
  market: market_id
  pool
  fillPrice
  quantity
  quoteQuantity
  maker
  makerSide
  taker
  takerSide
  kind
  takerIsBid
  timestamp
  txHash
  takerOrder {
    owner
    side
  }
}`) as unknown as TypedDocumentString<UserFillsQuery, UserFillsQueryVariables>;
export const MarketCreatorsDocument = new TypedDocumentString(`
    query MarketCreators($where: MarketCreator_bool_exp!, $limit: Int, $offset: Int) {
  MarketCreator(
    where: $where
    order_by: {createdAtBlock: desc}
    limit: $limit
    offset: $offset
  ) {
    ...MarketCreatorFields
    series(order_by: {seriesId: asc}) {
      ...SeriesFields
    }
  }
}
    fragment SeriesFields on Series {
  id
  creatorAddress
  seriesId
  collateral
  asset
  intervalSec
  createdAtTimestamp
  updatedAtTimestamp
}
fragment MarketCreatorFields on MarketCreator {
  id
  owner
  policy
  core
  adapter
  operatorId
  venueId
  factory
  createdAtBlock
  createdAtTimestamp
}`) as unknown as TypedDocumentString<MarketCreatorsQuery, MarketCreatorsQueryVariables>;
export const MarketCreatorByPkDocument = new TypedDocumentString(`
    query MarketCreatorByPk($id: String!) {
  MarketCreator_by_pk(id: $id) {
    ...MarketCreatorFields
    series(order_by: {seriesId: asc}) {
      ...SeriesFields
    }
  }
}
    fragment SeriesFields on Series {
  id
  creatorAddress
  seriesId
  collateral
  asset
  intervalSec
  createdAtTimestamp
  updatedAtTimestamp
}
fragment MarketCreatorFields on MarketCreator {
  id
  owner
  policy
  core
  adapter
  operatorId
  venueId
  factory
  createdAtBlock
  createdAtTimestamp
}`) as unknown as TypedDocumentString<MarketCreatorByPkQuery, MarketCreatorByPkQueryVariables>;
export const OracleAdaptersDocument = new TypedDocumentString(`
    query OracleAdapters($where: OracleAdapter_bool_exp!, $limit: Int, $offset: Int) {
  OracleAdapter(
    where: $where
    order_by: {createdAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...OracleAdapterFields
  }
}
    fragment OracleAdapterFields on OracleAdapter {
  id
  owner
  factory
  approved
  approvedAtTimestamp
  createdAtTimestamp
}`) as unknown as TypedDocumentString<OracleAdaptersQuery, OracleAdaptersQueryVariables>;
export const OracleAdapterByPkDocument = new TypedDocumentString(`
    query OracleAdapterByPk($id: String!) {
  OracleAdapter_by_pk(id: $id) {
    ...OracleAdapterFields
  }
}
    fragment OracleAdapterFields on OracleAdapter {
  id
  owner
  factory
  approved
  approvedAtTimestamp
  createdAtTimestamp
}`) as unknown as TypedDocumentString<OracleAdapterByPkQuery, OracleAdapterByPkQueryVariables>;
export const SeriesListDocument = new TypedDocumentString(`
    query SeriesList($where: Series_bool_exp!, $limit: Int, $offset: Int) {
  Series(
    where: $where
    order_by: {createdAtTimestamp: asc}
    limit: $limit
    offset: $offset
  ) {
    ...SeriesFields
  }
}
    fragment SeriesFields on Series {
  id
  creatorAddress
  seriesId
  collateral
  asset
  intervalSec
  createdAtTimestamp
  updatedAtTimestamp
}`) as unknown as TypedDocumentString<SeriesListQuery, SeriesListQueryVariables>;
export const RegistryMarketsDocument = new TypedDocumentString(`
    query RegistryMarkets($where: Market_bool_exp!, $limit: Int, $offset: Int) {
  Market(
    where: $where
    order_by: {createdAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<RegistryMarketsQuery, RegistryMarketsQueryVariables>;
export const MarketsDocument = new TypedDocumentString(`
    query Markets($where: Market_bool_exp!, $limit: Int, $offset: Int) {
  Market(
    where: $where
    order_by: {createdAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<MarketsQuery, MarketsQueryVariables>;
export const MarketByPkDocument = new TypedDocumentString(`
    query MarketByPk($id: String!) {
  Market_by_pk(id: $id) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<MarketByPkQuery, MarketByPkQueryVariables>;
export const MarketByAddressDocument = new TypedDocumentString(`
    query MarketByAddress($a: String!) {
  Market(
    where: {marketAddress: {_eq: $a}}
    order_by: {createdAtTimestamp: desc}
    limit: 1
  ) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<MarketByAddressQuery, MarketByAddressQueryVariables>;
export const BinaryMarketsDocument = new TypedDocumentString(`
    query BinaryMarkets($where: Market_bool_exp!, $orderBy: [Market_order_by!], $limit: Int) {
  Market(where: $where, order_by: $orderBy, limit: $limit) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<BinaryMarketsQuery, BinaryMarketsQueryVariables>;
export const SpotMarketsDocument = new TypedDocumentString(`
    query SpotMarkets($where: Market_bool_exp!, $limit: Int) {
  Market(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<SpotMarketsQuery, SpotMarketsQueryVariables>;
export const PerpMarketsDocument = new TypedDocumentString(`
    query PerpMarkets($where: Market_bool_exp!, $limit: Int) {
  Market(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<PerpMarketsQuery, PerpMarketsQueryVariables>;
export const LiveBinaryMarketsDocument = new TypedDocumentString(`
    query LiveBinaryMarkets($where: Market_bool_exp!, $orderBy: [Market_order_by!], $limit: Int!, $offset: Int!) {
  Market(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<LiveBinaryMarketsQuery, LiveBinaryMarketsQueryVariables>;
export const PastBinaryMarketsDocument = new TypedDocumentString(`
    query PastBinaryMarkets($where: Market_bool_exp!, $limit: Int!, $offset: Int!) {
  Market(where: $where, order_by: {expiry: desc}, limit: $limit, offset: $offset) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<PastBinaryMarketsQuery, PastBinaryMarketsQueryVariables>;
export const BinaryOriginPairsDocument = new TypedDocumentString(`
    query BinaryOriginPairs {
  Market(
    distinct_on: [operatorId, venueId]
    where: {marketType: {_eq: "BINARY"}, operatorId: {_is_null: false}, venueId: {_is_null: false}}
    order_by: [{operatorId: asc}, {venueId: asc}]
  ) {
    operatorId
    venueId
  }
}
    `) as unknown as TypedDocumentString<BinaryOriginPairsQuery, BinaryOriginPairsQueryVariables>;
export const BinaryAssetsDocument = new TypedDocumentString(`
    query BinaryAssets {
  Market(
    distinct_on: asset
    where: {marketType: {_eq: "BINARY"}, asset: {_is_null: false}}
    order_by: {asset: asc}
  ) {
    asset
  }
}
    `) as unknown as TypedDocumentString<BinaryAssetsQuery, BinaryAssetsQueryVariables>;
export const MarketFeesDocument = new TypedDocumentString(`
    query MarketFees($id: String!) {
  MarketVenue_by_pk(id: $id) {
    operatorId
    venueId
    feeRecipient
    makerFeeBps
    takerFeeBps
    maxBuilderFeeBps
    routingFeeBps
    settlementFeeBps
    settlementFeesCollected
  }
}
    `) as unknown as TypedDocumentString<MarketFeesQuery, MarketFeesQueryVariables>;
export const MarketStatusHistoryDocument = new TypedDocumentString(`
    query MarketStatusHistory($id: String!) {
  MarketStatusUpdate(where: {market_id: {_eq: $id}}, order_by: {timestamp: asc}) {
    oldStatus
    newStatus
    blockNumber
    timestamp
    txHash
  }
}
    `) as unknown as TypedDocumentString<MarketStatusHistoryQuery, MarketStatusHistoryQueryVariables>;
export const OpeningAnswersDocument = new TypedDocumentString(`
    query OpeningAnswers($qids: [String!]) {
  OracleAnswer(where: {id: {_in: $qids}}) {
    id
    numericValue
  }
}
    `) as unknown as TypedDocumentString<OpeningAnswersQuery, OpeningAnswersQueryVariables>;
export const OpeningRefsDocument = new TypedDocumentString(`
    query OpeningRefs($ids: [String!]) {
  MarketReferenceLink(where: {market_id: {_in: $ids}}) {
    market: market_id
    referenceQuestionId
  }
}
    `) as unknown as TypedDocumentString<OpeningRefsQuery, OpeningRefsQueryVariables>;
export const OperatorsDocument = new TypedDocumentString(`
    query Operators($where: Operator_bool_exp!, $limit: Int, $offset: Int) {
  Operator(
    where: $where
    order_by: {operatorId: desc}
    limit: $limit
    offset: $offset
  ) {
    ...OperatorFields
  }
}
    fragment OperatorFields on Operator {
  operatorId
  owner
  feeRecipient
  enabled
  policy
  context
  pendingOwner
  venueCount
  createdAtTimestamp
  updatedAtTimestamp
  marketCount
  cumulativeQuoteVolume
  protocolFeesCollected
  settlementFeesCollected
  builderFeesCollected
}`) as unknown as TypedDocumentString<OperatorsQuery, OperatorsQueryVariables>;
export const OperatorByPkDocument = new TypedDocumentString(`
    query OperatorByPk($id: String!) {
  Operator_by_pk(id: $id) {
    ...OperatorFields
  }
}
    fragment OperatorFields on Operator {
  operatorId
  owner
  feeRecipient
  enabled
  policy
  context
  pendingOwner
  venueCount
  createdAtTimestamp
  updatedAtTimestamp
  marketCount
  cumulativeQuoteVolume
  protocolFeesCollected
  settlementFeesCollected
  builderFeesCollected
}`) as unknown as TypedDocumentString<OperatorByPkQuery, OperatorByPkQueryVariables>;
export const VenuesDocument = new TypedDocumentString(`
    query Venues($where: Venue_bool_exp!, $limit: Int, $offset: Int) {
  Venue(
    where: $where
    order_by: {createdAtTimestamp: asc}
    limit: $limit
    offset: $offset
  ) {
    ...VenueFields
  }
}
    fragment VenueFields on Venue {
  venueId
  operatorId
  marketType
  feeParams
  feeRecipientOverride
  policy
  signer
  creationEnabled
  context
  createdAtTimestamp
  updatedAtTimestamp
  marketCount
  cumulativeQuoteVolume
  protocolFeesCollected
  settlementFeesCollected
  builderFeesCollected
}`) as unknown as TypedDocumentString<VenuesQuery, VenuesQueryVariables>;
export const VenueByPkDocument = new TypedDocumentString(`
    query VenueByPk($id: String!) {
  Venue_by_pk(id: $id) {
    ...VenueFields
  }
}
    fragment VenueFields on Venue {
  venueId
  operatorId
  marketType
  feeParams
  feeRecipientOverride
  policy
  signer
  creationEnabled
  context
  createdAtTimestamp
  updatedAtTimestamp
  marketCount
  cumulativeQuoteVolume
  protocolFeesCollected
  settlementFeesCollected
  builderFeesCollected
}`) as unknown as TypedDocumentString<VenueByPkQuery, VenueByPkQueryVariables>;
export const OracleQuestionDocument = new TypedDocumentString(`
    query OracleQuestion($id: String!) {
  OracleQuestion_by_pk(id: $id) {
    ...OracleQuestionFields
  }
}
    fragment OracleQuestionFields on OracleQuestion {
  id
  questionKey
  scheduler
  oracleCost
  bindCount
  reuseCount
  createdAtBlock
  createdAtTimestamp
}`) as unknown as TypedDocumentString<OracleQuestionQuery, OracleQuestionQueryVariables>;
export const OracleQuestionsDocument = new TypedDocumentString(`
    query OracleQuestions($where: OracleQuestion_bool_exp!, $limit: Int, $offset: Int) {
  OracleQuestion(
    where: $where
    order_by: {createdAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...OracleQuestionFields
  }
}
    fragment OracleQuestionFields on OracleQuestion {
  id
  questionKey
  scheduler
  oracleCost
  bindCount
  reuseCount
  createdAtBlock
  createdAtTimestamp
}`) as unknown as TypedDocumentString<OracleQuestionsQuery, OracleQuestionsQueryVariables>;
export const OperatorHubAccountDocument = new TypedDocumentString(`
    query OperatorHubAccount($id: String!) {
  OperatorHubAccount_by_pk(id: $id) {
    ...OperatorHubAccountFields
  }
}
    fragment OperatorHubAccountFields on OperatorHubAccount {
  id
  operatorId
  earmarked
  credit
  outstanding
  createdAtBlock
  createdAtTimestamp
  updatedAtBlock
  updatedAtTimestamp
}`) as unknown as TypedDocumentString<OperatorHubAccountQuery, OperatorHubAccountQueryVariables>;
export const OperatorHubAccountsDocument = new TypedDocumentString(`
    query OperatorHubAccounts($limit: Int, $offset: Int) {
  OperatorHubAccount(
    order_by: {updatedAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...OperatorHubAccountFields
  }
}
    fragment OperatorHubAccountFields on OperatorHubAccount {
  id
  operatorId
  earmarked
  credit
  outstanding
  createdAtBlock
  createdAtTimestamp
  updatedAtBlock
  updatedAtTimestamp
}`) as unknown as TypedDocumentString<OperatorHubAccountsQuery, OperatorHubAccountsQueryVariables>;
export const OracleBindsDocument = new TypedDocumentString(`
    query OracleBinds($where: OracleBind_bool_exp!, $limit: Int, $offset: Int) {
  OracleBind(
    where: $where
    order_by: {boundAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...OracleBindFields
  }
}
    fragment OracleBindFields on OracleBind {
  id
  oracleQuestionId
  bindIndex
  operatorId
  measuredGas
  overheadShare
  cost
  charged
  subsidy
  resolvedAt
  boundAtBlock
  boundAtTimestamp
  txHash
}`) as unknown as TypedDocumentString<OracleBindsQuery, OracleBindsQueryVariables>;
export const OracleCallbacksDocument = new TypedDocumentString(`
    query OracleCallbacks($limit: Int, $offset: Int) {
  OracleCallback(order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
    ...OracleCallbackFields
  }
}
    fragment OracleCallbackFields on OracleCallback {
  id
  marketsResolved
  gasPrice
  measuredGas
  overheadGasAttributed
  totalCost
  totalCharged
  subsidy
  pendingRemaining
  blockNumber
  timestamp
  txHash
}`) as unknown as TypedDocumentString<OracleCallbacksQuery, OracleCallbacksQueryVariables>;
export const SweepableOrdersDocument = new TypedDocumentString(`
    query SweepableOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {
  Order(
    where: $where
    order_by: [{expireTimestampNs: asc}, {id: asc}]
    limit: $limit
    offset: $offset
  ) {
    id
    orderId
    owner
    isBid
    price
    quantityRemaining
    expireTimestampNs
    placedAtTimestamp
    market: market_id
    marketRow: market {
      poolAddress
      marketType
      ...OrderMarketFields
    }
  }
}
    fragment OrderMarketFields on Market {
  marketAddress
  asset
  question
  expiry
  tradingStart
  quoteDecimals
  intervalSec
}`) as unknown as TypedDocumentString<SweepableOrdersQuery, SweepableOrdersQueryVariables>;
export const OpenOrdersDocument = new TypedDocumentString(`
    query OpenOrders($where: Order_bool_exp!, $limit: Int, $offset: Int) {
  Order(
    where: $where
    order_by: {placedAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    orderId
    side
    isBid
    price
    quantityRemaining
    market: market_id
    marketRow: market {
      poolAddress
      ...OrderMarketFields
    }
  }
}
    fragment OrderMarketFields on Market {
  marketAddress
  asset
  question
  expiry
  tradingStart
  quoteDecimals
  intervalSec
}`) as unknown as TypedDocumentString<OpenOrdersQuery, OpenOrdersQueryVariables>;
export const OrdersDocument = new TypedDocumentString(`
    query Orders($where: Order_bool_exp!, $limit: Int, $offset: Int) {
  Order(
    where: $where
    order_by: {placedAtTimestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    orderId
    side
    isBid
    price
    quantityRemaining
    fullQuantity
    filledQuantity
    status
    rested
    expireTimestampNs
    placedTxHash
    placedAtTimestamp
    cancelReason
    amendedFromOrderId
    amendedToOrderId
    market: market_id
    marketRow: market {
      poolAddress
      ...OrderMarketFields
    }
  }
}
    fragment OrderMarketFields on Market {
  marketAddress
  asset
  question
  expiry
  tradingStart
  quoteDecimals
  intervalSec
}`) as unknown as TypedDocumentString<OrdersQuery, OrdersQueryVariables>;
export const BookTopsDocument = new TypedDocumentString(`
    query BookTops($bidWhere: Order_bool_exp!, $askWhere: Order_bool_exp!) {
  bids: Order(
    where: $bidWhere
    distinct_on: market_id
    order_by: [{market_id: desc}, {price: desc}]
  ) {
    market: market_id
    price
  }
  asks: Order(
    where: $askWhere
    distinct_on: market_id
    order_by: [{market_id: asc}, {price: asc}]
  ) {
    market: market_id
    price
  }
}
    `) as unknown as TypedDocumentString<BookTopsQuery, BookTopsQueryVariables>;
export const FundingPaymentsDocument = new TypedDocumentString(`
    query FundingPayments($where: FundingPayment_bool_exp!, $limit: Int, $offset: Int) {
  FundingPayment(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    account
    pool
    amount
    timestamp
    txHash
  }
}
    `) as unknown as TypedDocumentString<FundingPaymentsQuery, FundingPaymentsQueryVariables>;
export const MarginEventsDocument = new TypedDocumentString(`
    query MarginEvents($account: String!, $limit: Int, $offset: Int) {
  MarginEvent(
    where: {account: {_eq: $account}}
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    account
    kind
    pool
    amount
    granter
    timestamp
    txHash
  }
}
    `) as unknown as TypedDocumentString<MarginEventsQuery, MarginEventsQueryVariables>;
export const LiquidationsDocument = new TypedDocumentString(`
    query Liquidations($where: LiquidationEvent_bool_exp!, $limit: Int, $offset: Int) {
  LiquidationEvent(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    account
    pool
    kind
    size
    price
    counterparty
    penalty
    badDebt
    insuranceCovered
    deficit
    coverageDeclined
    collateralAmount
    equity
    positionsProcessed
    stageReached
    marginStatusBefore
    marginStatusAfter
    timestamp
    blockNumber
    txHash
  }
}
    `) as unknown as TypedDocumentString<LiquidationsQuery, LiquidationsQueryVariables>;
export const FundingRateHistoryDocument = new TypedDocumentString(`
    query FundingRateHistory($where: FundingRateUpdate_bool_exp!, $orderBy: [FundingRateUpdate_order_by!], $limit: Int, $offset: Int) {
  FundingRateUpdate(
    where: $where
    order_by: $orderBy
    limit: $limit
    offset: $offset
  ) {
    id
    pool
    fundingRate
    cumulativeFundingPerUnit
    indexPrice
    markPrice
    intervalsSettled
    intervalsAccrued
    fundingWindowSec
    fundingIntervalSec
    spanStart
    spanEnd
    anchorResynced
    timestamp
    blockNumber
    txHash
  }
}
    `) as unknown as TypedDocumentString<FundingRateHistoryQuery, FundingRateHistoryQueryVariables>;
export const FundingRateCandlesDocument = new TypedDocumentString(`
    query FundingRateCandles($where: FundingRateCandle_bool_exp!, $limit: Int, $offset: Int) {
  FundingRateCandle(
    where: $where
    order_by: {bucketStart: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    pool
    intervalSeconds
    bucketStart
    avgFundingRate8h
    minFundingRate8h
    maxFundingRate8h
    coverage
    cumulativeFundingStart
    cumulativeFundingEnd
    fundingWindowSec
    fundingIntervalSec
    paramsChangedInBucket
    indexPriceEnd
    openInterestEnd
    updateCount
  }
}
    `) as unknown as TypedDocumentString<FundingRateCandlesQuery, FundingRateCandlesQueryVariables>;
export const PerpFeesDocument = new TypedDocumentString(`
    query PerpFees($where: PerpFeeRecord_bool_exp!, $limit: Int, $offset: Int) {
  PerpFeeRecord(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    account
    pool
    amount
    isRebate
    kind
    insurancePortion
    tier
    fillNotional
    builder
    timestamp
    txHash
  }
}
    `) as unknown as TypedDocumentString<PerpFeesQuery, PerpFeesQueryVariables>;
export const OpenInterestHistoryDocument = new TypedDocumentString(`
    query OpenInterestHistory($pool: String!, $limit: Int, $offset: Int) {
  OpenInterestSnapshot(
    where: {pool: {_eq: $pool}}
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    pool
    openInterest
    timestamp
    blockNumber
  }
}
    `) as unknown as TypedDocumentString<OpenInterestHistoryQuery, OpenInterestHistoryQueryVariables>;
export const PerpPortfolioDocument = new TypedDocumentString(`
    query PerpPortfolio($acct: String!, $fillWhere: Fill_bool_exp!, $ordersLimit: Int, $tradesLimit: Int) {
  PerpOrder: Order(
    where: {owner: {_eq: $acct}, status: {_eq: "Open"}, market: {marketType: {_eq: "PERP"}}}
    order_by: {placedAtTimestamp: desc}
    limit: $ordersLimit
  ) {
    id
    orderId
    isBid
    price
    quantityRemaining
    filledQuantity
    fullQuantity
    placedAtTimestamp
    placedTxHash
    market {
      ...PerpPortfolioMarketFields
    }
  }
  PerpFill: Fill(
    where: $fillWhere
    order_by: {timestamp: desc}
    limit: $tradesLimit
  ) {
    id
    fillPrice
    quantity
    quoteQuantity
    timestamp
    txHash
    maker
    taker
    takerIsBid
    market {
      ...PerpPortfolioMarketFields
    }
  }
}
    fragment PerpPortfolioMarketFields on Market {
  poolAddress
  baseSymbol
  quoteSymbol
  baseDecimals
  quoteDecimals
  tickSize
  lotSize
  minQuantity
  lastPrice
  marginBank
  initialMarginBps
  fundingRate
  indexPrice
  stopRegistry
}`) as unknown as TypedDocumentString<PerpPortfolioQuery, PerpPortfolioQueryVariables>;
export const PerpOrderHistoryDocument = new TypedDocumentString(`
    query PerpOrderHistory($where: Order_bool_exp!, $orderBy: [Order_order_by!], $limit: Int, $offset: Int) {
  Order(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {
    id
    orderId
    isBid
    price
    quantityRemaining
    filledQuantity
    fullQuantity
    status
    rested
    expireTimestampNs
    placedAtTimestamp
    placedTxHash
    lastUpdatedAtTimestamp
    market {
      ...PerpPortfolioMarketFields
    }
  }
}
    fragment PerpPortfolioMarketFields on Market {
  poolAddress
  baseSymbol
  quoteSymbol
  baseDecimals
  quoteDecimals
  tickSize
  lotSize
  minQuantity
  lastPrice
  marginBank
  initialMarginBps
  fundingRate
  indexPrice
  stopRegistry
}`) as unknown as TypedDocumentString<PerpOrderHistoryQuery, PerpOrderHistoryQueryVariables>;
export const PerpPositionsDocument = new TypedDocumentString(`
    query PerpPositions($where: PerpPosition_bool_exp!, $limit: Int, $offset: Int) {
  PerpPosition(
    where: $where
    order_by: {updatedAt: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    pool
    account
    size
    isLong
    entryPriceX18
    realizedPnl
    updatedAt
    updatedAtBlock
  }
}
    `) as unknown as TypedDocumentString<PerpPositionsQuery, PerpPositionsQueryVariables>;
export const PerpStopOrdersDocument = new TypedDocumentString(`
    query PerpStopOrders($where: StopOrder_bool_exp!, $limit: Int, $offset: Int) {
  StopOrder(
    where: $where
    order_by: {createdAt: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    registry
    orderIdRaw
    owner
    isBid
    quantity
    triggerPrice
    triggerOperator
    orderType
    builder
    builderFeeBpsTimes1k
    status
    placedOrderId
    dropReason
    createdAt
    updatedAt
    txHash
    market {
      poolAddress
      baseSymbol
      quoteSymbol
      baseDecimals
      quoteDecimals
    }
  }
}
    `) as unknown as TypedDocumentString<PerpStopOrdersQuery, PerpStopOrdersQueryVariables>;
export const MarketByPoolDocument = new TypedDocumentString(`
    query MarketByPool($pool: String!) {
  Market(
    where: {poolAddress: {_eq: $pool}}
    order_by: {createdAtTimestamp: desc}
    limit: 1
  ) {
    ...MarketFields
  }
}
    fragment MarketFields on Market {
  id
  marketType
  poolAddress
  lastPrice
  lastTradeAt
  cumulativeBaseVolume
  cumulativeQuoteVolume
  tradeCount
  baseDecimals
  quoteDecimals
  createdAtTimestamp
  baseToken
  quoteToken
  baseSymbol
  quoteSymbol
  baseIsNative
  tickSize
  lotSize
  minQuantity
  markPrice
  rawMidpoint
  markPriceUpdatedAt
  stopRegistry
  marginBank
  initialMarginBps
  fundingRate
  cumulativeFundingPerUnit
  indexPrice
  fundingUpdatedAt
  fundingWindowSec
  fundingIntervalSec
  openInterest
  openInterestUpdatedAt
  marketId
  marketAddress
  yesTokenId
  noTokenId
  collateral
  asset
  question
  oracleQuestion
  oracleQuestionId
  status: clobStatus
  strike
  tradingStart
  expiry
  winningOutcome
  payoutNumerators
  payoutDenominator
  resolvedAtBlock
  resolvedAtTimestamp
  createdByTx
  creator
  voided
  backing
  nonce
  finalized
  netBacking
  context
  intervalSec
  operatorId
  venueId
}`) as unknown as TypedDocumentString<MarketByPoolQuery, MarketByPoolQueryVariables>;
export const PoolBindingsDocument = new TypedDocumentString(`
    query PoolBindings($pool: String!) {
  PoolBinding(where: {poolAddress: {_eq: $pool}}, order_by: {nonce: desc}) {
    id
    poolAddress
    marketId
    nonce
    fromBlock
    fromLogIndex
    fromTimestamp
    toBlock
    toLogIndex
    toTimestamp
    closedBy
  }
}
    `) as unknown as TypedDocumentString<PoolBindingsQuery, PoolBindingsQueryVariables>;
export const PoolByPkDocument = new TypedDocumentString(`
    query PoolByPk($id: String!) {
  Pool_by_pk(id: $id) {
    id
    address
    collateral
    creator
    currentMarketId
    currentNonce
    generationCount
    createdAtTimestamp
    updatedAtTimestamp
  }
}
    `) as unknown as TypedDocumentString<PoolByPkQuery, PoolByPkQueryVariables>;
export const RouterActionsDocument = new TypedDocumentString(`
    query RouterActions($where: RouterActionRecord_bool_exp!, $limit: Int, $offset: Int) {
  RouterActionRecord(
    where: $where
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    ...RouterActionFields
  }
}
    fragment RouterActionFields on RouterActionRecord {
  id
  kind
  account
  market: market_id
  amount
  payout
  routedVia
  timestamp
  txHash
}`) as unknown as TypedDocumentString<RouterActionsQuery, RouterActionsQueryVariables>;
export const SpotPortfolioDocument = new TypedDocumentString(`
    query SpotPortfolio($acct: String!, $fillWhere: Fill_bool_exp!, $ordersLimit: Int, $tradesLimit: Int) {
  SpotOrder: Order(
    where: {owner: {_eq: $acct}, status: {_eq: "Open"}, market: {marketType: {_eq: "SPOT"}}}
    order_by: {placedAtTimestamp: desc}
    limit: $ordersLimit
  ) {
    id
    orderId
    isBid
    price
    quantityRemaining
    filledQuantity
    fullQuantity
    placedAtTimestamp
    placedTxHash
    market {
      ...SpotPortfolioMarketFields
    }
  }
  SpotStopOrder: StopOrder(
    where: {owner: {_eq: $acct}, status: {_eq: "PENDING"}}
    order_by: {createdAt: desc}
    limit: $ordersLimit
  ) {
    ...SpotStopOrderFields
    market {
      ...SpotPortfolioMarketFields
    }
  }
  SpotFill: Fill(
    where: $fillWhere
    order_by: {timestamp: desc}
    limit: $tradesLimit
  ) {
    id
    fillPrice
    quantity
    quoteQuantity
    timestamp
    txHash
    maker
    taker
    takerIsBid
    market {
      ...SpotPortfolioMarketFields
    }
  }
}
    fragment SpotPortfolioMarketFields on Market {
  poolAddress
  baseSymbol
  quoteSymbol
  baseToken
  quoteToken
  baseDecimals
  quoteDecimals
  baseIsNative
  tickSize
  lotSize
  minQuantity
  lastPrice
  markPrice
  stopRegistry
}
fragment SpotStopOrderFields on StopOrder {
  id
  registry
  orderId: orderIdRaw
  isBid
  quantity
  triggerPrice
  triggerOperator
  orderType
  status
  placedOrderId
  createdAt
}`) as unknown as TypedDocumentString<SpotPortfolioQuery, SpotPortfolioQueryVariables>;
export const SpotStopOrdersDocument = new TypedDocumentString(`
    query SpotStopOrders($where: StopOrder_bool_exp!, $limit: Int) {
  StopOrder(where: $where, order_by: {createdAt: desc}, limit: $limit) {
    ...SpotStopOrderFields
    market {
      ...SpotPortfolioMarketFields
    }
  }
}
    fragment SpotPortfolioMarketFields on Market {
  poolAddress
  baseSymbol
  quoteSymbol
  baseToken
  quoteToken
  baseDecimals
  quoteDecimals
  baseIsNative
  tickSize
  lotSize
  minQuantity
  lastPrice
  markPrice
  stopRegistry
}
fragment SpotStopOrderFields on StopOrder {
  id
  registry
  orderId: orderIdRaw
  isBid
  quantity
  triggerPrice
  triggerOperator
  orderType
  status
  placedOrderId
  createdAt
}`) as unknown as TypedDocumentString<SpotStopOrdersQuery, SpotStopOrdersQueryVariables>;
export const SyncStatusDocument = new TypedDocumentString(`
    query SyncStatus($chainId: Int!) {
  chain_metadata(where: {chain_id: {_eq: $chainId}}) {
    chain_id
    latest_processed_block
    block_height
    num_events_processed
  }
}
    `) as unknown as TypedDocumentString<SyncStatusQuery, SyncStatusQueryVariables>;