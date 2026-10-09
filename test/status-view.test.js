import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CANNOT_CHECK, CHECKING, statusView } from '../src/status-view.js';

// Every status Wasmward can report (see `Status` in @wasmward/core).
const STATUSES = ['pending', 'supported', 'unsupported', 'stellar-asset', 'missing', 'archived', 'stale'];

test('supported is the only green status', () => {
  assert.deepEqual(statusView('supported'), { text: 'supported', tone: 'supported' });
  for (const status of STATUSES.filter((s) => s !== 'supported')) {
    assert.notEqual(statusView(status).tone, 'supported', status);
  }
});

test('pending is waiting, and every other status is blocked', () => {
  assert.deepEqual(statusView('pending'), { text: 'pending', tone: 'waiting' });
  for (const status of ['unsupported', 'stellar-asset', 'missing', 'archived', 'stale']) {
    assert.deepEqual(statusView(status), { text: status, tone: 'blocked' }, status);
  }
});

test('a status this page has never heard of is blocked, not fine', () => {
  for (const unknown of ['something-new', '', 'SUPPORTED', 'Supported', ' supported', undefined, null, 42]) {
    assert.equal(statusView(unknown).tone, 'blocked', String(unknown));
  }
});

test('the text is always a string, so it can be set with textContent', () => {
  for (const value of [...STATUSES, undefined, null, 42]) assert.equal(typeof statusView(value).text, 'string');
});

test('the two states outside the guard have fixed looks', () => {
  assert.deepEqual(CHECKING, { text: 'checking', tone: 'waiting' });
  assert.deepEqual(CANNOT_CHECK, { text: 'cannot check', tone: 'blocked' });
});

test('every tone is one the page stylesheet defines', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const tone of new Set([...STATUSES.map((s) => statusView(s).tone), CHECKING.tone, CANNOT_CHECK.tone])) {
    assert.match(html, new RegExp(`\\.badge\\.${tone}\\s*\\{`), `no .badge.${tone} rule`);
  }
});
