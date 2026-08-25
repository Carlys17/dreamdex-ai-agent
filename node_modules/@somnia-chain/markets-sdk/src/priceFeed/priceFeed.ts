// PriceFeed — the client-side realtime price tail, scoped by ASSET.
//
// Same shape as the order-book LiveTail (liveTail.ts): nothing is tailed by
// default; callers open ref-counted watches (watchPrice(asset)) that return a
// handle, share one subscription when watched twice, and linger briefly after
// release so an unmount/remount doesn't re-snapshot. Each watch:
//
//   1. hydrates an HTTP snapshot (feed metadata + current price + recent ticks)
//      to get "roughly up to speed", then
//   2. streams live over a Hasura WebSocket subscription (Feed for the current
//      price, PricePoint for the tick tape).
//
// Unlike the chain-log tail there is NO seam to stitch: a price subscription is a
// full-state stream (every push carries current rows), so a reconnect just
// re-delivers current state — no backfill, no gap/double-count handling. The
// HasuraWsClient owns reconnect with backoff.

import type { ClientConfig } from "../config.js";
import * as Config from "../config.js";
import * as HasuraWs from "./hasuraWs.js";
import * as Query from "./query.js";
import type { PriceStore } from "./priceStore.js";
import type { PriceFeedStatus } from "./types.js";

/**
 *  A live price watch. `stop()` releases it (idempotent); the underlying
 *  subscription is shared and torn down when the last handle stops.
 */
export interface PriceWatchHandle {
  /**
   *  Release this handle's reference on the asset's watch (idempotent — extra calls
   *  are no-ops). Handles on the same asset share one subscription; stopping the
   *  LAST one tears the asset down after a short linger (which absorbs
   *  unmount/remount without re-snapshotting): the socket closes, the asset's rows
   *  are purged, and live price reads for it return null/empty again.
   */
  stop(): void;
}

/** What a PriceFeed runs against — its own config + price store, per client. */
export interface PriceFeedDeps {
  getConfig: () => ClientConfig;
  store: PriceStore;
}

/** Recent ticks pulled by the hydration snapshot + kept live by the tape subscription. */
const SNAPSHOT_TICKS = 200;
const LIVE_TAPE_LIMIT = 100;
/** How long a released asset lingers before teardown (absorbs remount/navigation). */
const RELEASE_LINGER_MS = 30_000;

interface AssetTail {
  ws: HasuraWs.HasuraWsClient;
  unsubscribes: (() => void)[];
  connected: boolean;
}

