// Perp market DISCOVERY — which markets exist, and which of them are tradeable.
//
// PERP-ONLY. Spot and binary markets are discovered through the indexer; perps have
// an on-chain factory that is the actual source of truth for what has been deployed,
// which matters twice over. It survives an indexer that is behind or mid-reindex,
// and it is complete: the indexer's perp set comes from a curated manifest, so a
// market deployed after that manifest was written is invisible there and present
// here.
//
// The hard part is not enumeration, it is that "deployed" is not "tradeable". Two
// independent gates decide that, and they fail for unrelated reasons.

import type { Address, PublicClient } from "viem";
import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from "viem";
import * as ReadsAbi from "../readsAbi.js";

/**
 *  Whether a failed read means "this contract does not have that function" rather than
 *  "the request did not get through".
 *
 *  Deliberately narrow. Calling a selector an older implementation never declared lands
 *  in the fallback (or nothing at all) and surfaces as a revert or as empty return
 *  data; a timeout, a rate limit or a dropped connection surfaces as neither. Catching
 *  every error instead would turn an RPC outage into a confident "this market is not
 *  registered", which is the one answer these views exist to avoid guessing at.
 */
function isMissingView(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  return Boolean(
    err.walk((e) => e instanceof ContractFunctionZeroDataError || e instanceof ContractFunctionRevertedError),
  );
}

/**
 *  ERC-165 id of `IPerpPoolFactoryMarketStatus` — the feature-detection handle that
 *  tells an upgraded factory from one predating the market-status views.
 *
 *  A separate interface from `IPerpPoolFactory` on purpose: two live rotation gates
 *  (`MarginBank.setPerpPoolFactory`, `OperatorPermissionsRegistry.setPerpPoolFactory`)
 *  check `type(IPerpPoolFactory).interfaceId`, so declaring these views there would
 *  have changed the advertised id and turned a one-contract upgrade into a
 *  coordinated three-contract one.
 */
export const PERP_POOL_FACTORY_MARKET_STATUS_INTERFACE_ID = "0xa874fb70" as const;

/**
 *  One factory-deployed perp market and whether it can actually be traded.
 *
 *  **`restricted` and `registered` are independent gates that fail for unrelated
 *  reasons.** A market can be perfectly registered with the bank and still be
 *  close-only, or unrestricted and never activated. Both have to pass, which is what
 *  {@link tradeable} folds together.
 */
export type PerpPoolStatus = {
  /** The PerpPool beacon proxy. */
  pool: Address;
  /** The synthetic base ERC-20 the market tracks. */
  baseToken: Address;
  /**
   *  The MarginBank this pool settles against, read from the pool itself.
   *
   *  Effectively a per-network singleton, but taken per-pool because the pool is
   *  what the settlement path actually uses — so this is the bank a later
   *  `getMarginAccount` / `getPerpPosition` / `getLiquidationPrice` for this market
   *  must be addressed to. Carrying it here means a consumer never has to source it
   *  separately, and never has to hardcode it per chain.
   */
  marginBank: Address;
  /**
   *  True when the market is CLOSE-ONLY: position-increasing orders revert
   *  `MarketRestricted`, while closes, reduces and cancels still work.
   *
   *  Restricted markets stay visible on purpose — holders still have to close
   *  positions, cancel orders and withdraw collateral, and liquidation runs on them
   *  unchanged. Reversible: a restriction can be a temporary wind-down rather than a
   *  retirement.
   */
  restricted: boolean;
  /**
   *  Whether {@link marginBank} has this pool registered — the ACTIVATION gate.
   *
   *  Coming from the factory only proves a pool is authentic; `addPerpPool` is the
   *  separate step that makes it usable, and `removePerpPool` revokes it. An
   *  unregistered pool rejects every settlement callback and every quote view while
   *  still reading as an ordinary market from the factory.
   *
   *  `null` when the pool's MarginBank predates `isPerpPoolRegistered` — the gate is
   *  genuinely unreadable there, and nothing substitutes for it: `getPoolTier` is
   *  itself gated on registration (so it collapses to 0 for both an
   *  uncovered-but-registered market and an unregistered one) and `getActivePerpPools`
   *  is per-account, not the registry.
   */
  registered: boolean | null;
  /**
   *  Both gates passed — not restricted AND registered. The list to show as tradeable.
   *
   *  `null` when {@link registered} is unknown: with one of the two gates unreadable,
   *  tradeability is genuinely undetermined, and reporting `false` would hide live
   *  markets while `true` would advertise dead ones.
   */
  tradeable: boolean | null;
};

