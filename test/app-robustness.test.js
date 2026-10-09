import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };

// Nothing here should ever reach the process as an unhandled rejection: in a browser that is a console error
// and a page that has quietly stopped working.
function failOnUnhandledRejection(t) {
  const seen = [];
  const listener = (reason) => seen.push(reason);
  process.on('unhandledRejection', listener);
  t.after(() => process.off('unhandledRejection', listener));
  return async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(seen.map(String), [], 'an unhandled rejection');
  };
}

test('a choice that is not a known build is refused and the page carries on as it was', async (t) => {
  const check = failOnUnhandledRejection(t);
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  await h.choose('bogus');
  await h.settle();
  assert.equal(h.guards.length, 1, 'a guard was replaced for a build that does not exist');
  assert.equal(h.guard.running, true);
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.el('deposit').disabled, false);
  assert.deepEqual(h.logLines(), ["Ignored a choice of build the page does not know: 'bogus'"]);
  await check();
});

test('names inherited from Object are not builds either', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  for (const name of ['constructor', '__proto__', 'toString', '']) await h.choose(name);
  assert.equal(h.guards.length, 1);
  assert.equal(h.logLines().length, 4);
  assert.ok(h.logLines().every((line) => line.startsWith('Ignored a choice of build')));
});

test('if the config cannot be made, the page says so instead of going dead without a word', async (t) => {
  const check = failOnUnhandledRejection(t);
  const h = harness({
    setup: (guard) => guard.set(SUPPORTED),
    configFor: () => {
      throw new Error('the supported list is empty');
    },
  });
  await h.run();
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.el('badge').className, 'badge blocked');
  assert.equal(h.text('hint'), 'the supported list is empty');
  assert.equal(h.el('deposit').disabled, true);
  assert.deepEqual(h.logLines(), ['Could not start: the supported list is empty']);
  await check();
});

test('a config that fails on a later choice leaves the page blocked and explained, not dead', async (t) => {
  const check = failOnUnhandledRejection(t);
  let calls = 0;
  const h = harness({
    setup: (guard) => guard.set(SUPPORTED),
    configFor: (profile) => {
      calls += 1;
      if (calls > 1) throw new Error('broken second config');
      return { profile, contracts: { vault: { contractId: 'C', supported: [] } } };
    },
  });
  await h.run();
  await h.choose('older');
  await h.settle();
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.text('hint'), 'broken second config');
  assert.equal(h.el('deposit').disabled, true);
  assert.equal(h.guards[0].running, false, 'the old guard was left polling');
  await check();
});

test('pressing deposit when there is no guard yet says so, instead of a TypeError', async () => {
  let release;
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 0) release = guard.holdStop();
    },
  });
  await h.run();
  await h.choose('older'); // the old guard is stopping: there is nothing to send a write through
  h.el('deposit').disabled = false; // however it got pressed
  await h.el('deposit').click();
  assert.ok(!h.logLines().some((line) => /is not a function|undefined/.test(line)), h.logLines().join(' | '));
  assert.equal(h.logLines()[0], 'Not ready yet: the contract has not been checked.');
  release();
  await h.settle();
});

test('if the old guard will not stop, the switch still goes ahead and the problem is logged', async (t) => {
  const check = failOnUnhandledRejection(t);
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 0) guard.failStop(new Error('would not stop'));
    },
  });
  await h.run();
  await h.choose('older');
  await h.settle();
  await h.settle();
  assert.equal(h.guards.length, 2, 'no new guard was made because the old one failed to stop');
  assert.equal(h.guards[1].running, true);
  assert.ok(h.logLines().some((line) => line === 'Could not stop the previous check: would not stop'), h.logLines().join(' | '));
  assert.equal(h.text('badge'), 'supported', 'the page should show the new guard, not be stuck on checking');
  await check();
});

test('if a guard that was replaced while starting will not stop either, nothing is thrown', async (t) => {
  const check = failOnUnhandledRejection(t);
  let releaseStart;
  const h = harness({
    setup: (guard, index) => {
      guard.set(SUPPORTED);
      if (index === 1) {
        releaseStart = guard.holdStart();
        guard.failStop(new Error('late stop failure'));
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
  assert.equal(h.guard.running, true, 'the newest guard must keep running');
  await check();
});
