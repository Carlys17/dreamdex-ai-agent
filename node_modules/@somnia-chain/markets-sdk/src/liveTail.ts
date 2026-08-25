// LiveTail — the client-side zero-latency local indexer, scoped by WATCHES.
//
// Nothing is tailed by default. Callers open ref-counted watches:
//   watchMarket(pool)          — materialize ONE market (its book, fills, orders)
//   watchAllMarkets(discover)  — materialize every market (+ optionally discover
//                                new ones live off the MarketCreator factory
//                                AND the BinaryMarketsModule)
//   watchUser(user)            — hydrate one account's order/fill HISTORY
// Each watch returns a handle; stop() releases it. The same scope watched twice
// shares one subscription (refcount), and a released scope lingers briefly
// before teardown so unmount/remount (React StrictMode, quick navigation)
// doesn't thrash snapshots.
//
// Per-scope seam (gap-free, double-count-free): subscriptions start buffering
// the scope's logs FIRST, then a consistent indexer snapshot hydrates to block
// X, a one-shot getLogs backfills [X+1, head], and the buffered logs replay
// deduped by (block, logIndex). This snapshot is the ONLY indexer touch a
// scope ever makes.
//
// Reconnects never touch the indexer: the store already holds state to block L,
// so a WS drop is healed by resubscribing and backfilling [L+1, head] from
// chain (with exponential backoff while the socket stays dead).
//
// Somnia has instant BFT finality — blocks never reorg — so a delivered block
// is final and there is no reorg handling. Somnia logs carry no timestamp, so
// the newHeads stream doubles as the timestamp source.

import { decodeEventLog, type DecodeEventLogReturnType, type Hex, type Log, type PublicClient } from "viem";
import type { ClientConfig } from "./config.js";
import type { Debug } from "./debug.js";
import * as EventsAbi from "./eventsAbi.js";
import * as LogTopics from "./logTopics.js";
import * as Markets from "./markets.js";
import type { DecodedEvent } from "./reducer.js";
import * as Reducer from "./reducer.js";
import * as Snapshot from "./snapshot.js";
import type { MaterializerStore } from "./store.js";

/** Every topic0 `liveEventsAbi` can decode — built once, not per log. */
const LIVE_TOPIC0 = LogTopics.topic0Set(EventsAbi.liveEventsAbi);

/**
 *  A live watch. `stop()` releases it (idempotent); the underlying
 *  subscription is shared and torn down when the last handle stops.
 */
export interface WatchHandle {
  /**
   *  Release this handle's reference on its watch scope (idempotent — extra calls
   *  are no-ops). Handles on the same scope share one subscription; stopping the
   *  LAST one tears down the scope's local materialization after a short linger
   *  (which absorbs unmount/remount without re-snapshotting): the subscription is
   *  dropped and the market's fills/orders are purged, so `getLive*` reads for it
   *  return empty again. The market row itself is kept for list views.
   */
  stop(): void;
}

/**
 *  Per-market watch state: `"unwatched"` (no active watch — `getLive*` reads
 *  return empty), `"hydrating"` (watch registered; snapshot/backfill/reconnect
 *  in progress), `"live"` (streaming; reads are current to the last block).
 */
export type WatchStatus = "unwatched" | "hydrating" | "live";

/**
 *  What a LiveTail runs against. Each `createClient()` passes its own config +
 *  store + WebSocket client, so two clients never share tail state.
 */
export interface TailDeps {
  getConfig: () => ClientConfig;
  store: MaterializerStore;
  getClient: () => PublicClient;
  /** @internal The owning client's debug channel (no-op when config.debug is unset). */
  dbg: Debug;
}

