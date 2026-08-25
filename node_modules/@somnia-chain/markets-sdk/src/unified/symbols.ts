// Symbol grammar for the exchange API. A SYMBOL names a market;
// a TRADABLE symbol names something you can place an order on. For spot the two
// coincide; for outcome markets each outcome is its own tradable:
//
//   spot          SOMI/USDC
//   perp          BTC/USDSO:USDSO           (settle-suffixed swap notation)
//   binary        BTC-95000-31DEC26/USDC    (the market)
//                 BTC-95000-31DEC26/USDC#YES · …#NO   (the tradables)
//   categorical   US-ELECTION-28/USDC#TRUMP (reserved — same grammar, N outcomes)
//
// Everything before `#` follows the symbol conventions exchange tooling
// expects; the `#OUTCOME` suffix is ours (binary markets need one).
// Symbols are synthesized deterministically from the market row; collisions
// get a `-xxxx` marketId suffix so the mapping is always 1:1. Every unified method also accepts a raw ref (pool address,
// market id, or BinaryMarket address) anywhere a symbol is expected.

import type { Address } from "viem";
import type { BinaryMarket, Market } from "../markets.js";
import { InvalidInputError } from "../errors.js";

/**
 *  A parsed + resolved tradable: the market it lives on, and (for outcome
 *  markets) which outcome book it addresses.
 */
export interface Tradable {
  /** The native market row this tradable lives on (union — narrow by `marketType`). */
  market: Market;
  /** Canonical MARKET symbol (no outcome suffix). */
  marketSymbol: string;
  /** Canonical tradable symbol (with outcome suffix where applicable). */
  symbol: string;
  /** Outcome label (binary: "YES" | "NO"); undefined for spot. */
  outcome?: string;
  /** Outcome index (binary: 0 = YES, 1 = NO); undefined for spot. */
  outcomeIndex?: number;
  /**
   *  The pool the tradable's orders go to — always `market.poolAddress`, so it
   *  carries that field's type rather than widening it back to `string`.
   */
  pool: Address;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Strip to [A-Za-z0-9.] so synthesized parts are grammar-safe. Case is
 *  preserved — venue token symbols are mixed-case identities ("USDso",
 *  "USDC.e") and consumers key on them verbatim. */
export function sanitizePart(s: string): string {
  return s.replace(/[^A-Za-z0-9.]+/g, "");
}

/**
 *  DDMONYY (UTC) — 31DEC26 — plus an HHMM component for intraday expiries
 *  (03JUL26-0930): series markets expire many times a day, and the time is
 *  what distinguishes them, so it belongs in the symbol.
 */
export function expiryCode(expirySec: number): string {
  const d = new Date(expirySec * 1000);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const date = `${day}${MONTHS[d.getUTCMonth()]}${String(d.getUTCFullYear() % 100).padStart(2, "0")}`;
  if (expirySec % 86400 === 0) return date;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date}-${hh}${mm}`;
}

/** Trim a human-readable strike string ("95000.000000" → "95000"). */
function trimStrike(strike: string): string {
  if (!strike.includes(".")) return strike;
  return strike.replace(/\.?0+$/, "");
}

/**
 *  Synthesize the base market symbol (pre-collision-suffix). `codeOf` maps a
 *  token address to its currency code (ERC-20 symbol, cached by the caller).
 */
export function synthesizeSymbol(m: Market, codeOf: (token: Address) => string): string {
  if (m.marketType === "SPOT") {
    const base = m.baseSymbol ? sanitizePart(m.baseSymbol) : codeOf(m.baseToken);
    const quote = m.quoteSymbol ? sanitizePart(m.quoteSymbol) : codeOf(m.quoteToken);
    return `${base}/${quote}`;
  }
  if (m.marketType === "PERP") {
    // Settle-suffixed swap notation — a linear perp settles in its quote.
    const base = m.baseSymbol ? sanitizePart(m.baseSymbol) : codeOf(m.baseToken);
    const quote = m.quoteSymbol ? sanitizePart(m.quoteSymbol) : codeOf(m.quoteToken);
    return `${base}/${quote}:${quote}`;
  }
  const b = m;
  const asset = sanitizePart(b.asset) || "MKT";
  const strike = sanitizePart(trimStrike(b.strike));
  const quote = codeOf(b.collateral);
  return `${asset}-${strike}-${expiryCode(Number(b.expiry))}/${quote}`;
}

/**
 *  Deterministic collision tiebreaker: the LAST 4 hex chars of the market id,
 *  inserted on the BASE side of the slash so `BASE/QUOTE` grammar stays intact
 *  (ETH-…-0930-9FC7/TUSDC, never …/TUSDC-9FC7).
 *
 *  MUST be the trailing (not leading) chars: a binary market id is the module's
 *  bytes32 `marketId` = `bytes32(++marketSeq)`, i.e. `0x0000…0013` — the LEADING
 *  hex is all zeros for every market, so `slice(0,4)` produced the SAME `-0000`
 *  tag for every colliding market and the tiebreaker didn't actually break the
 *  tie (two markets sharing an expiry-derived symbol — e.g. a 4h and a 24h market
 *  both expiring at the same wall-clock boundary — collapsed to one). The
 *  trailing chars are the part that varies (spot/perp ids are pool addresses,
 *  which vary throughout, so the tail is distinguishing there too).
 */
export function withCollisionSuffix(symbol: string, m: Market): string {
  const tag = `-${m.id.replace(/^0x/, "").slice(-4).toUpperCase()}`;
  const slash = symbol.lastIndexOf("/");
  if (slash === -1) return `${symbol}${tag}`;
  return `${symbol.slice(0, slash)}${tag}${symbol.slice(slash)}`;
}

/**
 *  Outcome labels per market kind. Binary is the N=2 case; categorical markets
 *  will carry their own labels on the market row.
 */
export function outcomesOf(m: Market): { label: string; index: number }[] {
  if (m.marketType === "BINARY") {
    return [
      { label: "YES", index: 0 },
      { label: "NO", index: 1 },
    ];
  }
  return [];
}

export function tradableSymbol(marketSymbol: string, outcome?: string): string {
  return outcome ? `${marketSymbol}#${outcome}` : marketSymbol;
}

