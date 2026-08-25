// Minimal Hasura GraphQL-over-WebSocket client (the `graphql-transport-ws`
// subprotocol Hasura speaks). One socket multiplexes many subscriptions; the
// client owns connect → connection_init/ack → (re)subscribe, answers server
// pings, and transparently reconnects with exponential backoff, re-issuing every
// live subscription on the fresh socket.
//
// Why hand-rolled: the SDK is dependency-light (viem only), and Hasura's
// subscription protocol is small. A price-feed subscription is a FULL-STATE
// stream — every push carries the current rows — so a reconnect needs no seam or
// gap handling: re-subscribing re-delivers current state. That makes this far
// simpler than the chain-log live tail (see liveTail.ts).
//
// Uses the global `WebSocket` (browsers; Node ≥ 21). If absent, subscribe()
// throws with guidance rather than failing opaquely.

import { InvalidInputError } from "../errors.js";

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;

/** graphql-transport-ws subprotocol identifier (RFC-ish; what Hasura expects). */
const SUBPROTOCOL = "graphql-transport-ws";

type NextHandler = (data: unknown) => void;
type ErrorHandler = (err: unknown) => void;

interface Registered {
  payload: { query: string; variables: Record<string, unknown> };
  onNext: NextHandler;
  onError?: ErrorHandler;
  /** True once a `subscribe` frame for this id has been sent on the live socket. */
  started: boolean;
}

/** A live multiplexed Hasura subscription socket for one endpoint. */
export class HasuraWsClient {
  private ws: WebSocket | null = null;
  private acked = false;
  private closed = false;
  private nextId = 1;
  private readonly subs = new Map<string, Registered>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_BASE_MS;

  /**
   * @param url  ws:// or wss:// GraphQL endpoint.
   * @param onStatus  Called with the live connection state (ack ⇒ true, drop ⇒ false).
   */
  constructor(
    private readonly url: string,
    private readonly onStatus?: (connected: boolean) => void,
  ) {}

  /**
   *  Register a subscription. It is (re)sent whenever the socket is live, and
   *  torn down on the returned unsubscribe.
   */
  subscribe(
    query: string,
    variables: Record<string, unknown>,
    onNext: NextHandler,
    onError?: ErrorHandler,
  ): () => void {
    const id = String(this.nextId++);
    this.subs.set(id, { payload: { query, variables }, onNext, onError, started: false });
    this.ensureSocket();
    if (this.acked) this.start(id);
    return () => this.stop(id);
  }

  /** Tear down the socket and forget every subscription. Idempotent. */
  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.subs.clear();
    this.teardownSocket();
    this.onStatus?.(false);
  }

  private start(id: string): void {
    const sub = this.subs.get(id);
    if (!sub || sub.started || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    sub.started = true;
    this.send({ id, type: "subscribe", payload: sub.payload });
  }

  private stop(id: string): void {
    const sub = this.subs.get(id);
    if (!sub) return;
    this.subs.delete(id);
    if (sub.started && this.ws?.readyState === WebSocket.OPEN) this.send({ id, type: "complete" });
    // Last subscription gone → drop the socket (a fresh one opens on next subscribe).
    if (this.subs.size === 0) {
      this.closed = false; // allow a future subscribe() to reopen
      this.teardownSocket();
    }
  }

  private ensureSocket(): void {
    if (this.ws || this.closed) return;
    const WS: typeof WebSocket | undefined = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!WS) {
      throw new InvalidInputError(
        "price-feed subscriptions need a global WebSocket (browser, or Node ≥ 21). Provide one via globalThis.WebSocket.",
      );
    }
    const ws = new WS(this.url, SUBPROTOCOL);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws === ws) this.send({ type: "connection_init" });
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws === ws) this.onMessage(ev.data);
    };
    ws.onclose = () => this.onDisconnect(ws);
    ws.onerror = () => this.onDisconnect(ws);
  }

  private onMessage(raw: unknown): void {
    let msg: { type?: string; id?: string; payload?: unknown };
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : String(raw));
    } catch {
      return;
    }
    switch (msg.type) {
      case "connection_ack": {
        this.acked = true;
        this.reconnectDelay = RECONNECT_BASE_MS;
        this.onStatus?.(true);
        for (const [id, sub] of this.subs) {
          sub.started = false; // fresh socket — resend every subscription
          this.start(id);
        }
        break;
      }
      case "next": {
        const sub = msg.id ? this.subs.get(msg.id) : undefined;
        sub?.onNext((msg.payload as { data?: unknown } | undefined)?.data);
        break;
      }
      case "error": {
        const sub = msg.id ? this.subs.get(msg.id) : undefined;
        sub?.onError?.(msg.payload);
        break;
      }
      case "ping":
        this.send({ type: "pong" });
        break;
      // "complete" / "pong" / "connection_error": nothing to do here.
    }
  }

  private onDisconnect(ws: WebSocket): void {
    if (this.ws !== ws) return; // a stale handler from a socket we already replaced
    this.detach(ws);
    this.ws = null;
    this.acked = false;
    this.onStatus?.(false);
    if (this.closed || this.subs.size === 0) return;
    // Exponential backoff; the ack resets the delay.
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureSocket();
    }, delay);
  }

  private teardownSocket(): void {
    const ws = this.ws;
    this.ws = null;
    this.acked = false;
    if (!ws) return;
    this.detach(ws);
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  }

  private detach(ws: WebSocket): void {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
