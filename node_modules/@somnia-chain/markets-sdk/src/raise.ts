// `raise` / `unreachable` — the concrete form of CONVENTIONS.md's "prove it
// instead" rule for values that are typed nullable but known present.
//
// A non-null assertion (`x!`) tells the COMPILER to stop worrying and leaves
// nothing behind at runtime: if the invariant is ever wrong, the value flows on
// as undefined and fails somewhere else, as something else. These throw instead —
// same brevity at the call site, but the invariant is documented and self-checking.
//
//     const last = items.at(-1) ?? unreachable("items was just bounds-checked");
//
// Reach for a real guard (or a typed error from errors.ts) when the value is
// genuinely caller-influenced — `unreachable` is for what the surrounding code
// has already established.

import { SomniaMarketsError } from "./errors.js";

/**
 *  Thrown when an invariant the code had already established turns out false.
 *
 *  **Details**
 *
 *  Seeing this in a log means the SDK's own reasoning was wrong — not that a
 *  caller did anything invalid. That distinction is why it is its own class.
 *
 *  **Gotchas**
 *
 *  It should never be caught to control flow, only reported as a bug.
 */
export class InvariantError extends SomniaMarketsError {
  constructor(message: string) {
    super(`invariant violated: ${message}`);
    this.name = "InvariantError";
  }
}

/**
 *  Throws {@link InvariantError} — for the branch that cannot happen.
 *
 *  @param message - What was assumed, so a violation reads as the broken premise
 *  rather than a bare stack trace.
 *  @returns Never returns; typed `never` so it composes with `??` and in
 *  exhaustive `switch` defaults.
 *
 *  @example
 *  ```ts
 *  const head = rows[0] ?? unreachable("rows was checked non-empty above");
 *  ```
 */
export function unreachable(message = "expected a value to be present"): never {
  throw new InvariantError(message);
}

/**
 *  Throws the given error — an expression-position `throw`, for use with `??`.
 *
 *  **When to use**
 *
 *  Use when the absence is a *caller-facing* condition deserving a specific
 *  typed error, where {@link unreachable} would wrongly imply an internal bug.
 *
 *  @param error - The error to throw.
 *  @returns Never returns; typed `never` so it composes in expression position.
 *
 *  @example
 *  ```ts
 *  const market = index.get(symbol) ?? raise(new InvalidInputError(`unknown symbol ${symbol}`));
 *  ```
 */
export function raise(error: Error): never {
  throw error;
}
