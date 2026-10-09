import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };

/** The items of the list, as { text, title } where title is the full hash on the <code>. */
function items(h) {
  return h.el('supported').children.map((item) => ({
    text: item.textContent,
    title: item.children.find((child) => child.tagName === 'CODE')?.getAttribute('title'),
  }));
}

test('the list shows each build the current app supports, with a short hash and the full one on hover', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  assert.deepEqual(items(h), [{ text: 'v1 a7a82511…4cf42509 running now', title: V1_HASH }]);
});

test('the build the contract is running is marked in words, not only by colour', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  assert.match(items(h)[0].text, /running now$/);
});

test('while the live code is not known yet, nothing is marked as running', async () => {
  const h = harness({ setup: (guard) => guard.set({ status: 'pending' }) });
  await h.run();
  assert.deepEqual(items(h), [{ text: 'v1 a7a82511…4cf42509', title: V1_HASH }]);
});

test('code the app does not support leaves every listed build unmarked: that is the whole reason for the block', async () => {
  const h = harness({ setup: (guard) => guard.set({ status: 'unsupported', liveWasmHash: 'cd'.repeat(32), lastSuccessAt: START }) });
  await h.run();
  assert.ok(!items(h)[0].text.includes('running now'));
});

test('while a new guard starts the list already shows the build that was chosen, with nothing marked', async () => {
  let release;
  const h = harness({ setup: (guard, index) => { guard.set(SUPPORTED); if (index === 1) release = guard.holdStart(); } });
  await h.run();
  await h.choose('older');
  await h.settle();
  assert.deepEqual(items(h), [{ text: 'an earlier build 00000000…00000000', title: '0'.repeat(64) }]);
  release();
  await h.settle();
});

test('the mark follows the live code when it changes', async () => {
  const h = harness({ setup: (guard) => guard.set({ status: 'unsupported', liveWasmHash: 'cd'.repeat(32), lastSuccessAt: START }) });
  await h.run();
  assert.ok(!items(h)[0].text.includes('running now'));
  h.guard.set(SUPPORTED);
  await h.guard.emit('unsupported', 'supported');
  assert.match(items(h)[0].text, /running now$/);
});

test('the list is not rebuilt every second, which would make a screen reader read it out again', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  const before = h.el('supported').children;
  h.advance(1000);
  h.tick();
  h.advance(1000);
  h.tick();
  const after = h.el('supported').children;
  assert.equal(after.length, before.length);
  assert.ok(after.every((item, i) => item === before[i]), 'the items were replaced by identical new ones');
});

test('a label with markup in it is shown as text: it cannot add elements to the page', async () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const h = harness({
    setup: (guard) => guard.set(SUPPORTED),
    configFor: () => ({ contracts: { vault: { contractId: 'C', supported: [{ wasmHash: V1_HASH, label: hostile }] } } }),
  });
  await h.run();
  const item = h.el('supported').children[0];
  assert.ok(item.textContent.includes(hostile), 'the label was changed instead of shown literally');
  assert.deepEqual(item.children.map((child) => child.tagName), ['SPAN', 'CODE', 'SPAN']);
});
