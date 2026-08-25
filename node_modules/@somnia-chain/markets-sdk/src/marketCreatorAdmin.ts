// Write + status surface for MarketCreator — the final piece of an operator's
// "market machinery". A MarketCreator (+ its policy) is stamped out of the
// MarketCreatorFactory, bound to one (operatorId, venueId, core module, oracle
// adapter) and a default order-book config. The operator then registers time-
// series under it (each Series = a rolling up/down market spec) and funds it
// with native (it pays for reactivity rolls). `triggerRoll` / reactivity params
// call the Somnia precompile (testnet/mainnet only — no-op/revert on anvil).
//
// A directory of creators/series comes from the indexer (this module's
// `listMarketCreators` / `getMarketCreator` / `listSeries`); the on-chain reads
// here (`getMarketCreatorOnchain` / `getSeriesOnchain`) are the point reads a
// wizard uses to confirm one creator's live binding / a series' live config.

import { decodeEventLog, type Address, type Hex, type PublicClient, type TransactionReceipt } from "viem";
import * as IndexerRead from "./indexerRead.js";
import { graphql } from "./gql/gql.js";
import { NotConfiguredError, RpcError } from "./errors.js";
import type { ClientConfig } from "./config.js";
import * as MachineryAbi from "./machineryAbi.js";
import type { MachineryAdminConfig } from "./machineryWriter.js";
import * as MachineryWriter from "./machineryWriter.js";
import type { TxResult } from "./trade.js";

export type { MachineryAdminConfig as MarketCreatorAdminConfig };

/**
 *  Default CLOB order-book parameters a MarketCreator stamps onto each market it
 *  creates (mirror of the on-chain `OrderBookParameters` struct). All raw.
 */
export interface OrderBookParams {
  /** Minimum price increment, in raw quote-token (collateral) units. */
  tickSize: bigint;
  /** Minimum order quantity, in raw base-token (outcome-share) units. */
  minQuantity: bigint;
  /** Minimum quantity increment, in raw base-token (outcome-share) units. */
  lotSize: bigint;
}

/** Params for {@link MarketCreatorAdmin.createMarketCreator}. */
export interface CreateMarketCreatorParams {
  /** Owner of the minted creator (can register series / trigger rolls). */
  owner: Address;
  /**
   *  Oracle adapter the creator's markets resolve against. Defaults to the
   *  protocol's OracleHub (`config.addresses.oracleHub`) — Oracle v2's ONE
   *  approved adapter; there is nothing to mint or arm per operator.
   */
  adapter?: Address;
  /** Origin operator id the creator's markets are attributed to. */
  operatorId: number;
  /**
   *  Origin venue id (within the operator). Must be a BINARY_V1 venue whose
   *  create path does NOT require a venue signature — the automated roll loop
   *  cannot produce per-create signatures.
   */
  venueId: Hex;
  /** Default order-book config stamped onto every market the creator deploys. */
  defaultBookParams: OrderBookParams;
  /**
   *  Core BinaryMarketsModule the creator binds to. Defaults to
   *  `config.addresses.binaryModule`.
   */
  core?: Address;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}
/**
 *  Result of {@link MarketCreatorAdmin.createMarketCreator} — the two addresses
 *  the factory minted, decoded from the receipt's `MarketCreatorCreated` event.
 */
export interface CreateMarketCreatorResult extends TxResult {
  /** The minted MarketCreator address (decoded from `MarketCreatorCreated`). */
  creator: Address;
  /** The minted MarketCreatorPolicy address (decoded from `MarketCreatorCreated`). */
  policy: Address;
}

/** Params for {@link MarketCreatorAdmin.fundMarketCreator}. */
export interface FundMarketCreatorParams {
  /** The MarketCreator to fund. */
  creator: Address;
  /** Native amount (wei) to send to the creator's `receive()`. */
  amountWei: bigint;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}

/**
 *  Params for {@link MarketCreatorAdmin.registerSeries} /
 *  {@link MarketCreatorAdmin.updateSeries}.
 */
export interface RegisterSeriesParams {
  /** The MarketCreator to register the series under. Caller must be its owner. */
  creator: Address;
  /**
   *  Series key within the creator; re-registering the same id overwrites the
   *  config and resets the series' oracle reference.
   */
  seriesId: number;
  /** Per-series collateral ERC-20. */
  collateral: Address;
  /**
   *  Display ticker (e.g. "BTC" — NOT a pair). Doubles as the exchange base
   *  symbol for the USDC-quoted candle sources built per roll, so it must match
   *  the spot listing on the source exchanges (Binance/OKX/…).
   */
  asset: string;
  /** Decimal precision of the oracle's numeric price answer. */
  numericDecimals: number;
  /** Roll interval in seconds; the module rejects < 60 (`InvalidSeriesConfig`). */
  intervalSec: number;
  /** Post-expiry settlement window in seconds. */
  settlementWindow: number;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}