export class PriceFeed {
  private readonly refs = new Map<string, number>();
  private readonly tails = new Map<string, AssetTail>();
  private readonly hydrations = new Map<string, Promise<void>>();
  private readonly lingers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: PriceFeedDeps) {}

  /**
   *  Watch one asset's price: hydrate a snapshot and stream live updates. Resolves
   *  once the snapshot has landed (reads are populated); the socket connecting (or
   *  dropping later) is handled transparently. Rejects + releases the ref on a
   *  failed snapshot or an unconfigured asset.
   */
  async watchPrice(asset: string): Promise<PriceWatchHandle> {
    const key = this.keyOf(asset);
    this.acquire(key);
    try {
      if (!this.tails.has(key)) {
        await this.ensureHydration(key, () => this.hydrate(asset, key));
      }
    } catch (e) {
      this.releaseNow(key);
      throw e;
    }
    return this.handle(() => this.release(key));
  }

  /** Per-asset watch state (see {@link PriceFeedStatus}). */
  getStatus(asset: string): PriceFeedStatus {
    return this.deps.store.getStatus(this.keyOf(asset));
  }

  /**
   *  Tear down every price watch, subscription, and timer. The store keeps its
   *  last state (reads keep answering, stale).
   */
  stopAll(): void {
    for (const t of this.lingers.values()) clearTimeout(t);
    this.lingers.clear();
    for (const key of [...this.tails.keys()]) this.teardown(key);
    this.refs.clear();
    this.hydrations.clear();
    this.deps.store.setGlobalStatus({ wsConnected: false, watchCount: 0 });
    this.deps.store.commit();
  }

  // ---- hydration + subscription ----

  private async hydrate(asset: string, key: string): Promise<void> {
    const feed = Config.resolvePriceFeed(this.deps.getConfig());
    const assetKey = asset.toUpperCase();
    this.deps.store.setStatus(key, "hydrating");
    this.deps.store.commit();

    const { info, points } = await Query.loadPriceSnapshot(feed.url, assetKey, SNAPSHOT_TICKS, feed.quote);
    this.deps.store.setInfo(assetKey, info);
    this.deps.store.mergeTicks(assetKey, points);

    // Open the live subscription only if a watch is still active (guard against a
    // stop() that raced the snapshot).
    if ((this.refs.get(key) ?? 0) > 0) this.subscribe(assetKey, key, feed.url, feed.wsUrl, feed.quote);

    this.deps.store.setStatus(key, "live");
    this.deps.store.setGlobalStatus({ watchCount: this.tails.size });
    this.deps.store.commit();
  }

  private subscribe(asset: string, key: string, url: string, wsUrl: string, quote?: string): void {
    if (this.tails.has(key)) return;
    const ws = new HasuraWs.HasuraWsClient(wsUrl, (connected) => this.onConnStatus(key, connected));
    const tail: AssetTail = { ws, unsubscribes: [], connected: false };
    this.tails.set(key, tail);

    // `$quote` is only a declared subscription variable when the feed is
    // quote-pinned — include it in the vars only then (matches the query builders).
    const quoteVar = quote ? { quote } : {};
    tail.unsubscribes.push(
      ws.subscribe(Query.subscriptionFeed(quote), { base: asset, ...quoteVar }, (data) => {
        const feed = (data as { Feed?: unknown[] } | undefined)?.Feed?.[0];
        if (!feed) return;
        this.deps.store.setInfo(asset, Query.parseFeed(feed as never, asset));
        this.deps.store.commit();
      }),
    );
    tail.unsubscribes.push(
      ws.subscribe(Query.subscriptionTicks(quote), { base: asset, limit: LIVE_TAPE_LIMIT, ...quoteVar }, (data) => {
        const rows = (data as { PricePoint?: unknown[] } | undefined)?.PricePoint;
        if (!rows?.length) return;
        const info = this.deps.store.getInfo(asset);
        const decimals = info?.decimals ?? 18;
        this.deps.store.mergeTicks(
          asset,
          rows.map((r) => Query.parsePoint(r as never, decimals, asset)),
        );
        this.deps.store.commit();
      }),
    );
  }

  private onConnStatus(key: string, connected: boolean): void {
    const tail = this.tails.get(key);
    if (!tail) return;
    tail.connected = connected;
    // Tail-wide flag is the OR across assets — one live socket ⇒ connected.
    const anyConnected = [...this.tails.values()].some((t) => t.connected);
    this.deps.store.setGlobalStatus({ wsConnected: anyConnected });
    this.deps.store.commit();
  }

  // ---- refcount + linger plumbing (mirrors LiveTail) ----

  private acquire(key: string): void {
    this.cancelLinger(key);
    this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
  }

  private release(key: string): void {
    const count = (this.refs.get(key) ?? 0) - 1;
    if (count > 0) {
      this.refs.set(key, count);
      return;
    }
    this.refs.set(key, 0);
    this.linger(key, () => this.teardown(key));
  }

  private releaseNow(key: string): void {
    const count = (this.refs.get(key) ?? 0) - 1;
    if (count > 0) this.refs.set(key, count);
    else this.refs.delete(key);
  }

  private teardown(key: string): void {
    this.refs.delete(key);
    this.hydrations.delete(key);
    const tail = this.tails.get(key);
    if (tail) {
      for (const u of tail.unsubscribes) u();
      tail.ws.close();
      this.tails.delete(key);
    }
    this.deps.store.purgeAsset(key);
    this.deps.store.setGlobalStatus({
      watchCount: this.tails.size,
      wsConnected: [...this.tails.values()].some((t) => t.connected),
    });
    this.deps.store.commit();
  }

  private handle(stop: () => void): PriceWatchHandle {
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

  private async ensureHydration(key: string, run: () => Promise<void>): Promise<void> {
    const inFlight = this.hydrations.get(key);
    if (inFlight) return inFlight;
    const p = run().finally(() => this.hydrations.delete(key));
    this.hydrations.set(key, p);
    return p;
  }

  private keyOf(asset: string): string {
    return asset.toUpperCase();
  }
}
