import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// SECURITY.md makes claims about the page and the dev server. Each one is checked by another test; this ties the
// document to those tests, so that a claim cannot be left in the document after what backs it is removed.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const doc = read('SECURITY.md');

test('the document says what it defends against and what it does not, and how to report', () => {
  for (const heading of ['What the page defends against', 'What it does not defend against', 'What is worth reporting', 'How to report']) {
    assert.match(doc, new RegExp(`^## ${heading}$`, 'm'), `missing "## ${heading}"`);
  }
});

test('the policy it describes is the policy in the page', () => {
  const policy = read('index.html').match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)[1];
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  assert.match(doc, /only its own script, one RPC, the inline stylesheet by hash, and `data:` images/);
  for (const piece of ["script-src 'self'", 'connect-src https://soroban-testnet.stellar.org', 'img-src data:']) assert.ok(policy.includes(piece), piece);
});

test('each defence it claims has a test file that checks it', () => {
  const backing = {
    'a test scans the source for `innerHTML`': 'test/no-html-injection.test.js',
    'Content-Security-Policy': 'test/csp.test.js',
    'refuses path tricks': 'test/static-server.test.js',
    'the saved theme': 'test/theme.test.js',
    'fragment': 'test/route.test.js',
  };
  for (const [claim, file] of Object.entries(backing)) {
    assert.ok(doc.includes(claim) || doc.toLowerCase().includes(claim.toLowerCase()), `the document no longer makes the claim "${claim}"`);
    assert.doesNotThrow(() => read(file), `${file} does not exist`);
  }
});

test('it does not promise a contact address that this repository cannot stand behind', () => {
  assert.doesNotMatch(doc, /[\w.+-]+@[\w-]+\.[\w.]+/, 'an email address in SECURITY.md');
});
