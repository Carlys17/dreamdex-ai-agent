import type { Writer as WriterCtx } from "../writer.js";
import type { ClaimOwedParams, FinalizeMarketParams, PokeOracleParams, RedeemAuthorization, RedeemDirectParams, RedeemForParams, RedeemManyParams, RedeemNativeParams, RedeemParams, ReleasePoolParams, SignRedeemAuthParams, SyncSettlementParams, TxResult, VoidExpiredParams, WithdrawVaultParams } from "../trade.js";
export declare function withdrawVault(w: WriterCtx, p: WithdrawVaultParams): Promise<TxResult>;
export declare function redeem(w: WriterCtx, p: RedeemParams): Promise<TxResult>;
export declare function signRedeemAuth(w: WriterCtx, p: SignRedeemAuthParams): Promise<RedeemAuthorization>;
export declare function redeemFor(w: WriterCtx, p: RedeemForParams): Promise<TxResult>;
export declare function redeemMany(w: WriterCtx, p: RedeemManyParams): Promise<TxResult>;
export declare function redeemDirect(w: WriterCtx, p: RedeemDirectParams): Promise<TxResult>;
export declare function claimOwed(w: WriterCtx, p: ClaimOwedParams): Promise<TxResult>;
export declare function finalizeMarket(w: WriterCtx, p: FinalizeMarketParams): Promise<TxResult>;
export declare function syncSettlement(w: WriterCtx, p: SyncSettlementParams): Promise<TxResult>;
export declare function releasePool(w: WriterCtx, p: ReleasePoolParams): Promise<TxResult>;
export declare function pokeOracle(w: WriterCtx, p: PokeOracleParams): Promise<TxResult>;
export declare function voidExpired(w: WriterCtx, p: VoidExpiredParams): Promise<TxResult>;
export declare function redeemNative(w: WriterCtx, p: RedeemNativeParams): Promise<TxResult>;
/**
 *  One market-resolution lifecycle event (mirror of the indexer
 *  `MarketResolutionEvent` entity). Oracle v2: resolution is delivered as a
 *  payout VECTOR (`MarketResolved(marketId, qid, payoutDenominator,
 *  payoutNumerators, voided)`); `winningOutcome` stays as the binary-compat
 *  derivation of a one-hot vector.
 */
export type MarketResolutionEvent = {
    /** Event id (`${blockNumber}_${logIndex}`). */
    id: string;
    /** Market id (lowercased bytes32). */
    market: string;
    /** Resolution kind, e.g. "Resolved" | "Skipped" | "Failed" (indexer-defined). */
    kind: string;
    /**
     *  Winning outcome (0 = YES, 1 = NO), derived from a one-hot payout vector;
     *  null on void / skip / non-one-hot vectors.
     */
    winningOutcome: number | null;
    /**
     *  Per-outcome payout numerators delivered with the event (decimal strings;
     *  raw Σ == payoutDenominator). Null on events indexed before the vector wire
     *  / kinds that carry none.
     */
    payoutNumerators?: string[] | null;
    /**
     *  Vector denominator (`PAYOUT_VECTOR_DENOMINATOR` = 10_000_000; decimal
     *  string). Null when no vector was carried.
     */
    payoutDenominator?: string | null;
    /** True when the market was voided (uniform vector) rather than resolved. */
    voided?: boolean | null;
    /** Block the event landed in (decimal string). */
    blockNumber: string;
    /** Timestamp (unix seconds) of the event. */
    timestamp: string;
    /** Tx hash the event landed in. */
    txHash: string;
};
/**
 *  The oracle reference a market binds to (mirror of the indexer
 *  `MarketReferenceLink` entity).
 */
export type MarketReferenceLink = {
    /** Entity id (== the lowercased marketId). */
    id: string;
    /** Market id (lowercased bytes32). */
    market: string;
    /** Reference question id the market resolves against (decimal string). */
    oracleQuestionId: string;
    /**
     *  True once the market has its own answer but the reference question is not
     *  yet final (resolution still pending on the reference).
     */
    pending: boolean;
};
/**
 *  The numeric answer the oracle posted for a question (mirror of the indexer
 *  `OracleAnswer` entity).
 */
export type OracleAnswer = {
    /** oracleQuestionId (decimal string == entity id). */
    oracleQuestionId: string;
    /** Numeric answer the oracle posted (raw; interpretation is question-specific). */
    numericValue: string | null;
    /** Human outcome label the oracle posted, if any. */
    outcomeLabel: string | null;
    /** Void reason code (non-null only on a voided answer). */
    voidReason: number | null;
    /** Timestamp (unix seconds) the answer was posted; null until posted. */
    resolvedAt: string | null;
    /** Tx hash the answer was posted in; null until posted. */
    txHash: string | null;
};
/**
 *  Everything the indexer knows about how a market resolves: the lifecycle
 *  events, the oracle reference link, and the posted oracle answer (joined by
 *  the market's `oracleQuestionId`). Any piece may be absent (`reference`/
 *  `oracleAnswer` null; `events` []). One round-trip.
 */
export declare function getMarketResolution(marketId: string, indexerUrl: string): Promise<{
    /** Resolution lifecycle events (Resolved/Skipped/Failed), oldest first; [] if none yet. */
    events: MarketResolutionEvent[];
    /** The reference-question link; null on fixed-strike (non-reference) markets. */
    reference: MarketReferenceLink | null;
    /**
     *  Oracle answer to the market's OWN resolution question. For a reference-mode
     *  up/down market this is the CLOSING price the outcome was decided on.
     */
    closingAnswer: OracleAnswer | null;
    /**
     *  Oracle answer to the REFERENCE question — the OPENING price the market
     *  resolves against ("closes at or above its opening price"). `null` for
     *  fixed-strike markets (no reference question).
     */
    openingAnswer: OracleAnswer | null;
    /** @deprecated Alias of {@link closingAnswer} — kept for back-compat. */
    oracleAnswer: OracleAnswer | null;
}>;
