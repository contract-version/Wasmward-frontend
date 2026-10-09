import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError } from '@wasmward/core';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };
const OFFLINE = new Error('Could not verify the network: fetch failed');

/** An app whose first guard cannot start, run until it first waits to retry. */
async function offline(error = OFFLINE) {
  const h = harness({ setup: (guard, index) => { guard.set(SUPPORTED); if (index === 0) guard.failStart(error); } });
  h.running = h.run();
  await h.settle();
  await h.settle();
  return h;
}

test('the button is hidden unless the page is waiting to retry', async () => {
  const fine = harness({ setup: (guard) => guard.set(SUPPORTED) });
  assert.equal(fine.el('retry-now').hidden, true, 'hidden in the markup');
  await fine.run();
  assert.equal(fine.el('retry-now').hidden, true);
  const waiting = await offline();
  assert.equal(waiting.el('retry-now').hidden, false);
});

test('pressing it tries again at once, without waiting out the delay', async () => {
  const h = await offline();
  const startsBefore = h.guard.calls.start;
  h.guard.failStart(undefined); // the network is back
  await h.el('retry-now').click();
  await h.settle();
  await h.settle();
  assert.equal(h.guard.calls.start, startsBefore + 1);
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.el('retry-now').hidden, true);
  assert.equal(h.logLines()[0], 'Connected after 1 retry.');
});

test('if that try fails too, the page waits again and the button comes back', async () => {
  const h = await offline();
  await h.el('retry-now').click();
  await h.settle();
  await h.settle();
  assert.equal(h.guard.calls.start, 2);
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.el('retry-now').hidden, false);
  assert.match(h.text('hint'), /\(trying again in 4 seconds\)$/, 'the wait goes on growing: a person pressing the button is not a reason to forget how long the network has been down');
});

test('the button is hidden while the try it asked for is running', async () => {
  const h = await offline();
  const release = h.guard.holdStart();
  await h.el('retry-now').click();
  await h.settle();
  assert.equal(h.el('retry-now').hidden, true);
  release();
  await h.settle();
  await h.settle();
});

test('pressing it twice does not start two tries at once', async () => {
  const h = await offline();
  const release = h.guard.holdStart();
  await h.el('retry-now').click();
  await h.settle();
  h.el('retry-now').disabled = false;
  await h.el('retry-now').click(); // however the second press got through
  await h.settle();
  assert.equal(h.guard.calls.start, 2, 'a second press started another try');
  release();
  await h.settle();
});

test('when the browser says it is back online, the page tries again at once', async () => {
  const h = await offline();
  const startsBefore = h.guard.calls.start;
  h.guard.failStart(undefined);
  await h.events.dispatch('online');
  await h.settle();
  await h.settle();
  assert.equal(h.guard.calls.start, startsBefore + 1);
  assert.equal(h.text('badge'), 'supported');
});

test('"online" when nothing is waiting does nothing', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  await h.events.dispatch('online');
  await h.settle();
  assert.equal(h.guards.length, 1);
  assert.equal(h.guard.calls.start, 1);
});

test('a problem that retrying cannot fix does not offer a button for it', async () => {
  const h = await offline(new ConfigError('the RPC serves another network'));
  assert.equal(h.el('retry-now').hidden, true);
});

test('choosing another build while it waits takes the button away, and the old wait cannot start anything', async () => {
  const h = await offline();
  await h.choose('older');
  await h.settle();
  assert.equal(h.el('retry-now').hidden, true);
  const first = h.guards[0];
  const startsBefore = first.calls.start;
  await h.events.dispatch('online');
  await h.settle();
  assert.equal(first.calls.start, startsBefore, 'the replaced guard was started again');
});

test('going to the background while it waits takes the button away', async () => {
  const h = await offline();
  await h.hide();
  await h.settle();
  assert.equal(h.el('retry-now').hidden, true);
});

test('the refresh does not hide the button while the page is waiting', async () => {
  const h = await offline();
  h.advance(1000);
  h.tick();
  assert.equal(h.el('retry-now').hidden, false);
});
