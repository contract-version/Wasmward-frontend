import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };
const hashesOf = (guard) => guard.config.contracts.vault.supported.map((version) => version.wasmHash);
const OLDER = ['0'.repeat(64)];

async function startedAt(hash) {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  h.location.hash = hash;
  await h.run();
  return h;
}

test('a link with #build=older opens on the older build, with the selector showing it', async () => {
  const h = await startedAt('#build=older');
  assert.equal(h.guards.length, 1, 'it started the current build and then switched');
  assert.deepEqual(hashesOf(h.guard), OLDER);
  assert.equal(h.el('profile').value, 'older');
  assert.ok(!h.logLines().some((line) => line.startsWith('Switched')), 'opening a link is not a switch');
});

test('no fragment means the current build, and the selector stays on it', async () => {
  const h = await startedAt('');
  assert.deepEqual(hashesOf(h.guard), [V1_HASH]);
  assert.equal(h.el('profile').value, 'current');
});

test('a fragment that names no build is ignored: the current build, and no error', async () => {
  for (const hash of ['#build=bogus', '#build=__proto__', '#build=<script>', '#nonsense']) {
    const h = await startedAt(hash);
    assert.deepEqual(hashesOf(h.guard), [V1_HASH], hash);
    assert.equal(h.el('profile').value, 'current', hash);
    assert.equal(h.logLines().length, 0, hash);
  }
});

test('choosing a build writes it into the address without adding a history entry', async () => {
  const h = await startedAt('');
  await h.choose('older');
  await h.settle();
  assert.deepEqual(h.history.calls, ['/#build=older']);
  assert.equal(h.location.hash, '#build=older');
});

test('choosing the default build again clears the fragment and leaves the rest of the address alone', async () => {
  const h = await startedAt('#build=older');
  h.location.pathname = '/demo/';
  h.location.search = '?lang=en';
  await h.choose('current');
  await h.settle();
  assert.equal(h.history.calls.at(-1), '/demo/?lang=en');
  assert.equal(h.location.hash, '');
});

test('a choice the page ignores does not touch the address', async () => {
  const h = await startedAt('');
  await h.choose('bogus');
  assert.deepEqual(h.history.calls, []);
});

test('opening a link does not rewrite the address that was just opened', async () => {
  const h = await startedAt('#build=older');
  assert.deepEqual(h.history.calls, []);
});

test('changing the fragment by hand switches the build', async () => {
  const h = await startedAt('');
  h.location.hash = '#build=older';
  await h.events.dispatch('hashchange');
  await h.settle();
  assert.equal(h.guards.length, 2);
  assert.deepEqual(hashesOf(h.guard), OLDER);
  assert.equal(h.el('profile').value, 'older');
  assert.deepEqual(h.history.calls, [], 'the address already says what it should');
});

test('a fragment that matches what is already shown changes nothing', async () => {
  const h = await startedAt('#build=older');
  h.location.hash = '#build=older';
  await h.events.dispatch('hashchange');
  await h.settle();
  assert.equal(h.guards.length, 1);
});

test('clearing the fragment goes back to the current build', async () => {
  const h = await startedAt('#build=older');
  h.location.hash = '';
  await h.events.dispatch('hashchange');
  await h.settle();
  assert.deepEqual(hashesOf(h.guard), [V1_HASH]);
  assert.equal(h.el('profile').value, 'current');
});

test('a fragment that names no build is ignored when it is typed in, too', async () => {
  const h = await startedAt('#build=older');
  h.location.hash = '#build=bogus';
  await h.events.dispatch('hashchange');
  await h.settle();
  assert.equal(h.guards.length, 1);
  assert.equal(h.el('profile').value, 'older');
});

test('a page opened on a link in a background tab resumes on the build in the link', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  h.location.hash = '#build=older';
  h.doc.visibilityState = 'hidden';
  await h.run();
  await h.settle();
  assert.equal(h.guards.length, 0);
  await h.show();
  await h.settle();
  assert.deepEqual(hashesOf(h.guard), OLDER);
});
