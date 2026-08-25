// Reactive in-memory store for realtime price feeds — one store per client,
// holding per-asset current price + a bounded tick tape.
//
// Mirrors MaterializerStore's `useSyncExternalStore`-friendly contract: a
// monotonic version, subscribe(), commit(), and select() which memoizes derived
// snapshots by version so getSnapshot returns a stable reference between
// mutations (required to avoid React render loops). Framework-agnostic — no React
// import. Kept separate from the order-book MaterializerStore because prices come
// from a different service (the EMA price-feed indexer) on a different transport.

import type { LivePrice, PriceFeedInfo, PriceFeedStatus, PricePoint } from "./types.js";

/** Recent ticks retained per asset (bounds memory; older ones age out). */
const MAX_TICKS_PER_ASSET = 1_000;

/** Tail-wide price-feed health. */
export interface PriceFeedGlobalStatus {
  /** Any watched asset's subscription socket is currently delivering. */
  wsConnected: boolean;
  /** Number of assets with an active watch. */
  watchCount: number;
}

interface AssetState {
  latest: LivePrice | null;
  info: PriceFeedInfo | null;
  ticks: Map<string, PricePoint>;
  status: PriceFeedStatus;
}

function assetKey(asset: string): string {
  return asset.toUpperCase();
}

export class PriceStore {
  private readonly assets = new Map<string, AssetState>();
  status: PriceFeedGlobalStatus = { wsConnected: false, watchCount: 0 };

  private version = 0;
  private readonly listeners = new Set<() => void>();
  private readonly cache = new Map<string, { v: number; val: unknown }>();

  getVersion(): number {
    return this.version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Bump version and notify subscribers. Call once per applied batch/status change. */
  commit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Memoized derived snapshot — stable reference while version is unchanged. */
  select<T>(key: string, compute: () => T): T {
    const hit = this.cache.get(key);
    if (hit && hit.v === this.version) return hit.val as T;
    const val = compute();
    this.cache.set(key, { v: this.version, val });
    return val;
  }

  private state(asset: string): AssetState {
    const key = assetKey(asset);
    let s = this.assets.get(key);
    if (!s) {
      s = { latest: null, info: null, ticks: new Map(), status: "unwatched" };
      this.assets.set(key, s);
    }
    return s;
  }

  // ---- mutations (do not commit; callers batch then commit) ----

  setStatus(asset: string, status: PriceFeedStatus): void {
    this.state(asset).status = status;
  }

  setLatest(asset: string, latest: LivePrice): void {
    const s = this.state(asset);
    // Ignore an out-of-order push that would move the price backwards in time.
    if (s.latest && latest.blockNumber < s.latest.blockNumber) return;
    s.latest = latest;
    if (s.info) s.info = { ...s.info, latest };
  }

  setInfo(asset: string, info: PriceFeedInfo): void {
    this.state(asset).info = info;
    if (info.latest) this.setLatest(asset, info.latest);
  }

  mergeTicks(asset: string, points: PricePoint[]): void {
    const s = this.state(asset);
    for (const p of points) s.ticks.set(p.id, p);
    if (s.ticks.size > MAX_TICKS_PER_ASSET) {
      const sorted = [...s.ticks.values()].sort(cmpTickDesc);
      for (const p of sorted.slice(MAX_TICKS_PER_ASSET)) s.ticks.delete(p.id);
    }
  }

  setGlobalStatus(patch: Partial<PriceFeedGlobalStatus>): void {
    this.status = { ...this.status, ...patch };
  }

  /** Drop one asset's cached rows (its watch was released). */
  purgeAsset(asset: string): void {
    this.assets.delete(assetKey(asset));
  }

  // ---- selectors (memoized, stable references between mutations) ----

  getLatest(asset: string): LivePrice | null {
    const key = assetKey(asset);
    return this.select(`latest:${key}`, () => this.assets.get(key)?.latest ?? null);
  }

  getInfo(asset: string): PriceFeedInfo | null {
    const key = assetKey(asset);
    return this.select(`info:${key}`, () => this.assets.get(key)?.info ?? null);
  }

  getStatus(asset: string): PriceFeedStatus {
    return this.assets.get(assetKey(asset))?.status ?? "unwatched";
  }

  /** Recent ticks for an asset, newest first (up to `limit`). */
  getTicks(asset: string, limit: number): PricePoint[] {
    const key = assetKey(asset);
    return this.select(`ticks:${key}:${limit}`, () => {
      const s = this.assets.get(key);
      if (!s) return EMPTY_TICKS;
      return [...s.ticks.values()].sort(cmpTickDesc).slice(0, limit);
    });
  }

  getGlobalStatus(): PriceFeedGlobalStatus {
    return this.select("global", () => this.status);
  }
}

const EMPTY_TICKS: PricePoint[] = [];

/** Newest-first: by block timestamp, then block number (chain time is monotonic). */
function cmpTickDesc(a: PricePoint, b: PricePoint): number {
  return b.blockTimestamp - a.blockTimestamp || b.blockNumber - a.blockNumber;
}
