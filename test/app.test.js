import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError } from '@wasmward/core';
import { CONTRACT_ID, V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START, liveUntilLedger: 5_000_000, latestLedger: 4_000_000 };

/** Starts the app with a guard that reports `state` as soon as it starts, and waits for the first render. */
async function started(state) {
  const h = harness({ setup: (guard) => guard.set(state) });
  await h.run();
  return h;
}

test('starting connects the explorer link and asks for a once-a-second refresh', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.el('explorer').hidden, false);
  assert.equal(h.el('explorer').href, `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`);
  assert.deepEqual(h.timers.map((t) => t.ms), [1000]);
});

test('it watches the contract for the current build first, which supports only v1', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.guards.length, 1);
  const supported = h.guard.config.contracts.vault.supported;
  assert.deepEqual(supported.map((version) => version.wasmHash), [V1_HASH]);
  assert.equal(h.guard.config.contracts.vault.contractId, CONTRACT_ID);
  assert.equal(h.guard.calls.start, 1);
});

test('while the first check runs the badge says checking and the button is off', async () => {
  let release;
  const h = harness({ setup: (guard) => (release = guard.holdStart()) });
  const running = h.run();
  await h.settle();
  assert.equal(h.text('badge'), 'checking');
  assert.equal(h.el('badge').className, 'badge waiting');
  assert.equal(h.el('deposit').disabled, true);
  assert.equal(h.text('hint'), 'Checking which code the contract is running…');
  release();
  await running;
});

test('a supported contract shows its hash and label, turns the button on and says writes are allowed', async () => {
  const h = await started(SUPPORTED);
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.el('badge').className, 'badge supported');
  assert.equal(h.text('hash'), V1_HASH);
  assert.equal(h.text('label'), 'v1');
  assert.equal(h.el('deposit').disabled, false);
  assert.equal(h.text('hint'), 'The live code is one this app supports, so writes are allowed.');
  assert.equal(h.text('error'), 'none');
});

test('what is not known yet is shown as such', async () => {
  const h = await started({ status: 'pending' });
  assert.equal(h.text('hash'), 'unknown');
  assert.equal(h.text('label'), 'none');
  assert.equal(h.text('checked'), 'never');
  assert.equal(h.text('expiry'), 'unknown');
});

test('an unsupported contract turns the button off and shows the reason the guard gives', async () => {
  const h = await started({ status: 'unsupported', liveWasmHash: 'cd'.repeat(32), lastSuccessAt: START });
  assert.equal(h.text('badge'), 'unsupported');
  assert.equal(h.el('badge').className, 'badge blocked');
  assert.equal(h.el('deposit').disabled, true);
  assert.equal(h.text('hint'), "Writes to 'vault' are blocked: the status is unsupported");
  assert.equal(h.text('hash'), 'cd'.repeat(32));
});

test('the badge follows the effective status: a check that is too old reads stale, and the button stays off', async () => {
  const h = await started({ ...SUPPORTED, effective: 'stale' });
  assert.equal(h.text('badge'), 'stale');
  assert.equal(h.el('badge').className, 'badge blocked');
  assert.equal(h.el('deposit').disabled, true);
});

test('the last error is shown when there is one', async () => {
  const h = await started({ status: 'pending', lastError: 'RPC timed out' });
  assert.equal(h.text('error'), 'RPC timed out');
});

test('the time left is shown, and warns when it is short', async () => {
  const plenty = await started({ ...SUPPORTED, liveUntilLedger: 4_000_000 + 500_000 });
  assert.equal(plenty.text('expiry'), 'about 29 days');
  assert.equal(plenty.el('expiry').className, '');
  const short = await started({ ...SUPPORTED, liveUntilLedger: 4_000_000 + 20_000 });
  assert.match(short.text('expiry'), /extend its lifetime soon/);
  assert.equal(short.el('expiry').className, 'warn');
});

test('"last check" counts up as the clock moves, on each tick of the timer', async () => {
  const h = await started(SUPPORTED);
  assert.equal(h.text('checked'), 'just now');
  h.advance(12_000);
  h.tick();
  assert.equal(h.text('checked'), '12 seconds ago');
  h.advance(120_000);
  h.tick();
  assert.equal(h.text('checked'), '2 minutes ago');
});