// Public Somnia RPC caps eth_getLogs at 1000 blocks — chunk to stay under it.
const GETLOGS_CHUNK = 1000;
// Reconnect backoff bounds (doubles per attempt, resets once live).
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;
// A heads subscription can die SILENTLY on Somnia's WS — no error event, the
// socket still answers requests and may still deliver logs (same server-side
// quirk family the rpc-proxy exists for). Symptom: fills/probabilities keep
// streaming while lastBlock freezes. If no newHeads lands for this long while
// live, probe the chain head; if it moved, the sub is dead → heal via the
// reconnect path. Somnia mints multiple blocks per second, so 15s of silence
// with a moving chain is unambiguous. (A QUIET chain — e.g. idle local anvil,
// which only mines on demand — is not a stall; the probe rules that out.)
const HEADS_STALL_MS = 15_000;
// How long a fully-released scope lingers before teardown. Covers React
// StrictMode's mount→unmount→mount and quick back/forward navigation without
// re-snapshotting.
const RELEASE_LINGER_MS = 30_000;

type RawLog = Log<bigint, number, false>;

function evKey(blockNumber: number, logIndex: number): string {
  return `${blockNumber}_${logIndex}`;
}

class LiveTail {
  private client: PublicClient | null = null;
  private unwatchHeads: (() => void) | null = null;
  private unwatchLogs: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RECONNECT_BASE_MS;

  // ---- watch registry (all keys lowercased) ----
  private poolRefs = new Map<string, number>();
  private allRefs = 0;
  private discoverRefs = 0;
  private userRefs = new Map<string, number>();
  /** Pools covered by the all-markets watch (snapshot set + live discoveries). */
  private allPools = new Set<string>();
  /** Pools whose seam has been sealed — their store rows are current. */
  private hydratedPools = new Set<string>();
  /** Users whose history snapshot has landed. */
  private hydratedUsers = new Set<string>();
  /** Scope-keyed linger timers (pool:<addr> | all | user:<addr>). */
  private lingers = new Map<string, ReturnType<typeof setTimeout>>();
  /** In-flight scope hydrations, so concurrent watchers share one snapshot. */
  private hydrations = new Map<string, Promise<void>>();
  /** Pools whose scope is mid-hydration — their logs buffer in the inbox. */
  private pendingPools = new Set<string>();

  // ---- stream state ----
  private live = false;
  private reconnecting = false;
  private lastBlock = 0;
  private lastHeadAt = 0;
  private headsWatchdog: ReturnType<typeof setInterval> | null = null;
  private probingHeads = false;
  private watchAddresses: string[] = [];
  private watchSet = new Set<string>();
  private blockTs = new Map<number, number>();
  private processed = new Set<string>();
  private inbox = new Map<string, RawLog>();

  constructor(private deps: TailDeps) {}

  private get chainId(): number {
    return this.deps.getConfig().chain.id;
  }

  /**
   *  Creation-event sources watched in discovery mode: the MarketCreator
   *  factory (its 13-field MarketCreated) AND the BinaryMarketsModule (its own
   *  19-field MarketCreated — module-created markets never pass through the
   *  MarketCreator). Either address may be absent from the config — skip it.
   */
  private get discoverySources(): string[] {
    if (this.discoverRefs === 0) return [];
    const addresses = this.deps.getConfig().addresses;
    const sources: string[] = [];
    if (addresses?.marketCreator) sources.push(addresses.marketCreator.toLowerCase());
    if (addresses?.binaryModule) sources.push(addresses.binaryModule.toLowerCase());
    return sources;
  }

  /** Every pool an active watch covers. */
  private activePools(): Set<string> {
    const pools = new Set(this.poolRefs.keys());
    if (this.allRefs > 0) for (const p of this.allPools) pools.add(p);
    for (const p of this.pendingPools) pools.add(p);
    return pools;
  }

  // ------------------------------------------------------------------
  // Watches
  // ------------------------------------------------------------------

