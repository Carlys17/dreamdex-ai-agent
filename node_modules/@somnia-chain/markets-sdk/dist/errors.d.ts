/**
 *  Base class for every error the SDK raises.
 *
 *  **When to use**
 *
 *  Use when you want "anything the SDK itself rejected" without enumerating
 *  subclasses — typically an application's top-level boundary. To branch on
 *  *what went wrong*, catch (or `instanceof`-test) the subclass instead; each
 *  one documents the action it implies.
 *
 *  **Gotchas**
 *
 *  Catching this is not the same as catching everything. Errors thrown by code
 *  the SDK calls but does not own — a `walletClient` an app passed in, a
 *  user-supplied sink — surface as-is, so keep a `else throw e` arm.
 *
 *  @example
 *  ```ts
 *  import { SomniaMarketsError, ContractRevertError } from "@somnia-chain/markets-sdk";
 *
 *  try {
 *    await exchange.createOrder("BTC/USDC", "buy", 1n, 50_000n);
 *  } catch (e) {
 *    if (e instanceof ContractRevertError) console.error("chain rejected:", e.errorName);
 *    else if (e instanceof SomniaMarketsError) console.error("sdk:", e.message);
 *    else throw e;
 *  }
 *  ```
 */
export declare class SomniaMarketsError extends Error {
    constructor(message: string, options?: ErrorOptions);
}
/**
 *  The call itself was wrong — a bad argument, an unknown symbol, or a method
 *  used against the wrong kind of market. Thrown *before* any network round-trip.
 *
 *  **Details**
 *
 *  This says the *caller* is at fault, in contrast to {@link NotConfiguredError}
 *  (the client is missing a config value) and {@link ContractRevertError} (the
 *  call was well-formed but the chain rejected it).
 *
 *  **Gotchas**
 *
 *  Never retry this. The arguments are wrong, so the same call fails the same
 *  way forever — fix the input instead of backing off.
 */
export declare class InvalidInputError extends SomniaMarketsError {
    /**
     *  @param message - What was wrong with the input.
     *  @param options - Standard `cause` passthrough.
     */
    constructor(message: string, options?: ErrorOptions);
}
/**
 *  The feature needs a contract address (or URL) that this client wasn't given.
 *
 *  **Details**
 *
 *  The SDK degrades by feature rather than refusing to construct: most
 *  {@link SomniaMarketsAddresses} entries are optional, and the methods that
 *  need one throw this when it's absent.
 *
 *  **Gotchas**
 *
 *  Because construction succeeds, a missing address surfaces at the first call
 *  that needs it rather than at `new SomniaMarkets(…)` — so a feature can look
 *  wired up until it's exercised. The fix is always config-side (pass the
 *  address, or the method's own override param), never a retry.
 */
export declare class NotConfiguredError extends SomniaMarketsError {
    readonly what: string;
    /**
     *  @param what - The config key or contract the operation needs (e.g. `"addresses.oracleHub"`).
     *  @param detail - What was being attempted, and how to supply it.
     */
    constructor(what: string, detail: string);
}
/**
 *  An authenticated (writing) method was called on a read-only client.
 *
 *  **Details**
 *
 *  Construct the exchange with a `privateKey`, an `account`, or a
 *  `walletClient` to unlock writes. Distinct from {@link NotConfiguredError}:
 *  nothing is missing from the *addresses*, the client simply has no signer.
 */
export declare class SignerRequiredError extends SomniaMarketsError {
    readonly operation: string;
    /**
     *  @param operation - The method that needs a signer (e.g. `"createOrder"`).
     */
    constructor(operation: string);
}
/**
 *  An indexer (Hasura/Envio GraphQL) request did not complete.
 *
 *  **When to use**
 *
 *  Use when opting into graceful degradation — this is the error to catch to
 *  serve stale or empty UI instead of failing a page. It is safe to treat as
 *  transient-or-misconfigured: endpoint down, bad URL, schema drift, timeout.
 *
 *  **Gotchas**
 *
 *  This ALWAYS means "the read didn't happen" — never "there is no such row".
 *  A point read that finds nothing resolves to `null` and a list read to `[]`;
 *  both are successful reads. Treating this as "not found" will hide an outage
 *  behind an empty state.
 *
 *  @example
 *  ```ts
 *  import { IndexerError } from "@somnia-chain/markets-sdk";
 *
 *  const markets = await exchange.client
 *    .listBinaryMarkets()
 *    .catch((e) => { if (e instanceof IndexerError) return []; throw e; });
 *  ```
 */
