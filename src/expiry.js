import { describeTimeLeft, EXPIRY_WARNING_LEDGERS, expiringEntry, ledgersUntilExpiry } from '@wasmward/core';

/**
 * The "Time left" line for a contract's state: what to show, and whether it is short enough to warn about.
 * A contract runs from its instance and its Wasm code, which expire separately; the library reports the
 * sooner of the two. The text names the Wasm code when that is the one running out, because it is extended
 * with a different command. This is informational: it never changes whether writes are allowed.
 */
export function describeExpiry(state) {
  const left = ledgersUntilExpiry(state);
  if (left === undefined) return { text: 'unknown', warn: false };
  const which = expiringEntry(state) === 'code' ? ' (Wasm code)' : '';
  if (left < EXPIRY_WARNING_LEDGERS) {
    return { text: `${describeTimeLeft(left)}${which}: extend its lifetime soon`, warn: true };
  }
  return { text: `${describeTimeLeft(left)}${which}`, warn: false };
}