/**
 *  Every perp market the factory has deployed, in deployment order (oldest first),
 *  with the two gates that decide whether it is tradeable.
 *
 *  Chain tier. **Do not build a market list from `getPerpPools()` alone** — that is
 *  the raw deployment history and includes markets wound down to close-only, so
 *  listing it unfiltered presents dead markets as tradeable.
 *
 *  Prefers the factory's `getPerpPoolStatuses()`, which returns every market's base
 *  token and restriction state in ONE call. That is not merely cheaper than pairing
 *  `getUnrestrictedPerpPools` with `getRestrictedPerpPools`: two calls can straddle a
 *  `setRestricted` and yield a set that never existed at any block.
 *
 *  Falls back, on a factory predating those views (ERC-165 says so, or has no ERC-165
 *  at all), to `getPerpPools()` plus a per-pool fan-out: the same rows at O(markets)
 *  calls, so a consumer never branches on which chain it is talking to.
 *
 *  One field does differ there, and it cannot be helped. `isPerpPoolRegistered` shipped
 *  in the SAME upgrade wave as the factory's status views, so a chain taking this
 *  fallback is precisely a chain whose bank cannot answer the registration gate —
 *  {@link PerpPoolStatus.registered} and {@link PerpPoolStatus.tradeable} come back
 *  `null` rather than guessed. Everything else is identical.
 *
 *  **The MarginBank is not a parameter.** It is a per-network singleton in practice,
 *  but each pool names its own via `PerpPool.marginBank()` — and the pool's own bank
 *  is what its settlement path actually uses, so that is the authority for whether
 *  THIS market is registered. Reading it per pool means a caller never has to source
 *  the bank separately or hardcode it per chain, and the address comes back on every
 *  row for the `getMarginAccount` / `getPerpPosition` reads that follow.
 *
 *  @param p.factory - the PerpPoolFactory
 */
export async function listPerpPoolStatuses(
  p: { factory: Address },
  client: PublicClient,
): Promise<PerpPoolStatus[]> {
  // Every read below is pinned to ONE block. The atomicity argument for preferring
  // `getPerpPoolStatuses` over two calls applies just as much to the registration
  // fan-out that follows it: unpinned, a `setRestricted` and a `removePerpPool` landing
  // mid-walk would produce a row whose two gates came from different heights — a state
  // that never coexisted on chain.
  const blockNumber = await client.getBlockNumber();
  const f = { address: p.factory, abi: ReadsAbi.perpPoolFactoryReadAbi, blockNumber } as const;

  // A factory old enough to predate the status views may also predate ERC-165 itself,
  // in which case the probe reverts rather than answering false. Treating that as
  // "no status views" is the whole point of having a fallback — letting it throw would
  // strand the callers the fallback exists for.
  const hasStatusViews = await client
    .readContract({ ...f, functionName: "supportsInterface", args: [PERP_POOL_FACTORY_MARKET_STATUS_INTERFACE_ID] })
    .catch((err: unknown) => {
      if (isMissingView(err)) return false;
      throw err;
    });

  const base = hasStatusViews
    ? (await client.readContract({ ...f, functionName: "getPerpPoolStatuses" })).map((s) => ({
        pool: s.perpPool,
        baseToken: s.baseToken,
        restricted: s.restricted,
      }))
    : await legacyStatuses(p.factory, client, blockNumber);

  return Promise.all(
    base.map(async (b) => {
      const marginBank = await client.readContract({
        address: b.pool,
        abi: ReadsAbi.perpPoolReadAbi,
        functionName: "marginBank",
        blockNumber,
      });
      // `isPerpPoolRegistered` shipped in the SAME wave as the factory's status views,
      // so a chain old enough to take the fallback above is exactly a chain whose bank
      // does not answer this — and there is no substitute: `getPoolTier` is itself
      // gated on registration, and `getActivePerpPools` is per-ACCOUNT, not the
      // registry. Unhandled, this read reverted and rejected the whole listing,
      // leaving the fallback dead on arrival on every environment it was written for.
      // Registration is reported as unknown there rather than guessed.
      const registered = await client
        .readContract({
          address: marginBank,
          abi: ReadsAbi.marginBankReadAbi,
          functionName: "isPerpPoolRegistered",
          args: [b.pool],
          blockNumber,
        })
        .catch((err: unknown) => {
          if (isMissingView(err)) return null;
          throw err;
        });
      return {
        ...b,
        marginBank,
        registered,
        tradeable: registered === null ? null : !b.restricted && registered,
      };
    }),
  );
}

