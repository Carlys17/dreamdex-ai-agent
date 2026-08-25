// Watch-scope snapshot loaders. Each fetches a CONSISTENT point-in-time view
// from the Envio/Hasura indexer — entity rows plus the block they are
// consistent to (chain_metadata.latest_processed_block) in a single GraphQL
// request — so a watch's live tail can stitch onto block X+1 with no gap and
// no double-count.
//
// This is the ONE place the live tail touches the indexer: hydrating a NEW
// watch scope (a market set, or a user's history). Everything after a scope's
// seam — including WS reconnects — is materialized from chain logs.
//
// Rows are MERGED into the store (see MaterializerStore.mergeSnapshot):
// hydrating one scope never clears another scope's state.

import * as GraphqlBoundary from "./graphqlBoundary.js";
import * as Markets from "./markets.js";
import type { RawMarketRow } from "./markets.js";
import type { BinarySide, LiveFill, LiveMarket, LiveOrder, MaterializerStore, OrderStatus } from "./store.js";

/** Hydration reads go through the shared indexer boundary — failures are IndexerError. */
async function gql<T>(indexerUrl: string, query: string, variables: Record<string, unknown>): Promise<T> {
  return GraphqlBoundary.postGraphql<T>(indexerUrl, query, variables);
}

const FILL_FIELDS = `
  id market { id poolAddress } maker makerSide takerIsBid
  takerOrder_id makerOrder_id
  fillPrice quantity quoteQuantity takerRemainingQuantity makerRemainingQuantity
  timestamp blockNumber txHash
`;
const ORDER_FIELDS = `
  id market { id poolAddress } orderId owner side isBid userData price
  fullQuantity quantityRemaining filledQuantity status rested expireTimestampNs
  placedAtTimestamp placedTxHash
`;
const CHAIN_META = `chain_metadata(where: {chain_id: {_eq: $chainId}}) { latest_processed_block block_height }`;

interface RawFill {
  id: string;
  market: { id: string; poolAddress: string };
  // The indexer does not denormalize taker/takerSide/kind onto the binary Fill —
  // they are derived client-side via the takerOrder join (taker is unknown at
  // OrderFilled emission time). Only `maker` + `makerSide` are stored directly.
  maker: string | null;
  makerSide: BinarySide | null;
  /** True when the taker bought the base/YES; null until the indexer's taker bridge lands. */
  takerIsBid: boolean | null;
  takerOrder_id: string;
  makerOrder_id: string;
  fillPrice: string;
  quantity: string;
  quoteQuantity: string;
  takerRemainingQuantity: string;
  makerRemainingQuantity: string;
  timestamp: string;
  blockNumber: string | number;
  txHash: string;
}

interface RawOrder {
  id: string;
  market: { id: string; poolAddress: string };
  orderId: string;
  owner: string;
  side: BinarySide | null;
  isBid: boolean;
  userData: string;
  price: string;
  fullQuantity: string;
  quantityRemaining: string;
  filledQuantity: string;
  status: OrderStatus;
  rested: boolean;
  expireTimestampNs: string;
  placedAtTimestamp: string;
  placedTxHash: string;
}

interface RawChainMeta {
  latest_processed_block: number | null;
  block_height: number | null;
}

export interface SnapshotSeam {
  /** Block the snapshot is consistent to — the watch's tail covers snapshotBlock+1.. */
  snapshotBlock: number;
  /** Chain head as the indexer sees it */
  headBlock: number;
}

export interface MarketsSnapshotResult extends SnapshotSeam {
  /** Lowercased pool addresses of the hydrated markets — the watch's book set */
  pools: string[];
  /** Lowercased BinaryMarket contract addresses — the watch's status-event set */
  marketAddresses: string[];
}

function seamOf(meta: RawChainMeta | undefined): SnapshotSeam {
  const snapshotBlock = meta?.latest_processed_block ?? 0;
  return { snapshotBlock, headBlock: meta?.block_height ?? snapshotBlock };
}

function logIndexFromId(id: string): number {
  const n = Number(id.split("_")[1]);
  return Number.isFinite(n) ? n : 0;
}

function toFill(r: RawFill): LiveFill {
  return {
    id: r.id,
    market_id: r.market.id,
    pool: Markets.lower0x(Markets.asAddress(r.market.poolAddress)),
    // taker/takerSide/kind are not stored on the Fill — derived via the
    // takerOrder join client-side; left undefined here (mirrors the live reducer).
    taker: undefined,
    maker: r.maker ? Markets.lower0x(Markets.asAddress(r.maker)) : undefined,
    takerSide: undefined,
    makerSide: r.makerSide ?? undefined,
    takerIsBid: r.takerIsBid ?? undefined,
    kind: undefined,
    takerOrder_id: r.takerOrder_id,
    makerOrder_id: r.makerOrder_id,
    fillPrice: r.fillPrice,
    quantity: r.quantity,
    quoteQuantity: r.quoteQuantity,
    takerRemainingQuantity: r.takerRemainingQuantity,
    makerRemainingQuantity: r.makerRemainingQuantity,
    timestamp: r.timestamp,
    blockNumber: Number(r.blockNumber),
    logIndex: logIndexFromId(r.id),
    txHash: r.txHash,
  };
}

