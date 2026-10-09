import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError } from '@wasmward/core';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };
const OFFLINE = new Error('Could not verify the network: fetch failed');

/**
 * An app whose first guard cannot start (the network is down), run until it first gives up and waits. run() is not
 * awaited: it only finishes when the start finally works or is abandoned, which these tests decide.
 */
async function offline(error = OFFLINE) {
  const h = harness({ setup: (guard, index) => { guard.set(SUPPORTED); if (index === 0) guard.failStart(error); } });
  h.running = h.run();
  await h.settle();
  await h.settle();
  return h;
}

test('a start that fails for a reason that may pass says it will try again, and in how long', async () => {
  const h = await offline();
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.el('badge').className, 'badge blocked');
  assert.equal(h.text('hint'), 'Could not verify the network: fetch failed (trying again in 2 seconds)');
  assert.equal(h.el('deposit').disabled, true);
  assert.deepEqual(h.waits.map((wait) => wait.ms), [2000]);
});

test('it is logged once, when it first fails, and not again on every try', async () => {
  const h = await offline();
  await h.elapse();
  await h.elapse();
  assert.deepEqual(h.logLines(), ['Could not start: Could not verify the network: fetch failed (will keep trying)']);
});

test('when the wait is over it asks the same guard to start again, and a success shows the contract', async () => {
  const h = await offline();
  h.guard.failStart(undefined); // the network is back
  await h.elapse();
  assert.equal(h.guards.length, 1, 'a retry must not make a new guard');
  assert.equal(h.guard.calls.start, 2);
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.el('deposit').disabled, false);
  assert.equal(h.text('hint'), 'The live code is one this app supports, so writes are allowed.');
  assert.equal(h.logLines()[0], 'Connected after 1 retry.');
});

test('each failed try waits twice as long as the one before, up to 30 seconds', async () => {
  const h = await offline();
  for (let i = 0; i < 7; i += 1) await h.elapse();
  assert.equal(h.guard.calls.start, 8);
  // the wait that is pending now is the eighth; the ones that were taken off the list were 2, 4, 8, 16, 30, 30, 30
  assert.deepEqual(h.waits.map((wait) => wait.ms), [30_000]);
  assert.match(h.text('hint'), /\(trying again in 30 seconds\)$/);
});

test('the delays it used were 2, 4, 8, 16, then 30 seconds each time', async () => {
  const used = [];
  const h = await offline();
  used.push(h.waits[0].ms);
  for (let i = 0; i < 6; i += 1) {
    await h.elapse();
    used.push(h.waits[0].ms);
  }
  assert.deepEqual(used, [2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000]);
});

test('the hint always names the wait that is now running', async () => {
  const h = await offline();
  await h.elapse();
  assert.equal(h.text('hint'), 'Could not verify the network: fetch failed (trying again in 4 seconds)');
});

test('a success after several tries counts them', async () => {
  const h = await offline();
  await h.elapse();
  await h.elapse();
  h.guard.failStart(undefined);
  await h.elapse();
  assert.equal(h.logLines()[0], 'Connected after 3 retries.');
});

test('a problem trying again cannot fix, such as another network, is shown once and not retried', async () => {
  const h = await offline(new ConfigError('the RPC serves another network'));
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.text('hint'), 'the RPC serves another network');
  assert.equal(h.waits.length, 0, 'it scheduled a retry of something that cannot work');
  assert.equal(h.guard.calls.start, 1);
  assert.deepEqual(h.logLines(), ['Could not start: the RPC serves another network']);
});

test('changing the build while it waits stops the retrying: the old wait ends and nothing more is started', async () => {
  const h = await offline();
  await h.choose('older');
  await h.settle();
  assert.equal(h.guards.length, 2);
  const first = h.guards[0];
  const startsBefore = first.calls.start;
  await h.elapse(); // the wait that belonged to the first guard ends
  assert.equal(first.calls.start, startsBefore, 'the replaced guard was started again');
  assert.equal(h.guards[1].calls.start, 1);
  assert.equal(h.guards[1].running, true);
});

test('retrying does not touch the page for a guard that has been replaced', async () => {
  const h = await offline();
  await h.choose('older');
  await h.settle();
  const hint = h.text('hint');
  const log = h.logLines().length;
  await h.elapse();
  assert.equal(h.text('hint'), hint);
  assert.equal(h.logLines().length, log);
});

test('a start that works the first time schedules no wait at all', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  assert.equal(h.waits.length, 0);
  assert.ok(!h.logLines().some((line) => line.startsWith('Connected after')));
});

// Found in a real browser: the once-a-second refresh replaced "cannot check" with "pending" and a generic message,
// because the guard exists even though it has not started. The failure has to survive the timer.
test('the failure stays on the page when the once-a-second refresh runs while it retries', async () => {
  const h = await offline();
  h.advance(1000);
  h.tick();
  h.tick();
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.el('badge').className, 'badge blocked');
  assert.equal(h.text('hint'), 'Could not verify the network: fetch failed (trying again in 2 seconds)');
  assert.equal(h.el('deposit').disabled, true);
});

test('a failure that will not be retried also survives the refresh', async () => {
  const h = await offline(new ConfigError('the RPC serves another network'));
  h.advance(1000);
  h.tick();
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.text('hint'), 'the RPC serves another network');
});

test('once a retry works the refresh shows the contract again', async () => {
  const h = await offline();
  h.guard.failStart(undefined);
  await h.elapse();
  h.advance(1000);
  h.tick();
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.text('hint'), 'The live code is one this app supports, so writes are allowed.');
});

test('the failure from a guard that was replaced does not linger: the new guard shows its own state', async () => {
  const h = await offline();
  await h.choose('older');
  await h.settle();
  h.advance(1000);
  h.tick();
  assert.notEqual(h.text('hint'), 'Could not verify the network: fetch failed (trying again in 2 seconds)');
  assert.equal(h.text('badge'), 'supported');
});