/** Params for {@link MarketCreatorAdmin.triggerRoll}. */
export interface TriggerRollParams {
  /** The MarketCreator owning the series. Caller must be its owner. */
  creator: Address;
  /** The series to roll. */
  seriesId: number;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}

/** Params for {@link MarketCreatorAdmin.setReactivityGasParams}. */
export interface SetReactivityGasParamsParams {
  /** The MarketCreator to update. Caller must be its owner. */
  creator: Address;
  /** Priority fee per gas (wei) the reactivity callback bids. */
  priorityFeePerGas: bigint;
  /** Max fee per gas (wei) the reactivity callback bids. */
  maxFeePerGas: bigint;
  /** Gas limit reserved per reactivity subscription (gas units). */
  gasLimit: bigint;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}

/** Params for {@link MarketCreatorAdmin.armFirstRoll}. */
export interface ArmFirstRollParams {
  /** The MarketCreator owning the series. Caller must be its owner. */
  creator: Address;
  /**
   *  The series whose first roll is armed; refuses re-arming or an
   *  already-rolled series.
   */
  seriesId: number;
  /**
   *  Future, interval-aligned Unix-seconds boundary to arm the series' first roll
   *  at (typically the outgoing creator's current-market expiry for a seamless
   *  migration).
   */
  firesAtSec: bigint;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}

/** Params for {@link MarketCreatorAdmin.reclaimOracleCredit}. */
export interface ReclaimOracleCreditParams {
  /** The MarketCreator whose oracle credit is swept (permissionless). */
  creator: Address;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}

/** One MarketCreator's live on-chain binding (the point read a wizard confirms). */
export interface MarketCreatorOnchain {
  /** Core BinaryMarketsModule the creator schedules markets through (immutable). */
  core: Address;
  /** Oracle adapter every series question resolves against (immutable). */
  adapter: Address;
  /** Origin operator id the creator's markets are attributed to (immutable). */
  operatorId: number;
  /** Origin venue id (within the operator) the markets are attributed to (immutable). */
  venueId: Hex;
  /** Current owner (can register series / trigger rolls). */
  owner: Address;
  /** Default order-book config applied to every market the creator deploys. */
  defaultBookParams: OrderBookParams;
}

/** One Series' live on-chain config (mirror of the `Series` struct). */
export interface SeriesOnchain {
  /** Per-series collateral ERC-20. */
  collateral: Address;
  /**
   *  Display ticker (e.g. "BTC" — NOT a pair). Doubles as the exchange base
   *  symbol for the USDC-quoted candle sources built per roll, so it must match
   *  the spot listing on the source exchanges (Binance/OKX/…).
   */
  asset: string;
  /** Decimal precision of the oracle's numeric price answer. */
  numericDecimals: number;
  /** Roll interval in seconds; `0` means the series was never registered. */
  intervalSec: number;
  /** Post-expiry settlement window in seconds. */
  settlementWindow: number;
}

/**
 *  The MarketCreator write + status surface — stamp out creators, register
 *  rolling series, fund/roll/tune them (see the module notes above). Built via
 *  `client.createMarketCreatorAdmin(config)` with a signer
 *  ({@link MarketCreatorAdminConfig}); every write sends one tx and resolves
 *  with its receipt after inclusion.
 */
