import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError } from '@wasmward/core';
import { describeDelay, FIRST_RETRY_MS, isPermanent, MAX_RETRY_MS, retryDelayMs } from '../src/retry.js';

test('the first retry comes after 2 seconds and each one after waits twice as long', () => {
  assert.equal(FIRST_RETRY_MS, 2000);
  assert.deepEqual([1, 2, 3, 4].map(retryDelayMs), [2000, 4000, 8000, 16_000]);
});

test('the wait never goes past 30 seconds, however many tries have failed', () => {
  assert.equal(MAX_RETRY_MS, 30_000);
  assert.equal(retryDelayMs(5), 30_000);
  assert.equal(retryDelayMs(6), 30_000);
  assert.equal(retryDelayMs(1_000), 30_000);
  assert.equal(retryDelayMs(Number.MAX_SAFE_INTEGER), 30_000);
});

test('the wait never decreases from one try to the next', () => {
  let previous = 0;
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const delay = retryDelayMs(attempt);
    assert.ok(delay >= previous && delay <= MAX_RETRY_MS, `try ${attempt}`);
    previous = delay;
  }
});

test('a try number that is not a whole number from 1 is a mistake, not a zero wait', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, '2', undefined, null]) {
    assert.throws(() => retryDelayMs(bad), /whole number/, String(bad));
  }
});

test('only a config problem is permanent: another network, or a bad config, will not fix itself', () => {
  assert.equal(isPermanent(new ConfigError('the RPC serves another network')), true);
  assert.equal(isPermanent({ name: 'ConfigError' }), true);
});

test('everything else is worth trying again, including odd things that were thrown', () => {
  for (const transient of [new Error('Could not verify the network: timed out'), new TypeError('fetch failed'), 'a string', undefined, null, 42, {}]) {
    assert.equal(isPermanent(transient), false, String(transient));
  }
});

test('delays are described in whole seconds, and "1 second" is singular', () => {
  assert.equal(describeDelay(1000), '1 second');
  assert.equal(describeDelay(2000), '2 seconds');
  assert.equal(describeDelay(30_000), '30 seconds');
  assert.equal(describeDelay(1500), '2 seconds', 'rounded up: it is never described as shorter than it is');
  assert.equal(describeDelay(100), '1 second', 'never "0 seconds"');
});