test('a status change from the guard is logged, newest first, and shown at once', async () => {
  const h = await started({ status: 'pending' });
  h.guard.set(SUPPORTED);
  await h.guard.emit('pending', 'supported');
  assert.equal(h.text('badge'), 'supported');
  assert.equal(h.el('deposit').disabled, false);
  h.guard.set({ status: 'unsupported' });
  await h.guard.emit('supported', 'unsupported');
  assert.deepEqual(h.logLines(), ['vault: supported → unsupported', 'vault: pending → supported']);
});

test('each log line starts with a time', async () => {
  const h = await started({ status: 'pending' });
  await h.guard.emit('pending', 'supported');
  const item = h.el('log').firstElementChild;
  assert.equal(item.children[0].tagName, 'TIME');
  assert.equal(item.children[0].textContent, new Date(START).toLocaleTimeString());
});

test('if the guard cannot start for good, the badge, hint and log say why, and the button stays off', async () => {
  const h = harness({ setup: (guard) => guard.failStart(new ConfigError('the RPC serves another network')) });
  await h.run();
  assert.equal(h.text('badge'), 'cannot check');
  assert.equal(h.el('badge').className, 'badge blocked');
  assert.equal(h.text('hint'), 'the RPC serves another network');
  assert.equal(h.el('deposit').disabled, true);
  assert.deepEqual(h.logLines(), ['Could not start: the RPC serves another network']);
});

test('clicking the deposit button sends the guarded write and logs the result', async () => {
  const h = await started(SUPPORTED);
  await h.el('deposit').click();
  assert.equal(h.guard.calls.guarded, 1);
  assert.deepEqual(h.logLines(), ['Pretended to send a transaction depositing 10.']);
});

test('a write the guard refuses is logged with the reason, not thrown', async () => {
  const h = await started(SUPPORTED);
  h.guard.set({ effective: 'stale' });
  h.el('deposit').disabled = false; // as if the page had not re-rendered yet
  await h.el('deposit').click();
  assert.deepEqual(h.logLines(), ["Writes to 'vault' are blocked: the status is stale"]);
});

test('the page says which network it watches and which RPC host it asks', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.text('network'), 'Stellar testnet (soroban-testnet.stellar.org)');
});

test('the network row is there before the first check finishes, and does not change when the contract does', async () => {
  let release;
  const h = harness({ setup: (guard) => (release = guard.holdStart()) });
  const running = h.run();
  await h.settle();
  assert.equal(h.text('network'), 'Stellar testnet (soroban-testnet.stellar.org)');
  release();
  await running;
  await h.guard.emit('pending', 'unsupported');
  assert.equal(h.text('network'), 'Stellar testnet (soroban-testnet.stellar.org)');
});

test('the tab title follows the badge, so a page in a background tab can be read at a glance', async () => {
  let release;
  const h = harness({ setup: (guard) => { guard.set(SUPPORTED); release = guard.holdStart(); } });
  const running = h.run();
  await h.settle();
  assert.equal(h.doc.title, 'checking · Wasmward browser example');
  release();
  await running;
  assert.equal(h.doc.title, 'supported · Wasmward browser example');
  h.guard.set({ effective: 'stale' });
  h.tick();
  assert.equal(h.doc.title, 'stale · Wasmward browser example');
  await h.hide();
  await h.settle();
  assert.equal(h.doc.title, 'paused · Wasmward browser example');
});

test('a guard that cannot start puts that in the title too', async () => {
  const h = harness({ setup: (guard) => guard.failStart(new ConfigError('another network')) });
  await h.run();
  assert.equal(h.doc.title, 'cannot check · Wasmward browser example');
});

test('each log time carries the exact moment as a datetime, so it means something to software and to a screen reader', async () => {
  const h = await started({ status: 'pending' });
  await h.guard.emit('pending', 'supported');
  h.advance(65_000);
  await h.guard.emit('supported', 'stale');
  const [newest, oldest] = h.el('log').children.map((item) => item.children[0]);
  assert.equal(oldest.getAttribute('datetime'), new Date(START).toISOString());
  assert.equal(newest.getAttribute('datetime'), new Date(START + 65_000).toISOString());
  assert.match(oldest.getAttribute('datetime'), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});