  /** Watch one market: hydrate its snapshot and stream its events. */
  async watchMarket(pool: string): Promise<WatchHandle> {
    const key = pool.toLowerCase();
    this.acquire(this.poolRefs, key, `pool:${key}`);
    try {
      // Already streamed via the all-markets watch or a prior watch → no work.
      if (!this.hydratedPools.has(key)) {
        await this.ensureHydration(`pool:${key}`, () => this.hydratePools([key]));
      }
    } catch (e) {
      this.releaseNow(this.poolRefs, key);
      this.ensureSubscriptions();
      throw e;
    }
    return this.handle(() => this.release(this.poolRefs, key, `pool:${key}`, () => this.teardownPool(key)));
  }

  /**
   *  Watch every market the indexer knows; `discover` also watches the
   *  MarketCreator factory + the BinaryMarketsModule so markets created later
   *  join live (module-created markets emit only the module's MarketCreated).
   */
  async watchAllMarkets(discover: boolean): Promise<WatchHandle> {
    this.cancelLinger("all");
    this.allRefs++;
    if (discover) this.discoverRefs++;
    try {
      if (this.allPools.size === 0) await this.ensureHydration("all", () => this.hydrateAll());
      else this.ensureSubscriptions(); // maybe the factory just became active
    } catch (e) {
      this.allRefs--;
      if (discover) this.discoverRefs--;
      throw e;
    }
    return this.handle(() => {
      if (discover) this.discoverRefs--;
      this.allRefs--;
      if (this.allRefs === 0) this.linger("all", () => this.teardownAll());
      else this.ensureSubscriptions();
    });
  }

  /**
   *  Hydrate one account's past orders + fills (indexer, once). Live events
   *  are attributed to every account on watched markets regardless — this only
   *  supplies history, and only stays current within watched markets.
   */
  async watchUser(user: string): Promise<WatchHandle> {
    const key = user.toLowerCase();
    this.acquire(this.userRefs, key, `user:${key}`);
    try {
      if (!this.hydratedUsers.has(key)) {
        await this.ensureHydration(`user:${key}`, async () => {
          await Snapshot.loadUserSnapshot(this.chainId, key, {
            indexerUrl: this.deps.getConfig().indexerUrl,
            store: this.deps.store,
          });
          this.hydratedUsers.add(key);
          this.deps.store.commit();
        });
      }
    } catch (e) {
      this.releaseNow(this.userRefs, key);
      throw e;
    }
    // No subscription of its own — nothing to tear down beyond the refcount.
    return this.handle(() =>
      this.release(this.userRefs, key, `user:${key}`, () => {
        this.userRefs.delete(key);
        this.hydratedUsers.delete(key);
      }),
    );
  }

  /** Per-market watch state (see {@link WatchStatus}). */
  getWatchStatus(pool: string): WatchStatus {
    const key = pool.toLowerCase();
    if (this.pendingPools.has(key)) return "hydrating";
    const covered = this.poolRefs.has(key) || (this.allRefs > 0 && this.allPools.has(key));
    if (!covered) return "unwatched";
    return this.live ? "live" : "hydrating";
  }

  /**
   *  Tear down everything: all watches, subscriptions, timers. The store keeps
   *  its last state (reads keep answering, stale).
   */
  stopLive(): void {
    for (const t of this.lingers.values()) clearTimeout(t);
    this.lingers.clear();
    this.poolRefs.clear();
    this.userRefs.clear();
    this.allRefs = this.discoverRefs = 0;
    this.allPools.clear();
    this.hydratedPools.clear();
    this.hydratedUsers.clear();
    this.pendingPools.clear();
    this.hydrations.clear();
    this.unwatchHeads?.();
    this.unwatchLogs?.();
    this.unwatchHeads = this.unwatchLogs = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.live = false;
    this.watchAddresses = [];
    this.watchSet.clear();
    this.inbox.clear();
    this.deps.store.setStatus({ mode: "init", wsConnected: false, watchCount: 0 });
  }

  // ---- refcount plumbing ----

