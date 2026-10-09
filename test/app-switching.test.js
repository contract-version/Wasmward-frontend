import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };
const hashesOf = (guard) => guard.config.contracts.vault.supported.map((version) => version.wasmHash);

test('choosing the older build logs it, stops the old guard and starts a new one with the older list', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  await h.choose('older');
  await h.settle();
  assert.equal(h.guards.length, 2);
  assert.equal(h.guards[0].calls.stop, 1);
  assert.equal(h.guards[0].running, false);
  assert.equal(h.guards[1].calls.start, 1);
  assert.deepEqual(hashesOf(h.guards[0]), [V1_HASH]);
  assert.deepEqual(hashesOf(h.guards[1]), ['0'.repeat(64)]);
  assert.equal(h.logLines().at(0), 'Switched to an older build of the app.');
});

test('while the new guard is starting the page goes back to checking, with the button off', async () => {
  let release;
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 1) release = guard.holdStart();
    },
  });
  await h.run();
  assert.equal(h.el('deposit').disabled, false);
  await h.choose('older');
  await h.settle();
  assert.equal(h.text('badge'), 'checking');
  assert.equal(h.el('deposit').disabled, true);
  release();
  await h.settle();
});

test('a guard that has been replaced can no longer change the page', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  const first = h.guard;
  await h.choose('older');
  await h.settle();
  const before = h.logLines().length;
  first.set({ status: 'stale' });
  await first.emit('supported', 'stale');
  assert.equal(h.logLines().length, before, 'a replaced guard wrote to the log');
  assert.notEqual(h.text('badge'), 'stale');
});

test('changing the choice again and again leaves exactly one guard running, the newest', async () => {
  let releaseStop;
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 0) releaseStop = guard.holdStop();
    },
  });
  await h.run();
  // The first guard is slow to stop. While it stops, the person changes their mind twice more.
  await h.choose('older');
  await h.choose('current');
  await h.choose('older');
  releaseStop();
  await h.settle();
  await h.settle();
  const running = h.guards.filter((guard) => guard.running);
  assert.equal(running.length, 1, `${running.length} guards are running`);
  assert.equal(running[0], h.guard, 'the one running is not the newest');
  assert.deepEqual(hashesOf(h.guard), ['0'.repeat(64)], 'the newest choice was the older build');
});

test('a choice that is replaced while its guard is still starting is stopped, not left polling', async () => {
  let releaseStart;
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 1) releaseStart = guard.holdStart();
    },
  });
  await h.run();
  await h.choose('older'); // guard 1 begins to start and waits
  await h.settle();
  await h.choose('current'); // replaced before it finished starting
  await h.settle();
  releaseStart(); // now the slow start finishes
  await h.settle();
  await h.settle();
  assert.equal(h.guards[1].running, false, 'the replaced guard was left running');
  assert.ok(h.guards[1].calls.stop >= 1);
  assert.equal(h.guard.running, true);
  assert.equal(h.guards.filter((guard) => guard.running).length, 1);
});

test('a slow start that finishes for a guard that was replaced does not touch the page', async () => {
  let releaseStart;
  const h = harness({
    setup: (guard, index) => {
      guard.set(index === 1 ? { status: 'unsupported', liveWasmHash: 'ee'.repeat(32) } : SUPPORTED);
      if (index === 1) releaseStart = guard.holdStart();
    },
  });
  await h.run();
  await h.choose('older');
  await h.settle();
  await h.choose('current');
  await h.settle();
  releaseStart();
  await h.settle();
  await h.settle();
  assert.equal(h.text('badge'), 'supported', 'the replaced guard changed the badge');
  assert.notEqual(h.text('hash'), 'ee'.repeat(32));
});

test('a failed start of a replaced guard is not reported', async () => {
  let releaseStart;
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 1) {
        guard.failStart(new Error('late failure'));
        releaseStart = guard.holdStart();
      }
    },
  });
  await h.run();
  await h.choose('older');
  await h.settle();
  await h.choose('current');
  await h.settle();
  releaseStart();
  await h.settle();
  await h.settle();
  assert.ok(!h.logLines().some((line) => line.includes('late failure')));
  assert.notEqual(h.text('badge'), 'cannot check');
});

test('render does nothing while there is no guard (between one choice and the next)', async () => {
  let release;
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 0) release = guard.holdStop();
    },
  });
  await h.run();
  await h.choose('older'); // the first guard is stopping; there is no current guard yet
  const badge = h.text('badge');
  assert.doesNotThrow(() => h.tick());
  assert.equal(h.text('badge'), badge);
  release();
  await h.settle();
});
