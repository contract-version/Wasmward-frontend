import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RPC_URL } from '../src/demo-config.js';

// The page carries its own Content-Security-Policy in a <meta> tag, so it holds wherever the page is hosted
// (a header would need the host's cooperation). It lets the page load its own script, talk to the one RPC it
// uses, and nothing else: so even if markup did get injected, it could not run code or send data elsewhere.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** The policy as { directive: [sources] }, from the meta tag. Throws if there is none. */
function policy() {
  const tag = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/i);
  assert.ok(tag, 'index.html has no Content-Security-Policy meta tag');
  const directives = {};
  for (const part of tag[1].split(';').map((p) => p.trim()).filter(Boolean)) {
    const [name, ...sources] = part.split(/\s+/);
    assert.ok(!(name in directives), `${name} is given twice`);
    directives[name] = sources;
  }
  return directives;
}

test('the page has a policy, and it is the first thing in <head> after the charset', () => {
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  const metas = [...head.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]);
  const csp = metas.findIndex((tag) => /Content-Security-Policy/i.test(tag));
  assert.ok(csp >= 0 && csp <= 1, 'the policy must come before any content it is meant to restrict');
  assert.ok(policy());
});

test('everything is denied unless a directive allows it', () => {
  assert.deepEqual(policy()['default-src'], ["'none'"]);
});

test('scripts may only come from the page\'s own origin, never inline or eval', () => {
  assert.deepEqual(policy()['script-src'], ["'self'"]);
  for (const sources of Object.values(policy())) {
    assert.ok(!sources.includes("'unsafe-eval'") && !sources.includes("'unsafe-inline'"), `a directive allows ${sources.join(' ')}`);
  }
});

test('the page may talk to its RPC and nowhere else', () => {
  assert.deepEqual(policy()['connect-src'], [new URL(RPC_URL).origin]);
});

test('the inline stylesheet is allowed by its hash, and the hash is current', () => {
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)];
  assert.equal(styles.length, 1, 'the policy lists one hash, so the page must have one inline stylesheet');
  const hash = `'sha256-${createHash('sha256').update(styles[0][1]).digest('base64')}'`;
  assert.deepEqual(policy()['style-src'], [hash], 'the stylesheet changed: update the hash in the policy');
});

test('images may only be data: URLs (the inline icon), and nothing can set a base URL or submit a form', () => {
  assert.deepEqual(policy()['img-src'], ['data:']);
  assert.deepEqual(policy()['base-uri'], ["'none'"]);
  assert.deepEqual(policy()['form-action'], ["'none'"]);
});

test('every directive is one a <meta> policy honours (frame-ancestors, report-uri and sandbox are ignored there)', () => {
  const ignoredInMeta = ['frame-ancestors', 'report-uri', 'sandbox'];
  for (const name of Object.keys(policy())) assert.ok(!ignoredInMeta.includes(name), `${name} has no effect in a meta tag`);
});