export interface MarketCreatorAdmin {
  /**
   *  Stamp out a new MarketCreator (+ its policy) from the factory, bound to
   *  `(operatorId, venueId, core, adapter)` + a default book config. Resolves
   *  with the minted `creator` + `policy` (decoded from `MarketCreatorCreated`).
   */
  createMarketCreator(p: CreateMarketCreatorParams): Promise<CreateMarketCreatorResult>;
  /**
   *  Send native currency to a creator's `receive()` — it pays for reactivity
   *  rolls, so it must hold a balance on testnet/mainnet.
   */
  fundMarketCreator(p: FundMarketCreatorParams): Promise<TxResult>;
  /**
   *  Register (or overwrite) a rolling-market series under a creator. Owner-only.
   *  `intervalSec` must be >= 60 and `asset` non-empty (the module reverts
   *  otherwise).
   */
  registerSeries(p: RegisterSeriesParams): Promise<TxResult>;
  /**
   *  Overwrite an existing series — alias of {@link registerSeries} (the module
   *  upserts by `seriesId`). Provided for wizard clarity.
   */
  updateSeries(p: RegisterSeriesParams): Promise<TxResult>;
  /**
   *  Roll a series to its next market (owner-only). NOTE: calls the Somnia
   *  reactivity precompile — only succeeds on testnet/mainnet, not local anvil.
   */
  triggerRoll(p: TriggerRollParams): Promise<TxResult>;
  /**
   *  A1: arm a series' FIRST roll at a future boundary WITHOUT minting now
   *  (owner-only) — the seamless-migration tool: start a fresh MC's series exactly
   *  at the outgoing MC's expiry. NOTE: touches the reactivity precompile —
   *  testnet/mainnet only.
   */
  armFirstRoll(p: ArmFirstRollParams): Promise<TxResult>;
  /**
   *  A1: pull the creator's own accrued oracle surplus (payer credit) out of the
   *  hub into its native float. Runs automatically each roll cycle; this is the
   *  manual sweep of any leftovers. Permissionless.
   */
  reclaimOracleCredit(p: ReclaimOracleCreditParams): Promise<TxResult>;
  /** Update the creator's reactivity gas params (owner-only). */
  setReactivityGasParams(p: SetReactivityGasParamsParams): Promise<TxResult>;
  /**
   *  One creator's live binding (core/adapter/operatorId/venueId/owner + default
   *  book params). On-chain point read.
   */
  getMarketCreatorOnchain(creator: Address): Promise<MarketCreatorOnchain>;
  /**
   *  One series' live config under a creator. On-chain point read; the returned
   *  `intervalSec === 0` means the series was never registered.
   */
  getSeriesOnchain(creator: Address, seriesId: number): Promise<SeriesOnchain>;
}

/** @internal Reached via `client.createMarketCreatorAdmin(config)`. */
export interface MarketCreatorAdminDeps {
  getConfig: () => ClientConfig;
  getClient: () => PublicClient;
}

const toBookTuple = (p: OrderBookParams) => ({
  tickSize: p.tickSize,
  minQuantity: p.minQuantity,
  lotSize: p.lotSize,
});

