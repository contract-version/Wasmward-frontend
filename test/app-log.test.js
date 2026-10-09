import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOG_LIMIT } from '../src/app.js';
import { V1_HASH } from '../src/demo-config.js';
import { harness, START } from './support/app-harness.js';

const SUPPORTED = { status: 'supported', liveWasmHash: V1_HASH, matchedLabel: 'v1', lastSuccessAt: START };

/** An app that is running with a supported contract, so each click of the deposit button adds one log line. */
async function running() {
  const h = harness({ setup: (guard) => guard.set(SUPPORTED) });
  await h.run();
  return h;
}

test('the log keeps at most LOG_LIMIT entries, so a page left open for days does not grow without end', async () => {
  const h = await running();
  assert.ok(Number.isInteger(LOG_LIMIT) && LOG_LIMIT >= 20 && LOG_LIMIT <= 500, `an odd limit: ${LOG_LIMIT}`);
  for (let i = 0; i < LOG_LIMIT + 50; i += 1) await h.el('deposit').click();
  assert.equal(h.el('log').children.length, LOG_LIMIT);
});

test('when the log is full the oldest entries go, and the newest are kept', async () => {
  const h = await running();
  for (let i = 0; i < LOG_LIMIT; i += 1) await h.el('deposit').click();
  h.guard.set({ effective: 'stale' });
  h.el('deposit').disabled = false;
  await h.el('deposit').click(); // a different message, so it can be told apart from the rest
  const lines = h.logLines();
  assert.equal(lines.length, LOG_LIMIT);
  assert.equal(lines[0], "Writes to 'vault' are blocked: the status is stale");
  assert.equal(lines.filter((line) => line.startsWith('Pretended')).length, LOG_LIMIT - 1);
});

test('below the limit nothing is dropped', async () => {
  const h = await running();
  for (let i = 0; i < 5; i += 1) await h.el('deposit').click();
  assert.equal(h.el('log').children.length, 5);
});
