import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

// The page refreshes itself every second. Setting the text of an element to what it already says still replaces its
// text node, and for an element that is a live region (the hint, the log) some screen readers read it out again.
// So the page should write only what changed.

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START, liveUntilLedger: 5_000_000, latestLedger: 4_000_000 };
const WATCHED = ['badge', 'hint', 'hash', 'label', 'checked', 'expiry', 'error', 'network'];

function writes(h) {
  return Object.fromEntries(WATCHED.map((id) => [id, h.el(id).textWrites]));
}

async function steady() {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  return h;
}

test('a refresh that finds nothing new writes nothing, anywhere the page shows text', async () => {
  const h = await steady();
  const before = writes(h);
  for (let i = 0; i < 5; i += 1) h.tick(); // the clock has not moved: nothing can have changed
  assert.deepEqual(writes(h), before);
});

test('the hint, a live region, is not rewritten while its words are the same', async () => {
  const h = await steady();
  const before = h.el('hint').textWrites;
  for (let i = 0; i < 10; i += 1) {
    h.advance(1000);
    h.tick();
  }
  assert.equal(h.el('hint').textWrites, before, 'the hint was rewritten with the same words');
});

test('the badge, hash, label, time left and error are not rewritten as time passes without a change', async () => {
  const h = await steady();
  const before = writes(h);
  for (let i = 0; i < 10; i += 1) {
    h.advance(1000);
    h.tick();
  }
  const after = writes(h);
  for (const id of ['badge', 'hint', 'hash', 'label', 'error', 'network']) assert.equal(after[id], before[id], id);
});

test('"last check" is written when its words change, and only then', async () => {
  const h = await steady();
  const start = h.el('checked').textWrites;
  h.advance(500);
  h.tick(); // still "just now"
  assert.equal(h.el('checked').textWrites, start);
  h.advance(10_000);
  h.tick(); // "10 seconds ago"
  assert.equal(h.el('checked').textWrites, start + 1);
  h.tick(); // same second again
  assert.equal(h.el('checked').textWrites, start + 1);
});

test('when something does change it is still shown at once', async () => {
  const h = await steady();
  h.guard.set({ status: 'unsupported', liveWasmHash: 'cd'.repeat(32) });
  await h.guard.emit('supported', 'unsupported');
  assert.equal(h.text('badge'), 'unsupported');
  assert.equal(h.text('hash'), 'cd'.repeat(32));
  assert.match(h.text('hint'), /blocked/);
});

test('a status that changes back to what it was before is shown again', async () => {
  const h = await steady();
  h.guard.set({ status: 'unsupported' });
  await h.guard.emit('supported', 'unsupported');
  h.guard.set({ status: 'supported' });
  await h.guard.emit('unsupported', 'supported');
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.text('hint'), 'The live code is one this app supports, so writes are allowed.');
});