export function createMarketCreatorAdminWithDeps(
  config: MachineryAdminConfig,
  deps: MarketCreatorAdminDeps,
): MarketCreatorAdmin {
  const factory = deps.getConfig().addresses?.marketCreatorFactory;
  const binaryModule = deps.getConfig().addresses?.binaryModule;
  const writer = MachineryWriter.makeMachineryWriter(config, deps, "createMarketCreatorAdmin");
  const pc = () => deps.getClient();

  function requireFactory(): Address {
    if (!factory) {
      throw new NotConfiguredError("config.addresses.marketCreatorFactory", "createMarketCreatorAdmin");
    }
    return factory;
  }
  function resolveCore(explicit?: Address): Address {
    const core = explicit ?? binaryModule;
    if (!core) {
      throw new NotConfiguredError("core or config.addresses.binaryModule", "createMarketCreator");
    }
    return core;
  }
  function resolveAdapter(explicit?: Address): Address {
    const adapter = explicit ?? deps.getConfig().addresses?.oracleHub;
    if (!adapter) {
      throw new NotConfiguredError("adapter or config.addresses.oracleHub", "createMarketCreator");
    }
    return adapter;
  }

  function decodeCreator(receipt: TransactionReceipt): { creator: Address; policy: Address } {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MachineryAbi.marketCreatorFactoryEventsAbi, data: log.data, topics: log.topics }) as {
          eventName: string;
          args: Record<string, unknown>;
        };
        if (decoded.eventName === "MarketCreatorCreated") {
          return { creator: decoded.args.creator as Address, policy: decoded.args.policy as Address };
        }
      } catch {
        continue;
      }
    }
    throw new RpcError("createMarketCreator", "the receipt carried no MarketCreatorCreated event");
  }

  async function registerSeries(p: RegisterSeriesParams): Promise<TxResult> {
    return writer.execute({
      to: p.creator,
      abi: MachineryAbi.marketCreatorAbi,
      functionName: "registerSeries",
      args: [
        p.seriesId,
        {
          collateral: p.collateral,
          asset: p.asset,
          numericDecimals: BigInt(p.numericDecimals),
          intervalSec: BigInt(p.intervalSec),
          settlementWindow: BigInt(p.settlementWindow),
        },
      ],
      gas: p.gas,
    });
  }

  return {
    async createMarketCreator(p: CreateMarketCreatorParams): Promise<CreateMarketCreatorResult> {
      const result = await writer.execute({
        to: requireFactory(),
        abi: MachineryAbi.marketCreatorFactoryAbi,
        functionName: "createMarketCreator",
        args: [p.owner, resolveCore(p.core), resolveAdapter(p.adapter), p.operatorId, p.venueId, toBookTuple(p.defaultBookParams)],
        gas: p.gas,
      });
      return { ...result, ...decodeCreator(result.receipt) };
    },

    async fundMarketCreator(p: FundMarketCreatorParams): Promise<TxResult> {
      return writer.execute({ to: p.creator, value: p.amountWei, gas: p.gas });
    },

    registerSeries,
    updateSeries: registerSeries,

    async triggerRoll(p: TriggerRollParams): Promise<TxResult> {
      return writer.execute({ to: p.creator, abi: MachineryAbi.marketCreatorAbi, functionName: "triggerRoll", args: [p.seriesId], gas: p.gas });
    },

    async armFirstRoll(p: ArmFirstRollParams): Promise<TxResult> {
      return writer.execute({ to: p.creator, abi: MachineryAbi.marketCreatorAbi, functionName: "armFirstRoll", args: [p.seriesId, p.firesAtSec], gas: p.gas });
    },

    async reclaimOracleCredit(p: ReclaimOracleCreditParams): Promise<TxResult> {
      return writer.execute({ to: p.creator, abi: MachineryAbi.marketCreatorAbi, functionName: "reclaimOracleCredit", args: [], gas: p.gas });
    },

    async setReactivityGasParams(p: SetReactivityGasParamsParams): Promise<TxResult> {
      return writer.execute({
        to: p.creator,
        abi: MachineryAbi.marketCreatorAbi,
        functionName: "setReactivityGasParams",
        args: [p.priorityFeePerGas, p.maxFeePerGas, p.gasLimit],
        gas: p.gas,
      });
    },

    async getMarketCreatorOnchain(creator: Address): Promise<MarketCreatorOnchain> {
      const c = { address: creator, abi: MachineryAbi.marketCreatorAbi } as const;
      const [core, adapter, operatorId, venueId, owner, book] = await Promise.all([
        pc().readContract({ ...c, functionName: "core" }),
        pc().readContract({ ...c, functionName: "adapter" }),
        pc().readContract({ ...c, functionName: "operatorId" }),
        pc().readContract({ ...c, functionName: "venueId" }),
        pc().readContract({ ...c, functionName: "owner" }),
        pc().readContract({ ...c, functionName: "defaultBookParams" }),
      ]);
      return {
        core,
        adapter,
        operatorId: Number(operatorId),
        venueId,
        owner,
        defaultBookParams: { tickSize: book[0], minQuantity: book[1], lotSize: book[2] },
      };
    },

    async getSeriesOnchain(creator: Address, seriesId: number): Promise<SeriesOnchain> {
      const s = (await pc().readContract({
        address: creator,
        abi: MachineryAbi.marketCreatorAbi,
        functionName: "seriesById",
        args: [seriesId],
      })) as readonly [Address, string, bigint, bigint, bigint];
      return {
        collateral: s[0],
        asset: s[1],
        numericDecimals: Number(s[2]),
        intervalSec: Number(s[3]),
        settlementWindow: Number(s[4]),
      };
    },
  };
}

// ============================================================================
// Operator "market machinery" — MarketCreators (+ policies), oracle adapters,
// and the time-series registered under a creator. These are INDEXER reads (the
// `MarketCreator` / `Series` / `OracleAdapter` / `MarketCreatorPolicy` entities
// the indexer upserts from the machinery factories + instances), NOT chain
// reads: a machinery dashboard paginates/filters server-side, exactly like the
// operator/venue directory. Writes (createMarketCreator / createOracleAdapter /
// registerSeries / setAdapterApproved / …) go on-chain via the machinery admins
// (client.createMarketCreatorAdmin / createOracleAdapterAdmin /
// createGovernanceAdmin). Field/entity names track the indexer's canonical
// machinery schema EXACTLY; all address filters lowercase their value (the
// indexer stores lowercase), like every other read in this file.
// ============================================================================

