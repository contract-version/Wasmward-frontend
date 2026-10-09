import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };
const hashesOf = (guard) => guard.config.contracts.vault.supported.map((version) => version.wasmHash);
const running = (h) => h.guards.filter((guard) => guard.running);

async function started(options = {}) {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED), ...options });
  await h.run();
  return h;
}

test('a tab that goes to the background stops polling: its guard is stopped and the page says paused', async () => {
  const h = await started();
  await h.hide();
  await h.settle();
  assert.equal(h.guard.running, false);
  assert.equal(h.guard.calls.stop, 1);
  assert.equal(h.text('badge'), 'paused');
  assert.equal(h.el('badge').className, 'badge waiting');
  assert.equal(h.el('deposit').disabled, true);
  assert.equal(h.logLines()[0], 'Checking paused: this tab is hidden.');
});

test('when it comes back a fresh guard checks at once, and the page shows the contract again', async () => {
  const h = await started();
  await h.hide();
  await h.settle();
  await h.show();
  await h.settle();
  assert.equal(h.guards.length, 2);
  assert.equal(h.guard.running, true);
  assert.equal(h.guard.calls.start, 1);
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.el('deposit').disabled, false);
  assert.equal(h.logLines()[0], 'Checking again: this tab is visible.');
});

test('it comes back to the build that was chosen, not the first one', async () => {
  const h = await started();
  await h.choose('older');
  await h.settle();
  await h.hide();
  await h.settle();
  await h.show();
  await h.settle();
  assert.deepEqual(hashesOf(h.guard), ['0'.repeat(64)]);
});

test('hiding twice stops once, and showing twice starts once', async () => {
  const h = await started();
  await h.hide();
  await h.hide();
  await h.settle();
  assert.equal(h.guards[0].calls.stop, 1);
  await h.show();
  await h.show();
  await h.settle();
  assert.equal(h.guards.length, 2, 'a second show made another guard');
  assert.equal(running(h).length, 1);
});

test('showing a tab that was never hidden does nothing', async () => {
  const h = await started();
  await h.show();
  await h.settle();
  assert.equal(h.guards.length, 1);
  assert.equal(h.guard.calls.stop, 0);
  assert.ok(!h.logLines().some((line) => line.startsWith('Checking again')));
});

test('the once-a-second refresh does nothing while the tab is hidden', async () => {
  const h = await started();
  await h.hide();
  await h.settle();
  const before = [h.text('badge'), h.text('checked'), h.text('hint')];
  h.advance(60_000);
  h.tick();
  assert.deepEqual([h.text('badge'), h.text('checked'), h.text('hint')], before);
});

test('a page that is opened in a background tab does not start checking until it is shown', async () => {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  h.doc.visibilityState = 'hidden';
  await h.run();
  await h.settle();
  assert.equal(h.guards.length, 0, 'a hidden tab started polling');
  assert.equal(h.text('badge'), 'paused');
  await h.show();
  await h.settle();
  assert.equal(h.guards.length, 1);
  assert.equal(h.guard.running, true);
  assert.equal(h.text('badge'), 'supported');
});

test('going to the background while a guard is still starting leaves nothing running', async () => {
  let release;
  const h = harness({ setup: (guard) => { guard.set(SUPPORTED); release = guard.holdStart(); } });
  const first = h.run();
  await h.settle();
  await h.hide();
  await h.settle();
  release();
  await first;
  await h.settle();
  await h.settle();
  assert.equal(running(h).length, 0, 'a guard was left polling in a hidden tab');
  assert.equal(h.text('badge'), 'paused');
});

test('going to the background while it waits to retry ends the retrying', async () => {
  const h = harness({ setup: (guard, index) => { guard.set(SUPPORTED); if (index === 0) guard.failStart(new Error('Could not verify the network: fetch failed')); } });
  h.run();
  await h.settle();
  await h.settle();
  assert.equal(h.waits.length, 1);
  await h.hide();
  await h.settle();
  const startsBefore = h.guards[0].calls.start;
  await h.elapse();
  assert.equal(h.guards[0].calls.start, startsBefore, 'it retried in a hidden tab');
  assert.equal(h.text('badge'), 'paused');
});

test('hiding and showing in quick succession, while the old guard is slow to stop, leaves one guard running', async () => {
  let releaseStop;
  const h = harness({ setup: (guard, index) => { guard.set(SUPPORTED); if (index === 0) releaseStop = guard.holdStop(); } });
  await h.run();
  await h.hide();
  await h.show();
  releaseStop();
  await h.settle();
  await h.settle();
  assert.equal(running(h).length, 1);
  assert.equal(running(h)[0], h.guard);
});

test('pressing deposit while paused says the contract has not been checked', async () => {
  const h = await started();
  await h.hide();
  await h.settle();
  h.el('deposit').disabled = false;
  await h.el('deposit').click();
  assert.equal(h.logLines()[0], 'Not ready yet: the contract has not been checked.');
});

test('a failure shown before the tab was hidden does not come back on the page after it returns', async () => {
  const h = harness({ setup: (guard, index) => { guard.set(SUPPORTED); if (index === 0) guard.failStart(new Error('Could not verify the network: fetch failed')); } });
  h.run();
  await h.settle();
  await h.settle();
  await h.hide();
  await h.settle();
  await h.show();
  await h.settle();
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.text('hint'), 'The live code is one this app supports, so writes are allowed.');
});

test('hiding the tab while a switch of build waits for the old guard to stop cancels the switch', async () => {
  let releaseStop;
  const h = harness({ setup: (guard, index) => { guard.set(SUPPORTED); if (index === 0) releaseStop = guard.holdStop(); } });
  await h.run();
  await h.choose('older'); // the old guard is slow to stop; the switch is waiting for it
  await h.hide();
  releaseStop();
  await h.settle();
  await h.settle();
  assert.equal(h.guards.length, 1, 'the switch went ahead and made a guard in a hidden tab');
  assert.equal(running(h).length, 0);
  assert.equal(h.text('badge'), 'paused');
  // and showing the tab again resumes with the build that was being switched to
  await h.show();
  await h.settle();
  assert.deepEqual(hashesOf(h.guard), ['0'.repeat(64)]);
});
