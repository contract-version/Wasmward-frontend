import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeGuard, fakeGuardFactory } from './support/fake-guard.js';

// The page's behaviour tests steer this fake, so it is tested first.

test('starts pending and not writable, and start and stop are counted', async () => {
  const guard = createFakeGuard();
  assert.equal(guard.status().vault.status, 'pending');
  assert.equal(guard.isWritable('vault'), false);
  await guard.start();
  assert.equal(guard.running, true);
  await guard.stop();
  assert.equal(guard.running, false);
  assert.deepEqual(guard.calls, { start: 1, stop: 1, guarded: 0 });
});

test('set changes what it reports, and only supported is writable', () => {
  const guard = createFakeGuard();
  guard.set({ status: 'supported', liveWasmHash: 'ab'.repeat(32), matchedLabel: 'v1' });
  assert.equal(guard.status().vault.liveWasmHash, 'ab'.repeat(32));
  assert.equal(guard.isWritable('vault'), true);
  assert.equal(guard.health().contracts.vault.status, 'supported');
  guard.set({ status: 'unsupported' });
  assert.equal(guard.isWritable('vault'), false);
});

test('the effective status can differ from the stored one, as it does for a check that is too old', () => {
  const guard = createFakeGuard().set({ status: 'supported', effective: 'stale' });
  assert.equal(guard.status().vault.status, 'supported');
  assert.equal(guard.health().contracts.vault.status, 'stale');
  assert.equal(guard.isWritable('vault'), false);
  assert.throws(() => guard.assertWritable('vault'), /Writes to 'vault' are blocked: the status is stale/);
});

test('status() returns a copy, so the page cannot change the guard by changing it', () => {
  const guard = createFakeGuard();
  guard.status().vault.status = 'supported';
  assert.equal(guard.status().vault.status, 'pending');
});

test('a guarded write runs only while writable, and is counted either way', async () => {
  const guard = createFakeGuard();
  const deposit = guard.guard('vault', async (amount) => `deposited ${amount}`);
  await assert.rejects(deposit(5), (error) => error.name === 'WriteBlockedError');
  guard.set({ status: 'supported' });
  assert.equal(await deposit(5), 'deposited 5');
  assert.equal(guard.calls.guarded, 2);
});

test('emit tells every subscriber, in order, and an unsubscribed one hears nothing', async () => {
  const guard = createFakeGuard();
  const heard = [];
  guard.subscribe((change) => heard.push(['a', change.from, change.to]));
  const unsubscribe = guard.subscribe(() => heard.push(['b']));
  assert.equal(guard.listenerCount(), 2);
  await guard.emit('pending', 'supported');
  unsubscribe();
  await guard.emit('supported', 'stale');
  assert.deepEqual(heard, [['a', 'pending', 'supported'], ['b'], ['a', 'supported', 'stale']]);
});

test('holdStart makes start wait, and the release lets it finish', async () => {
  const guard = createFakeGuard();
  const release = guard.holdStart();
  let started = false;
  const pending = guard.start().then(() => (started = true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, false);
  assert.equal(guard.calls.start, 1, 'the call is counted when it is made, not when it ends');
  release();
  await pending;
  assert.equal(started, true);
});

test('holdStop makes stop wait too', async () => {
  const guard = createFakeGuard();
  const release = guard.holdStop();
  let stopped = false;
  const pending = guard.stop().then(() => (stopped = true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopped, false);
  release();
  await pending;
  assert.equal(stopped, true);
});

test('failStart makes start reject, and failStart(undefined) makes it succeed again', async () => {
  const guard = createFakeGuard().failStart(new Error('no network'));
  await assert.rejects(guard.start(), /no network/);
  assert.equal(guard.running, false);
  guard.failStart(undefined);
  await guard.start();
  assert.equal(guard.running, true);
  assert.equal(guard.calls.start, 2);
});

test('the endpoint in use is reported by health()', () => {
  const guard = createFakeGuard();
  assert.equal(guard.health().network.usingFallback, false);
  assert.equal(guard.useFallback().health().network.usingFallback, true);
});

test('the factory records each config and guard, in order, and runs the setup on each', () => {
  const seen = [];
  const factory = fakeGuardFactory((guard, index) => seen.push([index, guard.config]));
  const first = factory.createGuard({ n: 1 });
  const second = factory.createGuard({ n: 2 });
  assert.deepEqual(factory.guards, [first, second]);
  assert.deepEqual(seen, [[0, { n: 1 }], [1, { n: 2 }]]);
  assert.notEqual(first, second);
});

test('failStop makes stop reject without marking the guard stopped, and failStop(undefined) makes it succeed again', async () => {
  const guard = createFakeGuard();
  await guard.start();
  guard.failStop(new Error('would not stop'));
  await assert.rejects(guard.stop(), /would not stop/);
  assert.equal(guard.running, true, 'a stop that failed must not look like a stop that worked');
  guard.failStop(undefined);
  await guard.stop();
  assert.equal(guard.running, false);
  assert.equal(guard.calls.stop, 2);
});