/**
 *  A Series as the indexer sees it (mirror of the `Series` entity) — one rolling
 *  up/down market spec registered under a creator.
 */
export type IndexedSeries = {
  /** Entity id: `${creatorLower}_${seriesId}`. */
  id: string;
  /** The MarketCreator this series belongs to (lowercased). */
  creatorAddress: string;
  /** Per-creator series id (uint32). */
  seriesId: number;
  /** Per-series collateral ERC-20 (lowercased). */
  collateral: string;
  /** Underlying asset label (e.g. "BTC/USDT"). */
  asset: string;
  /** Roll interval in seconds (raw bigint as string). */
  intervalSec: string;
  /**
   *  Timestamp (unix seconds) the series was registered. `null` when the row was
   *  first written by an event that carries no creation block (the handlers pass
   *  `prior?.createdAtTimestamp` through) — the indexer schema declares it
   *  nullable, so this mirrors the wire.
   */
  createdAtTimestamp: string | null;
  /** Timestamp (unix seconds) of the last update (a re-register overwrites); null until first update. */
  updatedAtTimestamp: string | null;
};

/**
 *  A MarketCreator as the indexer sees it (mirror of the `MarketCreator` entity)
 *  — one per (operator, venue) machinery instance.
 */
export type IndexedMarketCreator = {
  /** MarketCreator address (== entity id, lowercased). */
  id: string;
  /** Owner address (lowercased). */
  owner: string;
  /** The creator's MarketCreatorPolicy address (lowercased). */
  policy: string;
  /** The core BinaryMarketsModule the creator binds to (lowercased). */
  core: string;
  /** The oracle adapter the creator's markets resolve against (lowercased). */
  adapter: string;
  /** The operator the creator is bound to. */
  operatorId: number;
  /** Opaque bytes32 venue id the creator is bound to. */
  venueId: string;
  /**
   *  The MarketCreatorFactory that minted this creator (lowercased). `null` for a
   *  creator observed before/without its factory event.
   */
  factory: string | null;
  /** Block the creator was deployed in (decimal string); null when not yet observed. */
  createdAtBlock: number | null;
  /** Timestamp (unix seconds) the creator was deployed; null when not yet observed. */
  createdAtTimestamp: string | null;
  /** The series registered under this creator (nested relationship). */
  series: IndexedSeries[];
};

/** An OracleAdapter as the indexer sees it (mirror of the `OracleAdapter` entity). */
export type IndexedOracleAdapter = {
  /** Adapter address (== entity id, lowercased). */
  id: string;
  /** Owner address (lowercased). */
  owner: string;
  /**
   *  The OracleAdapterFactory that minted it (lowercased); null for the
   *  protocol's shared adapter (deployed outside the factory).
   */
  factory: string | null;
  /** Whether the module has approved the adapter (the inert→live gate). */
  approved: boolean;
  /** Timestamp the adapter was approved (null if never approved). */
  approvedAtTimestamp: string | null;
  /**
   *  Timestamp (unix seconds) the adapter was deployed/first indexed. `null` when
   *  the approval event was indexed BEFORE the creation event — the handler carries
   *  `prior?.createdAtTimestamp` forward, so an approve-first ordering leaves it
   *  unset (see indexer/src/handlers/machinery.ts).
   */
  createdAtTimestamp: string | null;
};

/**
 *  A MarketCreatorPolicy as the indexer sees it (mirror of the
 *  `MarketCreatorPolicy` entity).
 */
export type IndexedMarketCreatorPolicy = {
  /** Policy address (== entity id, lowercased). */
  id: string;
  /** Owner address (lowercased). */
  owner: string;
  /** The MarketCreator this policy gates (lowercased). */
  creator: string;
  /** Timestamp (unix seconds) the policy was deployed. */
  createdAtTimestamp: string;
};

// prettier-ignore
const SeriesFields = graphql(`
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
`);

// prettier-ignore
const MarketCreatorFields = graphql(`
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
`);

// prettier-ignore
const OracleAdapterFields = graphql(`
  fragment OracleAdapterFields on OracleAdapter {
    id
    owner
    factory
    approved
    approvedAtTimestamp
    createdAtTimestamp
  }
`);

/** Server-side filter for the MarketCreator directory. Every field optional. */
export type MarketCreatorFilter = {
  /** Restrict to creators owned by this address (case-insensitive). */
  owner?: string;
  /** Restrict to one operator id. */
  operatorId?: number;
  /** Restrict to one bytes32 venue id (case-insensitive). */
  venueId?: string;
};