function toOrder(r: RawOrder): LiveOrder {
  return {
    id: r.id,
    market_id: r.market.id,
    pool: Markets.lower0x(Markets.asAddress(r.market.poolAddress)),
    orderId: r.orderId,
    owner: Markets.lower0x(Markets.asAddress(r.owner)),
    side: r.side ?? undefined,
    isBid: r.isBid,
    userData: r.userData,
    price: r.price,
    fullQuantity: r.fullQuantity,
    quantityRemaining: r.quantityRemaining,
    filledQuantity: r.filledQuantity,
    status: r.status,
    rested: r.rested,
    expireTimestampNs: r.expireTimestampNs,
    createdAt: r.placedAtTimestamp,
    txHash: r.placedTxHash,
  };
}

interface MarketsSnapshotResponse {
  chain_metadata: RawChainMeta[];
  Market: RawMarketRow[];
  Fill: RawFill[];
  openOrders?: RawOrder[];
}

/**
 * Hydrate a market watch scope: the market rows, their recent fills, and their
 * full resting open-order set (the local live book's starting depth), merged
 * into the store. `scope` is a pool-address list, or `"all"` for every market
 * the indexer knows (the all-markets watch).
 */
export async function loadMarketsSnapshot(
  chainId: number,
  scope: string[] | "all",
  deps: { indexerUrl: string; store: MaterializerStore },
): Promise<MarketsSnapshotResult> {
  const scoped = scope !== "all";
  const pools = scoped ? scope.map((p) => p.toLowerCase()) : [];
  const marketWhere = scoped ? `where: {poolAddress: {_in: $pools}}, ` : "";
  const fillWhere = scoped ? `pool: {_in: $pools}` : "";
  // Seed the book with LIVE resting orders only. On-chain expiry is lazy (an
  // expired maker keeps resting with no OrderExpired event — see
  // store.bookLevels), so filtering on status alone would hydrate dead liquidity
  // and let it crowd the per-scope order limit. Cut it off at snapshot time; the
  // live tail's per-block re-derive keeps the book current after the seam. Live
  // means now <= expiry, so `_gte` (matches store.isExpired's strict `>` cutoff).
  const nowNs = (BigInt(Math.floor(Date.now() / 1000)) * 1_000_000_000n).toString();
  const liveExpiry = `expireTimestampNs: {_gte: "${nowNs}"}`;
  const orderWhere = scoped
    ? `{status: {_eq: "Open"}, ${liveExpiry}, market: {poolAddress: {_in: $pools}}}`
    : `{status: {_eq: "Open"}, ${liveExpiry}}`;

  const data = await gql<MarketsSnapshotResponse>(
    deps.indexerUrl,
    `query MarketsSnapshot($chainId: Int!, ${scoped ? "$pools: [String!]!, " : ""}$marketLimit: Int!, $fillLimit: Int!, $orderLimit: Int!) {
      ${CHAIN_META}
      Market(${marketWhere}order_by: {createdAtTimestamp: desc}, limit: $marketLimit) { ${Markets.MARKET_FIELDS} }
      Fill(${fillWhere ? `where: {${fillWhere}}, ` : ""}order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $fillLimit) { ${FILL_FIELDS} }
      openOrders: Order(where: ${orderWhere}, order_by: {placedAtTimestamp: desc}, limit: $orderLimit) { ${ORDER_FIELDS} }
    }`,
    {
      chainId,
      ...(scoped ? { pools } : {}),
      marketLimit: scoped ? pools.length : 500,
      // Per-scope limits: a scoped watch is usually 1 pool, so these are
      // generous per market rather than a global truncation.
      fillLimit: scoped ? 200 * Math.max(1, pools.length) : 300,
      orderLimit: scoped ? 2000 * Math.max(1, pools.length) : 4000,
    },
  );

  const markets: LiveMarket[] = Markets.toMarkets(data.Market);
  deps.store.mergeSnapshot({
    markets,
    fills: data.Fill.map(toFill),
    orders: (data.openOrders ?? []).map(toOrder),
  });

  return {
    ...seamOf(data.chain_metadata[0]),
    pools: markets.map((m) => m.poolAddress.toLowerCase()),
    marketAddresses: markets.flatMap((m) =>
      m.marketType === "BINARY" ? [m.marketAddress.toLowerCase()] : [],
    ),
  };
}

interface UserSnapshotResponse {
  chain_metadata: RawChainMeta[];
  userFills: RawFill[];
  userOrders: RawOrder[];
}

/**
 * Hydrate a user watch scope: the account's past fills (as maker or taker) and
 * orders across ALL markets, merged into the store — so the user-scoped live
 * reads have history predating the watch. Live events are attributed to every
 * account regardless; this only supplies the past.
 */
export async function loadUserSnapshot(
  chainId: number,
  user: string,
  deps: { indexerUrl: string; store: MaterializerStore },
): Promise<SnapshotSeam> {
  const data = await gql<UserSnapshotResponse>(
    deps.indexerUrl,
    `query UserSnapshot($chainId: Int!, $user: String!, $userLimit: Int!) {
      ${CHAIN_META}
      userFills: Fill(
        where: {_or: [{takerOrder: {owner: {_eq: $user}}}, {maker: {_eq: $user}}]},
        order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $userLimit
      ) { ${FILL_FIELDS} }
      userOrders: Order(
        where: {owner: {_eq: $user}},
        order_by: {placedAtTimestamp: desc}, limit: $userLimit
      ) { ${ORDER_FIELDS} }
    }`,
    { chainId, user: user.toLowerCase(), userLimit: 200 },
  );

  deps.store.mergeSnapshot({
    markets: [],
    fills: data.userFills.map(toFill),
    orders: data.userOrders.map(toOrder),
  });
  return seamOf(data.chain_metadata[0]);
}