/** Split a tradable symbol into (marketSymbol, outcome?). */
export function splitSymbol(symbol: string): { marketSymbol: string; outcome?: string } {
  const i = symbol.indexOf("#");
  if (i === -1) return { marketSymbol: symbol };
  return { marketSymbol: symbol.slice(0, i), outcome: symbol.slice(i + 1).toUpperCase() || undefined };
}

/** True when `ref` looks like an on-chain ref rather than a symbol. */
export function isChainRef(ref: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(ref) || /^0x[0-9a-fA-F]{64}$/.test(ref);
}

/**
 * The symbol registry built by `loadMarkets()`: canonical symbols plus reverse
 * lookups from every on-chain identifier, so any handle resolves to a Tradable.
 */
export class SymbolRegistry {
  /** marketSymbol -> market */
  readonly bySymbol = new Map<string, Market>();
  /** lowercased pool / market id / BinaryMarket address -> marketSymbol */
  private byRef = new Map<string, string>();

  /** (Re)build from a market list. Returns the canonical symbol per market id. */
  build(markets: Market[], codeOf: (token: Address) => string): Map<string, string> {
    this.bySymbol.clear();
    this.byRef.clear();
    // First pass: synthesize; collect collisions.
    const proposed = new Map<string, Market[]>();
    for (const m of markets) {
      const s = synthesizeSymbol(m, codeOf);
      const arr = proposed.get(s) ?? [];
      arr.push(m);
      proposed.set(s, arr);
    }
    const canonical = new Map<string, string>();
    for (const [s, ms] of proposed) {
      for (const m of ms) {
        const sym = ms.length === 1 ? s : withCollisionSuffix(s, m);
        canonical.set(m.id, sym);
        this.bySymbol.set(sym, m);
        this.byRef.set(m.id.toLowerCase(), sym);
        this.byRef.set(m.poolAddress.toLowerCase(), sym);
        if (m.marketType === "BINARY") this.byRef.set(m.marketAddress.toLowerCase(), sym);
      }
    }
    return canonical;
  }

  /**
   *  Resolve any handle — a market/tradable symbol or an on-chain ref — to a
   *  Tradable. For outcome markets addressed WITHOUT an outcome, the default
   *  tradable is outcome 0 (YES). Throws on unknown handles.
   */
  resolve(ref: string): Tradable {
    let marketSymbol: string;
    let outcome: string | undefined;
    if (isChainRef(ref)) {
      const sym = this.byRef.get(ref.toLowerCase());
      if (!sym) throw new InvalidInputError(`unknown market ref ${ref} — call loadMarkets() first`);
      marketSymbol = sym;
    } else {
      ({ marketSymbol, outcome } = splitSymbol(ref));
    }
    const market = this.bySymbol.get(marketSymbol);
    if (!market) throw new InvalidInputError(`unknown symbol ${ref} — call loadMarkets() first`);

    const outcomes = outcomesOf(market);
    if (outcomes.length === 0) {
      if (outcome) throw new InvalidInputError(`${marketSymbol} is a ${market.marketType} market — it has no outcomes`);
      return { market, marketSymbol, symbol: marketSymbol, pool: market.poolAddress };
    }
    const chosen = outcome
      ? outcomes.find((o) => o.label === outcome)
      : outcomes[0]; // outcome markets default to outcome 0 (YES)
    if (!chosen) {
      throw new InvalidInputError(
        `${marketSymbol} has no outcome "${outcome}" (has: ${outcomes.map((o) => o.label).join(", ")})`,
      );
    }
    return {
      market,
      marketSymbol,
      symbol: tradableSymbol(marketSymbol, chosen.label),
      outcome: chosen.label,
      outcomeIndex: chosen.index,
      pool: market.poolAddress,
    };
  }
}
