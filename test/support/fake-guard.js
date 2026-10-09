// A stand-in for the Wasmward guard, with the methods the page uses, that a test can steer: set what it reports,
// make start() or stop() wait or fail, and emit a status change. It keeps count of what the page asked of it.
//
// It does not reimplement Wasmward's rules. `status` is what the last check found; `effective` is what
// guard.health() reports (so a test can make them differ, as they do when a check is too old).

class FakeWriteBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WriteBlockedError';
  }
}

export function createFakeGuard(config = undefined) {
  const listeners = [];
  const state = {
    name: 'vault',
    contractId: 'CFAKE',
    status: 'pending',
    consecutiveErrors: 0,
  };
  let effective;
  let startGate = Promise.resolve();
  let stopGate = Promise.resolve();
  let startError;
  let stopError;
  let usingFallback = false;

  const effectiveStatus = () => effective ?? state.status;

  const fake = {
    config,
    calls: { start: 0, stop: 0, guarded: 0 },
    running: false,

    // --- what the page calls ---
    async start() {
      fake.calls.start += 1;
      await startGate;
      if (startError !== undefined) throw startError;
      fake.running = true;
    },
    async stop() {
      fake.calls.stop += 1;
      await stopGate;
      if (stopError !== undefined) throw stopError;
      fake.running = false;
    },
    status: () => ({ vault: { ...state } }),
    health: () => ({
      ok: effectiveStatus() === 'supported',
      network: { passphrase: 'fake', verified: fake.running, usingFallback },
      contracts: { vault: { contractId: state.contractId, status: effectiveStatus(), writable: effectiveStatus() === 'supported' } },
    }),
    isWritable: () => effectiveStatus() === 'supported',
    assertWritable(name) {
      if (effectiveStatus() !== 'supported') throw new FakeWriteBlockedError(`Writes to '${name}' are blocked: the status is ${effectiveStatus()}`);
    },
    guard(name, write) {
      return async (...args) => {
        fake.calls.guarded += 1;
        fake.assertWritable(name);
        return write(...args);
      };
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },

    // --- what a test does ---
    /** Changes what the guard reports. `effective` is the status health() gives, if it should differ from `status`. */
    set({ effective: nextEffective, ...patch }) {
      Object.assign(state, patch);
      if (nextEffective !== undefined) effective = nextEffective;
      return fake;
    },
    /** Tells every subscriber that the status changed. */
    async emit(from, to) {
      for (const listener of [...listeners]) await listener({ name: 'vault', from, to, state: { ...state } });
    },
    /** Makes start() wait until the returned function is called. */
    holdStart() {
      let release;
      startGate = new Promise((resolve) => (release = resolve));
      return release;
    },
    /** Makes stop() wait until the returned function is called. */
    holdStop() {
      let release;
      stopGate = new Promise((resolve) => (release = resolve));
      return release;
    },
    /** Makes start() reject with this error (or succeed again with undefined). */
    failStart(error) {
      startError = error;
      return fake;
    },
    /** Makes stop() reject with this error (or succeed again with undefined). */
    failStop(error) {
      stopError = error;
      return fake;
    },
    useFallback(value = true) {
      usingFallback = value;
      return fake;
    },
    listenerCount: () => listeners.length,
  };
  return fake;
}

/**
 * A `createGuard` function for the app, and the list of every guard it made, in order, so a test can steer the
 * one the app is using now and check that the ones it replaced were stopped. `setup(guard, index)` runs on each new
 * guard before the app sees it.
 */
export function fakeGuardFactory(setup = () => undefined) {
  const guards = [];
  return {
    guards,
    createGuard(config) {
      const guard = createFakeGuard(config);
      setup(guard, guards.length);
      guards.push(guard);
      return guard;
    },
  };
}
