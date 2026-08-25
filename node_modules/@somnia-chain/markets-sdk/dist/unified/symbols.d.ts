import type { Address } from "viem";
import type { Market } from "../markets.js";
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
/** Strip to [A-Za-z0-9.] so synthesized parts are grammar-safe. Case is
 *  preserved — venue token symbols are mixed-case identities ("USDso",
 *  "USDC.e") and consumers key on them verbatim. */
export declare function sanitizePart(s: string): string;
/**
 *  DDMONYY (UTC) — 31DEC26 — plus an HHMM component for intraday expiries
 *  (03JUL26-0930): series markets expire many times a day, and the time is
 *  what distinguishes them, so it belongs in the symbol.
 */
export declare function expiryCode(expirySec: number): string;
/**
 *  Synthesize the base market symbol (pre-collision-suffix). `codeOf` maps a
 *  token address to its currency code (ERC-20 symbol, cached by the caller).
 */
export declare function synthesizeSymbol(m: Market, codeOf: (token: Address) => string): string;
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
export declare function withCollisionSuffix(symbol: string, m: Market): string;
/**
 *  Outcome labels per market kind. Binary is the N=2 case; categorical markets
 *  will carry their own labels on the market row.
 */
export declare function outcomesOf(m: Market): {
    label: string;
    index: number;
}[];
export declare function tradableSymbol(marketSymbol: string, outcome?: string): string;
/** Split a tradable symbol into (marketSymbol, outcome?). */
export declare function splitSymbol(symbol: string): {
    marketSymbol: string;
    outcome?: string;
};
/** True when `ref` looks like an on-chain ref rather than a symbol. */
export declare function isChainRef(ref: string): boolean;
/**
 * The symbol registry built by `loadMarkets()`: canonical symbols plus reverse
 * lookups from every on-chain identifier, so any handle resolves to a Tradable.
 */
export declare class SymbolRegistry {
    /** marketSymbol -> market */
    readonly bySymbol: Map<string, Market>;
    /** lowercased pool / market id / BinaryMarket address -> marketSymbol */
    private byRef;
    /** (Re)build from a market list. Returns the canonical symbol per market id. */
    build(markets: Market[], codeOf: (token: Address) => string): Map<string, string>;
    /**
     *  Resolve any handle — a market/tradable symbol or an on-chain ref — to a
     *  Tradable. For outcome markets addressed WITHOUT an outcome, the default
     *  tradable is outcome 0 (YES). Throws on unknown handles.
     */
    resolve(ref: string): Tradable;
}
