import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPIRY_WARNING_LEDGERS } from '@wasmward/core';
import { describeExpiry } from '../src/expiry.js';

/** A state as the guard reports it: the instance and the Wasm code end at the given ledgers. */
const state = (instance, code, latest = 1_000) => ({
  name: 'vault',
  status: 'supported',
  liveUntilLedger: instance,
  codeLiveUntilLedger: code,
  latestLedger: latest,
});
const days = (n) => Math.round((n * 86_400) / 5);

test('says unknown before anything has been looked up', () => {
  assert.deepEqual(describeExpiry({ name: 'vault', status: 'pending' }), { text: 'unknown', warn: false });
});

test('shows plenty of time without a warning', () => {
  assert.deepEqual(describeExpiry(state(1_000 + days(29), 1_000 + days(30))), { text: 'about 29 days', warn: false });
});

test('warns, and names no entry, when the instance is the one running out', () => {
  assert.deepEqual(describeExpiry(state(1_000 + days(3), 1_000 + days(30))), {
    text: 'about 3 days: extend its lifetime soon',
    warn: true,
  });
});

test('names the Wasm code when that is the one running out, with and without a warning', () => {
  assert.deepEqual(describeExpiry(state(1_000 + days(30), 1_000 + days(12))), { text: 'about 12 days (Wasm code)', warn: false });
  assert.deepEqual(describeExpiry(state(1_000 + days(30), 1_000 + days(2))), {
    text: 'about 2 days (Wasm code): extend its lifetime soon',
    warn: true,
  });
});

test('starts warning exactly below the library threshold', () => {
  assert.equal(describeExpiry(state(1_000 + EXPIRY_WARNING_LEDGERS, 1_000 + EXPIRY_WARNING_LEDGERS)).warn, false);
  assert.equal(describeExpiry(state(1_000 + EXPIRY_WARNING_LEDGERS - 1, 1_000 + EXPIRY_WARNING_LEDGERS + 5)).warn, true);
});

test('uses the code lifetime alone when only it is known', () => {
  const only = { name: 'vault', status: 'archived', codeLiveUntilLedger: 1_000 + days(1), latestLedger: 1_000 };
  assert.equal(describeExpiry(only).text, 'about 24 hours (Wasm code): extend its lifetime soon');
});
