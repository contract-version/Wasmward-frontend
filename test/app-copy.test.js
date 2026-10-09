import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };
const OTHER = 'cd'.repeat(32);

async function started(options = {}) {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED), ...options });
  await h.run();
  return h;
}

test('the copy button is hidden until the live code is known', async () => {
  const h = harness({ setup: (guard) => guard.set({ status: 'pending' }) });
  assert.equal(h.el('copy-hash').hidden, true, 'hidden in the markup');
  await h.run();
  assert.equal(h.el('copy-hash').hidden, true);
  h.guard.set(SUPPORTED);
  await h.guard.emit('pending', 'supported');
  assert.equal(h.el('copy-hash').hidden, false);
});

test('clicking it copies the whole hash, not the shortened one, and says so', async () => {
  const h = await started();
  await h.el('copy-hash').click();
  assert.deepEqual(h.clipboard.written, [V1_HASH]);
  assert.equal(h.text('copy-status'), 'Copied.');
});

test('the note goes away after a few seconds', async () => {
  const h = await started();
  await h.el('copy-hash').click();
  assert.equal(h.text('copy-status'), 'Copied.');
  assert.deepEqual(h.waits.map((wait) => wait.ms), [3000]);
  await h.elapse();
  assert.equal(h.text('copy-status'), '');
});

test('a note from an earlier copy does not wipe the note of a later one', async () => {
  const h = await started();
  await h.el('copy-hash').click();
  h.clipboard.failWith = new Error('denied');
  await h.el('copy-hash').click();
  assert.equal(h.text('copy-status'), 'Could not copy: denied');
  await h.elapse(); // the first copy's timer ends
  assert.equal(h.text('copy-status'), 'Could not copy: denied', 'the first timer cleared the second message');
  await h.elapse();
  assert.equal(h.text('copy-status'), '');
});

test('a refused copy says why, and the button stays', async () => {
  const h = await started();
  h.clipboard.failWith = new Error('Write permission denied.');
  await h.el('copy-hash').click();
  assert.equal(h.text('copy-status'), 'Could not copy: Write permission denied.');
  assert.equal(h.el('copy-hash').hidden, false);
});

test('a browser with no clipboard is told so', async () => {
  const h = await started({ clipboard: undefined });
  await h.el('copy-hash').click();
  assert.equal(h.text('copy-status'), 'Copying is not available in this browser.');
});

test('when the live code changes the note goes, and the button copies the new hash', async () => {
  const h = await started();
  await h.el('copy-hash').click();
  h.guard.set({ status: 'unsupported', liveWasmHash: OTHER });
  await h.guard.emit('supported', 'unsupported');
  assert.equal(h.text('copy-status'), '', 'a note about the old hash is still shown');
  await h.el('copy-hash').click();
  assert.deepEqual(h.clipboard.written, [V1_HASH, OTHER]);
});

test('the refresh does not clear the note while it is still showing', async () => {
  const h = await started();
  await h.el('copy-hash').click();
  h.advance(1000);
  h.tick();
  assert.equal(h.text('copy-status'), 'Copied.');
});
