import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// app.js looks elements up by id the moment the page starts it. A renamed or removed id in index.html would make it
// throw on load (the whole page dead) and no build step would notice, so check the two agree.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const idsInHtml = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const idsUsedByScript = [...new Set([...script.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]))];

test('the script looks up at least the ids this page is known to use', () => {
  // Guards the test itself: if the pattern stopped matching, the checks below would pass for nothing.
  for (const id of ['badge', 'deposit', 'hint', 'hash', 'expiry', 'explorer', 'log']) {
    assert.ok(idsUsedByScript.includes(id), `app.js no longer looks up #${id}`);
  }
});

test('every element app.js looks up exists in index.html', () => {
  const missing = idsUsedByScript.filter((id) => !idsInHtml.includes(id));
  assert.deepEqual(missing, []);
});

test('no id appears twice in index.html', () => {
  const duplicates = idsInHtml.filter((id, i) => idsInHtml.indexOf(id) !== i);
  assert.deepEqual(duplicates, []);
});

test('the script is loaded from the bundle the build writes', () => {
  assert.match(html, /<script[^>]+src="\.?\/?dist\/app\.js"/);
});

test('the "something went wrong" notice is an alert and starts hidden, so it is announced only when it is needed', () => {
  const tag = html.match(/<div\b[^>]*\bid="problem"[^>]*>/)?.[0];
  assert.ok(tag, 'index.html has no #problem element');
  assert.match(tag, /\brole="alert"/);
  assert.match(tag, /\shidden(\s|>|\/)/);
});

test('the copy button says what it copies, for someone who cannot see where it is, and starts hidden', () => {
  const tag = html.match(/<button\b[^>]*\bid="copy-hash"[^>]*>/)?.[0];
  assert.ok(tag, 'index.html has no #copy-hash button');
  assert.match(tag, /\baria-label="Copy the live Wasm hash"/);
  assert.match(tag, /\btype="button"/);
  assert.match(tag, /\shidden(\s|>|\/)/);
});

test('the note about a copy is a status region, so it is announced when it appears', () => {
  const tag = html.match(/<span\b[^>]*\bid="copy-status"[^>]*>/)?.[0];
  assert.ok(tag, 'index.html has no #copy-status');
  assert.match(tag, /\brole="status"/);
});
