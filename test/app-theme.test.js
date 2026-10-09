import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORAGE_KEY } from '../src/theme.js';
import { harness } from './support/app-harness.js';

const root = (h) => h.doc.documentElement;

async function started(saved) {
  const h = harness();
  if (saved !== undefined) h.storage.data.set(STORAGE_KEY, saved);
  await h.run();
  return h;
}

test('with nothing saved the page follows the system: no data-theme, and the selector says so', async () => {
  const h = await started();
  assert.equal(root(h).getAttribute('data-theme'), null);
  assert.equal(h.el('theme').value, 'auto');
});

test('a saved choice is applied when the page starts, and shown in the selector', async () => {
  for (const theme of ['light', 'dark']) {
    const h = await started(theme);
    assert.equal(root(h).getAttribute('data-theme'), theme);
    assert.equal(h.el('theme').value, theme);
  }
});

test('choosing a theme applies it at once and saves it', async () => {
  const h = await started();
  h.el('theme').value = 'dark';
  await h.el('theme').dispatch('change');
  assert.equal(root(h).getAttribute('data-theme'), 'dark');
  assert.equal(h.storage.data.get(STORAGE_KEY), 'dark');
});

test('choosing "follow the system" removes the forced theme and saves that', async () => {
  const h = await started('dark');
  h.el('theme').value = 'auto';
  await h.el('theme').dispatch('change');
  assert.equal(root(h).getAttribute('data-theme'), null);
  assert.equal(h.storage.data.get(STORAGE_KEY), 'auto');
});

test('a saved value that is not a theme is ignored, and not written into the page', async () => {
  const h = await started('"><script>alert(1)</script>');
  assert.equal(root(h).getAttribute('data-theme'), null);
  assert.equal(h.el('theme').value, 'auto');
});

test('a selector value that is not a theme is ignored and put back, and nothing is saved', async () => {
  const h = await started('light');
  h.storage.data.clear();
  h.el('theme').value = 'blue';
  await h.el('theme').dispatch('change');
  assert.equal(root(h).getAttribute('data-theme'), 'light');
  assert.equal(h.el('theme').value, 'light');
  assert.equal(h.storage.data.size, 0);
});

test('a browser that will not let the page store anything still gets the theme chosen, just not remembered', async () => {
  const h = harness();
  h.storage.throws = true;
  await h.run();
  assert.equal(h.el('theme').value, 'auto');
  h.el('theme').value = 'dark';
  await assert.doesNotReject(h.el('theme').dispatch('change'));
  assert.equal(root(h).getAttribute('data-theme'), 'dark');
});

test('changing the theme does not disturb the contract being watched, or the log', async () => {
  const h = await started();
  const guards = h.guards.length;
  h.el('theme').value = 'dark';
  await h.el('theme').dispatch('change');
  assert.equal(h.guards.length, guards);
  assert.equal(h.logLines().length, 0);
});

test('running with no storage at all works', async () => {
  const h = harness({ storage: undefined });
  await assert.doesNotReject(h.run());
  assert.equal(h.el('theme').value, 'auto');
});
