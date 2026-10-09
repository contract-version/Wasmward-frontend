/** How long to wait before the first retry of a check that could not start, in milliseconds. */
export const FIRST_RETRY_MS = 2000;

/** The longest wait between two retries. */
export const MAX_RETRY_MS = 30_000;

/**
 * How long to wait before retry number `attempt` (1 for the first): 2 seconds, then twice as long each time, never
 * more than 30 seconds. Doubling keeps a page that has lost its network from hammering the RPC, and the cap keeps it
 * from waiting so long that it looks dead once the network is back.
 */
export function retryDelayMs(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('the try number must be a whole number from 1');
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** (attempt - 1));
}

/**
 * True for an error that trying again cannot fix: a config problem such as an RPC that serves another network.
 * Anything else (the network was down, the RPC was slow) is worth another try. Wasmward names these errors, so
 * this reads the name rather than the class, which a bundler could duplicate.
 */
export function isPermanent(error) {
  return typeof error === 'object' && error !== null && error.name === 'ConfigError';
}

/** A delay in words for a message: "2 seconds". Rounded up, so it is never shorter than the real wait. */
export function describeDelay(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}