/**
 *  The pre-upgrade path: enumerate, then read each pool's base token and restriction
 *  state directly. Produces exactly what `getPerpPoolStatuses` would, at O(markets)
 *  calls instead of one — and, unlike that call, NOT atomic, so a `setRestricted`
 *  landing mid-fan-out can be reflected for some pools and not others.
 */
async function legacyStatuses(
  factory: Address,
  client: PublicClient,
  blockNumber: bigint,
): Promise<Array<{ pool: Address; baseToken: Address; restricted: boolean }>> {
  const pools = await client.readContract({
    address: factory,
    abi: ReadsAbi.perpPoolFactoryReadAbi,
    functionName: "getPerpPools",
    blockNumber,
  });
  return Promise.all(
    pools.map(async (pool) => {
      const [baseToken, restricted] = await Promise.all([
        client.readContract({
          address: factory,
          abi: ReadsAbi.perpPoolFactoryReadAbi,
          functionName: "getBaseTokenForPool",
          args: [pool],
          blockNumber,
        }),
        client.readContract({
          address: pool,
          abi: ReadsAbi.perpPoolReadAbi,
          functionName: "isRestricted",
          blockNumber,
        }),
      ]);
      return { pool, baseToken, restricted };
    }),
  );
}

/**
 *  Just the tradeable markets — the common case, filtered from
 *  {@link listPerpPoolStatuses}. Chain tier.
 *
 *  @throws if any market's registration gate is unreadable (a MarginBank predating
 *  `isPerpPoolRegistered`). Silently dropping those rows would return a SHORT list
 *  that looks authoritative — the one failure a caller could not detect — so this
 *  refuses rather than guesses. Use {@link listPerpPoolStatuses} to see the markets
 *  and decide for yourself.
 */
export async function listTradeablePerpPools(p: { factory: Address }, client: PublicClient): Promise<Address[]> {
  const statuses = await listPerpPoolStatuses(p, client);
  const undetermined = statuses.filter((s) => s.tradeable === null);
  if (undetermined.length > 0) {
    throw new Error(
      `cannot determine tradeability for ${undetermined.length} of ${statuses.length} perp markets: ` +
        `their MarginBank predates isPerpPoolRegistered. Pools: ${undetermined.map((s) => s.pool).join(", ")}`,
    );
  }
  return statuses.filter((s) => s.tradeable).map((s) => s.pool);
}

/**
 *  Whether the MarginBank has a perp pool registered — the activation gate on its
 *  own.
 *
 *  Chain tier. Use when checking one known pool; {@link listPerpPoolStatuses}
 *  answers it for every market alongside the restriction gate.
 *
 *  Do not reach for `getPoolTier` instead: it is itself gated on registration, so it
 *  returns 0 for an uncovered-but-registered market and an unregistered one alike.
 */
export async function isPerpPoolRegistered(
  p: { marginBank: Address; pool: Address },
  client: PublicClient,
): Promise<boolean> {
  return client.readContract({
    address: p.marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "isPerpPoolRegistered",
    args: [p.pool],
  });
}