  private acquire(refs: Map<string, number>, key: string, lingerKey: string): void {
    this.cancelLinger(lingerKey);
    refs.set(key, (refs.get(key) ?? 0) + 1);
  }

  private release(refs: Map<string, number>, key: string, lingerKey: string, teardown: () => void): void {
    const count = (refs.get(key) ?? 0) - 1;
    if (count > 0) {
      refs.set(key, count);
      return;
    }
    refs.set(key, 0);
    this.linger(lingerKey, teardown);
  }

  private releaseNow(refs: Map<string, number>, key: string): void {
    const count = (refs.get(key) ?? 0) - 1;
    if (count > 0) refs.set(key, count);
    else refs.delete(key);
  }

  private handle(stop: () => void): WatchHandle {
    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        stop();
      },
    };
  }

  private linger(key: string, teardown: () => void): void {
    this.cancelLinger(key);
    this.lingers.set(
      key,
      setTimeout(() => {
        this.lingers.delete(key);
        teardown();
      }, RELEASE_LINGER_MS),
    );
  }

  private cancelLinger(key: string): void {
    const t = this.lingers.get(key);
    if (t) {
      clearTimeout(t);
      this.lingers.delete(key);
    }
  }

  private teardownPool(key: string): void {
    this.poolRefs.delete(key);
    this.hydrations.delete(`pool:${key}`);
    // Keep the market row (metadata); drop the heavy rows unless the
    // all-markets watch still covers this pool.
    if (!(this.allRefs > 0 && this.allPools.has(key))) {
      this.deps.store.purgePool(key);
      this.hydratedPools.delete(key);
    }
    this.ensureSubscriptions();
    this.deps.store.commit();
  }

  private teardownAll(): void {
    this.hydrations.delete("all");
    for (const p of this.allPools) {
      if (!this.poolRefs.has(p)) {
        this.deps.store.purgePool(p);
        this.hydratedPools.delete(p);
      }
    }
    this.allPools.clear();
    this.ensureSubscriptions();
    this.deps.store.commit();
  }

  private async ensureHydration(key: string, run: () => Promise<void>): Promise<void> {
    const inFlight = this.hydrations.get(key);
    if (inFlight) return inFlight;
    const p = this.deps.dbg
      .span(`liveTail.hydrate:${key}`, () => run())
      .finally(() => this.hydrations.delete(key));
    this.hydrations.set(key, p);
    return p;
  }

  // ------------------------------------------------------------------
  // Scope hydration — the seam
  // ------------------------------------------------------------------

  private async hydratePools(pools: string[]): Promise<void> {
    for (const p of pools) this.pendingPools.add(p);
    try {
      // Subscribe FIRST so the scope's logs buffer across the seam.
      this.ensureSubscriptions();
      const res = await Snapshot.loadMarketsSnapshot(this.chainId, pools, {
        indexerUrl: this.deps.getConfig().indexerUrl,
        store: this.deps.store,
      });
      // The snapshot revealed BinaryMarket addresses — widen the subscription.
      this.ensureSubscriptions();
      await this.sealSeam(res.snapshotBlock, res.headBlock, pools);
      for (const p of pools) this.hydratedPools.add(p);
    } finally {
      for (const p of pools) this.pendingPools.delete(p);
    }
    this.markLive();
  }

  private async hydrateAll(): Promise<void> {
    const res = await Snapshot.loadMarketsSnapshot(this.chainId, "all", {
      indexerUrl: this.deps.getConfig().indexerUrl,
      store: this.deps.store,
    });
    for (const p of res.pools) {
      this.allPools.add(p);
      this.pendingPools.add(p);
    }
    try {
      this.ensureSubscriptions();
      await this.sealSeam(res.snapshotBlock, res.headBlock, res.pools);
      for (const p of res.pools) this.hydratedPools.add(p);
    } finally {
      for (const p of res.pools) this.pendingPools.delete(p);
    }
    this.markLive();
  }

  /** Backfill [snapshot+1, head] for the scope, then replay its buffered logs. */
  private async sealSeam(snapshotBlock: number, indexerHead: number, pools: string[]): Promise<void> {
    const head = Math.max(indexerHead, this.deps.store.status.headBlock, ...this.blockTs.keys());
    const scopeAddrs = this.addressesFor(new Set(pools));
    if (scopeAddrs.length > 0 && head >= snapshotBlock + 1) {
      await this.backfill(snapshotBlock + 1, head, scopeAddrs);
    }
    this.lastBlock = Math.max(this.lastBlock, head, snapshotBlock);
    await this.replayInbox(snapshotBlock, new Set(scopeAddrs));
    this.deps.store.setStatus({ snapshotBlock, lastBlock: this.lastBlock });
  }

  private markLive(): void {
    this.live = true;
    this.retryDelay = RECONNECT_BASE_MS;
    this.deps.store.setStatus({ mode: "tailing", lastBlock: this.lastBlock, watchCount: this.activePools().size });
  }

  /** A scope's watch addresses: its pools + their BinaryMarket contracts. */
  private addressesFor(pools: Set<string>): string[] {
    const addrs = new Set<string>(pools);
    for (const pool of pools) {
      const id = this.deps.store.poolToMarket.get(pool);
      const m = id ? this.deps.store.markets.get(id) : undefined;
      if (m?.marketType === "BINARY") addrs.add(m.marketAddress.toLowerCase());
    }
    return [...addrs];
  }

  // ------------------------------------------------------------------
  // Subscriptions
  // ------------------------------------------------------------------

  /**
   *  Recompute the watch set (active pools ∪ their markets ∪ discovery
   *  sources) and (re)subscribe. No-op if unchanged. Opens the socket on
   *  first use.
   */
  private ensureSubscriptions(): void {
    const pools = this.activePools();
    const addrs = new Set(this.addressesFor(pools));
    for (const src of this.discoverySources) addrs.add(src);
    // Settlement-extraction v2: whenever ANY market is watched, also watch the
    // BinaryMarketsModule (its MarketFinalized / PoolReleased flip the pool→market
    // binding + finalized flag) and the BinarySettlement singleton (its
    // MarketFinalized / Redeemed drive the post-finalize `netBacking`). Either
    // may be absent from the config (pre-v2 envs) — skip then.
    if (pools.size > 0) {
      const a = this.deps.getConfig().addresses;
      if (a?.binaryModule) addrs.add(a.binaryModule.toLowerCase());
      if (a?.binarySettlement) addrs.add(a.binarySettlement.toLowerCase());
    }
    const next = [...addrs].sort();
    const same =
      next.length === this.watchAddresses.length && next.every((a, i) => a === this.watchAddresses[i]);
    this.deps.store.setStatus({ watchCount: pools.size });
    if (same && (this.unwatchLogs || next.length === 0)) return;

    this.unwatchLogs?.();
    this.unwatchLogs = null;
    this.watchAddresses = next;
    this.watchSet = new Set(next);

    if (next.length === 0) {
      // Last watch gone: release the heads stream too.
      this.unwatchHeads?.();
      this.unwatchHeads = null;
      this.stopHeadsWatchdog();
      return;
    }

    this.client ??= this.deps.getClient();
    // Heads carry the timestamps and the headBlock status.
    this.unwatchHeads ??= this.client.watchBlocks({
      emitMissed: true,
      includeTransactions: false,
      onBlock: (block) => void this.onHead(block),
      onError: () => this.onWsError(),
    });
    this.startHeadsWatchdog();
    this.unwatchLogs = this.client.watchEvent({
      address: next as `0x${string}`[],
      onLogs: (logs) => this.onLogs(logs as RawLog[]),
      onError: () => this.onWsError(),
    });
  }

  // ---- chain head: timestamp source for logs (which carry none) ----

  private async onHead(block: { number: bigint | null; timestamp: bigint } | undefined): Promise<void> {
    this.lastHeadAt = Date.now(); // any frame proves the heads sub is alive
    // viem's watchBlocks can emit undefined (an emitMissed backfill whose
    // getBlock returned null on a lagging node) — skip; the next head heals.
    if (!block || block.number === null) return;
    const n = Number(block.number);
    this.deps.store.setStatus({ wsConnected: true, headBlock: Math.max(n, this.deps.store.status.headBlock) });
    this.blockTs.set(n, Number(block.timestamp));
    this.pruneMaps(n);

    if (this.live) {
      this.lastBlock = Math.max(this.lastBlock, n);
      this.deps.store.setStatus({ lastBlock: this.lastBlock });
    }
  }

  // ---- logs: the realtime data path ----

  private onLogs(logs: RawLog[]): void {
    const applicable: RawLog[] = [];
    for (const l of logs) {
      if (l.blockNumber === null || l.logIndex === null) continue;
      const addr = (l.address as string).toLowerCase();
      // Buffer logs for scopes that are mid-hydration (or while the whole tail
      // is re-sealing after a reconnect); apply the rest immediately.
      if (!this.live || this.pendingPools.has(addr) || this.pendingMarketOf(addr)) {
        this.inbox.set(evKey(Number(l.blockNumber), l.logIndex), l);
      } else {
        applicable.push(l);
      }
    }
    if (applicable.length === 0) return;
    const events = applicable
      .map((l) => this.decode(l))
      .filter((e): e is DecodedEvent => e !== null && !this.processed.has(evKey(e.blockNumber, e.logIndex)))
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    if (firstEvent === undefined || lastEvent === undefined) return;
    this.deps.dbg.log("liveTail", "applying logs", {
      received: logs.length,
      applied: events.length,
      buffered: logs.length - applicable.length,
      fromBlock: firstEvent.blockNumber,
      toBlock: lastEvent.blockNumber,
    });
    for (const ev of events) {
      Reducer.applyEvent(ev, this.deps.store);
      this.processed.add(evKey(ev.blockNumber, ev.logIndex));
    }
    this.deps.store.prunePerPool();
    this.deps.store.commit();
    this.afterApply(events);
  }

  /**
   *  True when `addr` is a BinaryMarket contract whose POOL is mid-hydration —
   *  its status events must buffer with the rest of the scope.
   */
  private pendingMarketOf(addr: string): boolean {
    if (this.pendingPools.size === 0) return false;
    const id = this.deps.store.addressToMarket.get(addr);
    const m = id ? this.deps.store.markets.get(id) : undefined;
    return !!m && this.pendingPools.has(m.poolAddress.toLowerCase());
  }

  /**
   *  If a batch created new markets (MarketCreated, discovery mode), grow the
   *  all-markets set + subscriptions and sweep the creation range so any
   *  same-block activity on the new pool isn't lost across the re-subscribe.
   */
  private afterApply(events: DecodedEvent[]): void {
    const created = events.filter((e) => e.eventName === "MarketCreated");
    if (created.length === 0 || this.allRefs === 0) return;
    for (const e of created) {
      const pool = (e.args.pool as string).toLowerCase();
      this.allPools.add(pool);
      // Discovered at creation — every event since block 0 of its life is
      // covered by the stream + the catch-up backfill below.
      this.hydratedPools.add(pool);
    }
    this.ensureSubscriptions();
    const from = Math.min(...created.map((e) => e.blockNumber));
    const to = Math.max(this.lastBlock, this.deps.store.status.headBlock, from);
    void this.backfill(from, to, this.watchAddresses).catch(() => this.onWsError());
  }

  // ------------------------------------------------------------------
  // Backfill + replay
  // ------------------------------------------------------------------

  /** Fetch + reduce logs for `addresses` in [from, to] (chunked). */
  private async backfill(from: number, to: number, addresses: string[]): Promise<void> {
    if (addresses.length === 0 || to < from) return;
    this.client ??= this.deps.getClient();
    const raw: RawLog[] = [];
    for (let start = from; start <= to; start += GETLOGS_CHUNK) {
      const end = Math.min(start + GETLOGS_CHUNK - 1, to);
      const logs = await this.client.getLogs({
        address: addresses as `0x${string}`[],
        fromBlock: BigInt(start),
        toBlock: BigInt(end),
      });
      raw.push(...(logs as RawLog[]));
    }
    await this.applyLogs(raw);
  }

  /**
   *  Replay buffered logs past `after` for `scope` addresses (all, if omitted);
   *  other scopes' buffered logs stay queued.
   */
  private async replayInbox(after: number, scope?: Set<string>): Promise<void> {
    const pending: RawLog[] = [];
    for (const [key, l] of this.inbox) {
      const addr = (l.address as string).toLowerCase();
      if (scope && !scope.has(addr)) continue;
      this.inbox.delete(key);
      if (l.blockNumber !== null && Number(l.blockNumber) > after) pending.push(l);
    }
    await this.applyLogs(pending);
  }

  /** Decode, timestamp, dedupe, order, and reduce a batch of raw logs. */
  private async applyLogs(raw: RawLog[]): Promise<void> {
    if (raw.length === 0) return;
    const need = new Set<number>();
    for (const l of raw) {
      const bn = l.blockNumber === null ? null : Number(l.blockNumber);
      if (bn !== null && !this.blockTs.has(bn)) need.add(bn);
    }
    const client = (this.client ??= this.deps.getClient());
    await Promise.all(
      [...need].map(async (bn) => {
        const b = await client.getBlock({ blockNumber: BigInt(bn), includeTransactions: false });
        this.blockTs.set(bn, Number(b.timestamp));
      }),
    );

    const events = raw
      .map((l) => this.decode(l))
      .filter((e): e is DecodedEvent => e !== null && !this.processed.has(evKey(e.blockNumber, e.logIndex)))
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
    for (const ev of events) {
      Reducer.applyEvent(ev, this.deps.store);
      this.processed.add(evKey(ev.blockNumber, ev.logIndex));
    }
    this.deps.store.prunePerPool();
    this.deps.store.commit();
    this.afterApply(events);
  }

  private decode(log: RawLog): DecodedEvent | null {
    if (log.blockNumber === null || log.logIndex === null) return null;
    // viem already types `log.address` as `Address`; `lower0x` normalizes to the
    // lowercase form the watch set and store keys use WITHOUT widening to `string`.
    const address = Markets.lower0x(log.address);
    if (!this.watchSet.has(address)) return null; // not one of our sources
    // No cast: `liveEventsAbi` is `as const`, so viem returns the discriminated
    // union `DecodedEvent` is built from. Widening it to
    // `{ eventName: string; args: unknown }` here is what used to force `args: any`
    // on the far side and a cast at all ~40 reads in reducer.ts.
    // Cheap membership test BEFORE the decode. Foreign logs — an ERC-20 Transfer from
    // any token touched in the same tx — are the common case here, and letting
    // decodeEventLog reject them costs a full ABI scan plus a thrown-and-swallowed
    // BaseError: 223 µs against this 29-event ABI, versus 0.054 µs for the lookup.
    // The full ABI is still what decodes, so the discriminated union above is intact.
    if (!LogTopics.isKnownTopic0(LIVE_TOPIC0, log.topics as readonly Hex[])) return null;
    let decoded: DecodeEventLogReturnType<typeof EventsAbi.liveEventsAbi>;
    try {
      decoded = decodeEventLog({ abi: EventsAbi.liveEventsAbi, data: log.data, topics: log.topics });
    } catch {
      return null; // topic0 matched but the payload did not — a malformed log
    }
    const bn = Number(log.blockNumber);
    // Spread `decoded` whole rather than copying `eventName` and `args` field by
    // field: listing them separately breaks the correlation between them, and the
    // result no longer matches the discriminated union.
    return {
      ...decoded,
      address,
      blockNumber: bn,
      logIndex: log.logIndex,
      timestampSec: this.blockTs.get(bn) ?? Math.floor(Date.now() / 1000),
      txHash: (log.transactionHash as string) ?? "",
    };
  }

  // ------------------------------------------------------------------
  // Reconnect — chain-only healing, no indexer
  // ------------------------------------------------------------------

  private onWsError(): void {
    this.deps.store.setStatus({ wsConnected: false });
    this.live = false;
    this.scheduleReconnect();
  }

  // ---- heads watchdog: catches the error-less dead subscription ----

  private startHeadsWatchdog(): void {
    if (this.headsWatchdog) return;
    this.lastHeadAt = Date.now();
    this.headsWatchdog = setInterval(() => void this.checkHeadsStall(), HEADS_STALL_MS);
  }

  private stopHeadsWatchdog(): void {
    if (this.headsWatchdog) clearInterval(this.headsWatchdog);
    this.headsWatchdog = null;
  }

  /** No newHeads for HEADS_STALL_MS while live: probe the chain head over the
   *  request path. If the chain moved without the sub telling us, the sub is
   *  dead — run the WS-error healing path (which force-resubscribes). If even
   *  the probe fails, the socket itself is gone — same path. A chain that
   *  simply hasn't minted (idle anvil) is left alone. */
  private async checkHeadsStall(): Promise<void> {
    if (!this.live || this.reconnecting || this.probingHeads || !this.client) return;
    if (Date.now() - this.lastHeadAt < HEADS_STALL_MS) return;
    this.probingHeads = true;
    try {
      const head = Number(await this.client.getBlockNumber());
      if (head > this.lastBlock) this.onWsError();
    } catch {
      this.onWsError();
    } finally {
      this.probingHeads = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.activePools().size === 0) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, RECONNECT_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.reconnect();
    }, delay);
  }

  /**
   *  Heal after a socket drop: resubscribe (buffering), backfill everything the
   *  store missed since `lastBlock` straight from chain, replay, go live. The
   *  indexer is NOT consulted — the store's own state is the seam.
   */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.activePools().size === 0) return;
    this.reconnecting = true;
    try {
      // Tear down the (possibly silently-dead) handles first so
      // ensureSubscriptions actually re-arms both subs — its unchanged-set
      // no-op check and the heads `??=` would otherwise keep the stale
      // handles and the heads stream would never come back.
      try {
        this.unwatchHeads?.();
      } catch {
        /* dead socket */
      }
      try {
        this.unwatchLogs?.();
      } catch {
        /* dead socket */
      }
      this.unwatchHeads = null;
      this.unwatchLogs = null;
      this.ensureSubscriptions();
      const client = (this.client ??= this.deps.getClient());
      const head = Number(await client.getBlockNumber());
      this.deps.store.setStatus({ wsConnected: true, headBlock: Math.max(head, this.deps.store.status.headBlock) });
      await this.backfill(this.lastBlock + 1, head, this.watchAddresses);
      this.lastBlock = Math.max(this.lastBlock, head);
      await this.replayInbox(this.lastBlock);
      this.markLive();
    } catch {
      this.scheduleReconnect();
    } finally {
      this.reconnecting = false;
    }
  }

  private pruneMaps(headNum: number): void {
    const floor = headNum - 200;
    if (this.blockTs.size > 250) for (const k of this.blockTs.keys()) if (k < floor) this.blockTs.delete(k);
    if (this.processed.size > 4000) {
      for (const key of this.processed) if (Number(key.split("_")[0]) < floor) this.processed.delete(key);
    }
  }
}

// Each createClient() builds its own LiveTail instance from its config/store/client.
export { LiveTail };