export declare class IndexerError extends SomniaMarketsError {
    readonly operation: string;
    /**
     *  @param operation - GraphQL operation name that failed (e.g. `"listBinaryMarkets"`).
     *  @param detail - Why it failed (HTTP status, GraphQL error message, "empty response").
     *  @param options - Standard `cause` passthrough — the underlying fetch/GraphQL failure.
     */
    constructor(operation: string, detail: string, options?: ErrorOptions);
}
/**
 *  A JSON-RPC / WebSocket request to the node did not complete.
 *
 *  **Details**
 *
 *  Transport-level only — the request never produced a chain answer (connection
 *  refused, timeout, unsupported method, subscription dropped).
 *
 *  **Gotchas**
 *
 *  A call that *did* reach the chain and was rejected by a contract is a
 *  {@link ContractRevertError} instead. Check for that first when branching:
 *  both are plausible for the same write, but only this one is worth retrying.
 */
export declare class RpcError extends SomniaMarketsError {
    readonly operation: string;
    /**
     *  @param operation - What was attempted (e.g. `"eth_sendRawTransaction"`, `"watchBook"`).
     *  @param detail - Why it failed.
     *  @param options - Standard `cause` passthrough — the underlying viem/transport error.
     */
    constructor(operation: string, detail: string, options?: ErrorOptions);
}
/**
 *  A contract rejected the call — the SDK decodes the revert against the
 *  protocol's custom-error ABIs so the failure reads as its Solidity name.
 *
 *  **Details**
 *
 *  `errorName` is the contract's own error (e.g. `"InsufficientBalance"`,
 *  `"MarketNotSettled"`, `"ExpiredOrderMustBeCancelled"`) and `args` its
 *  decoded parameters — that pair is what a caller branches on to decide
 *  whether to cancel-then-retry, top up collateral, or give up.
 *
 *  Thrown on every revert path: send-time rejection, pre-send simulation, a
 *  mined receipt with failed status, and `eth_call` reads.
 *
 *  **Gotchas**
 *
 *  `errorName` is not always populated. When the revert data doesn't match any
 *  known error (a bare `require` string, an unknown selector, or no data at all)
 *  it is `undefined` and `reason`/`data` carry whatever the node returned — so
 *  branch with a fallback arm rather than assuming a name. The error is still
 *  this class either way, so callers never face a raw viem error.
 *
 *  @example
 *  ```ts
 *  import { ContractRevertError } from "@somnia-chain/markets-sdk";
 *
 *  try {
 *    await trader.placeOrder(params);
 *  } catch (e) {
 *    if (e instanceof ContractRevertError && e.errorName === "ExpiredOrderMustBeCancelled") {
 *      await trader.cancelExpiredOrders({ pool });
 *    } else throw e;
 *  }
 *  ```
 */
export declare class ContractRevertError extends SomniaMarketsError {
    /** The decoded Solidity error name, or `undefined` when the revert didn't match a known error. */
    readonly errorName?: string;
    /** Decoded arguments of the custom error, positionally, when `errorName` is set. */
    readonly args?: readonly unknown[];
    /** A plain `require`/`revert` string reason, when the revert carried one instead of a custom error. */
    readonly reason?: string;
    /** Raw revert data as returned by the node, when present. */
    readonly data?: string;
    /** The contract that reverted, when known. */
    readonly address?: string;
    /** The function that was called, when known. */
    readonly functionName?: string;
    constructor(fields: {
        errorName?: string;
        args?: readonly unknown[];
        reason?: string;
        data?: string;
        address?: string;
        functionName?: string;
    }, options?: ErrorOptions);
}