/**
 *  List MarketCreators, newest-first, paginated. Pass `owner` to scope to one
 *  owner's machinery (the indexed "my creators", no log scan), `operatorId` /
 *  `venueId` to scope to one operator/venue. Each row carries its nested
 *  `series`. Indexer read.
 */
export async function listMarketCreators(
  opts: MarketCreatorFilter & { limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<IndexedMarketCreator[]> {
  const data = await IndexerRead.gqlRequest(MarketCreatorsQuery,
    { where: marketCreatorWhere(opts), limit: opts.limit ?? 20, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.MarketCreator;
}

/**
 *  Fetch one MarketCreator by its address (null if unknown), with its nested
 *  `series`. Indexer read.
 */
export async function getMarketCreator(creator: string, indexerUrl: string): Promise<IndexedMarketCreator | null> {
  const data = await IndexerRead.gqlRequest(MarketCreatorByPkQuery,
    { id: creator.toLowerCase() },
    indexerUrl,
  );
  return data.MarketCreator_by_pk;
}

/**
 *  List oracle adapters, newest-first, paginated. Pass `owner` to scope to one
 *  owner's adapters, `approved` to filter by the module-approval gate. Indexer read.
 */
export async function listOracleAdapters(
  opts: { owner?: string; approved?: boolean; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<IndexedOracleAdapter[]> {
  const where: Record<string, unknown> = {};
  if (opts.owner != null) where.owner = { _eq: opts.owner.toLowerCase() };
  if (opts.approved != null) where.approved = { _eq: opts.approved };
  const data = await IndexerRead.gqlRequest(OracleAdaptersQuery,
    { where, limit: opts.limit ?? 20, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.OracleAdapter;
}

/** Fetch one oracle adapter by its address (null if unknown). Indexer read. */
export async function getOracleAdapter(adapter: string, indexerUrl: string): Promise<IndexedOracleAdapter | null> {
  const data = await IndexerRead.gqlRequest(OracleAdapterByPkQuery,
    { id: adapter.toLowerCase() },
    indexerUrl,
  );
  return data.OracleAdapter_by_pk;
}

/** List series, creation-order, optionally scoped to one creator. Indexer read. */
export async function listSeries(
  opts: { creator?: string; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<IndexedSeries[]> {
  const where: Record<string, unknown> = {};
  if (opts.creator != null) where.creatorAddress = { _eq: opts.creator.toLowerCase() };
  const data = await IndexerRead.gqlRequest(SeriesListQuery,
    { where, limit: opts.limit ?? 100, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Series;
}

function marketCreatorWhere(f: MarketCreatorFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (f.owner != null) where.owner = { _eq: f.owner.toLowerCase() };
  if (f.operatorId != null) where.operatorId = { _eq: f.operatorId };
  if (f.venueId != null) where.venueId = { _eq: f.venueId.toLowerCase() };
  return where;
}

// prettier-ignore
const MarketCreatorsQuery = graphql(`
  query MarketCreators($where: MarketCreator_bool_exp!, $limit: Int, $offset: Int) {
         MarketCreator(where: $where, order_by: {createdAtBlock: desc}, limit: $limit, offset: $offset) {
           ...MarketCreatorFields
           series(order_by: {seriesId: asc}) { ...SeriesFields }
         }
       }
`);

// prettier-ignore
const MarketCreatorByPkQuery = graphql(`
  query MarketCreatorByPk($id: String!) {
         MarketCreator_by_pk(id: $id) {
           ...MarketCreatorFields
           series(order_by: {seriesId: asc}) { ...SeriesFields }
         }
       }
`);

// prettier-ignore
const OracleAdaptersQuery = graphql(`
  query OracleAdapters($where: OracleAdapter_bool_exp!, $limit: Int, $offset: Int) {
         OracleAdapter(where: $where, order_by: {createdAtTimestamp: desc}, limit: $limit, offset: $offset) { ...OracleAdapterFields }
       }
`);

// prettier-ignore
const OracleAdapterByPkQuery = graphql(`
  query OracleAdapterByPk($id: String!) { OracleAdapter_by_pk(id: $id) { ...OracleAdapterFields } }
`);

// prettier-ignore
const SeriesListQuery = graphql(`
  query SeriesList($where: Series_bool_exp!, $limit: Int, $offset: Int) {
         Series(where: $where, order_by: {createdAtTimestamp: asc}, limit: $limit, offset: $offset) { ...SeriesFields }
       }
`);
