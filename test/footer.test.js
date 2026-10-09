import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const footers = [...html.matchAll(/<footer\b([^>]*)>([\s\S]*?)<\/footer>/gi)];
const links = footers.length === 1 ? [...footers[0][2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(([, attributes, text]) => ({ attributes, text: text.replace(/<[^>]*>/g, '').trim(), href: attributes.match(/\bhref="([^"]*)"/)?.[1] })) : [];

test('the page has one footer, after the main content, which is the contentinfo landmark', () => {
  assert.equal(footers.length, 1);
  assert.ok(html.indexOf('</main>') < html.indexOf('<footer'), 'the footer must come after </main>');
  assert.ok(html.indexOf('<footer') < html.indexOf('<script'), 'and before the script');
});

test('it links to the library, this page, the test contract and the operations guide', () => {
  assert.deepEqual(links.map((link) => link.text), ['Wasmward library', 'source of this page', 'the test contract', 'operations guide']);
  assert.deepEqual(links.map((link) => link.href), [
    'https://github.com/contract-version/Wasmward-backend',
    'https://github.com/contract-version/Wasmward-frontend',
    'https://github.com/contract-version/Wasmward-contract',
    'https://github.com/contract-version/Wasmward-backend/blob/main/docs/OPERATIONS.md',
  ]);
});

test('every link is https, to this project and nowhere else, and opens safely', () => {
  for (const link of links) {
    assert.ok(link.href.startsWith('https://github.com/contract-version/'), link.href);
    assert.match(link.attributes, /\btarget="_blank"/);
    assert.match(link.attributes, /\brel="noopener noreferrer"/);
  }
});

test('the footer says that the page is a demo, and that it does not protect anything by itself', () => {
  const text = footers[0][2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /demo/i);
  assert.match(text, /not access control/i);
});
