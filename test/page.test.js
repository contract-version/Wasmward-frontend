import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// main.js looks elements up by id the moment it loads. A renamed or removed id in index.html would make it
// throw on load (the whole page dead) and no build step would notice, so check the two agree.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const idsInHtml = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const idsUsedByScript = [...new Set([...script.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]))];

test('the script looks up at least the ids this page is known to use', () => {
  // Guards the test itself: if the pattern stopped matching, the checks below would pass for nothing.
  for (const id of ['badge', 'deposit', 'hint', 'hash', 'expiry', 'explorer', 'log']) {
    assert.ok(idsUsedByScript.includes(id), `main.js no longer looks up #${id}`);
  }
});

test('every element main.js looks up exists in index.html', () => {
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
