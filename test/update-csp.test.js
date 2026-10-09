import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { styleHash, withCurrentHash } from '../update-csp.mjs';

const SCRIPT = fileURLToPath(new URL('../update-csp.mjs', import.meta.url));

const page = (css, policy = "default-src 'none'; style-src 'sha256-OLD'; connect-src https://rpc.example") =>
  `<head><meta http-equiv="Content-Security-Policy" content="${policy}" /><style>${css}</style></head>`;
const hashOf = (css) => `'sha256-${createHash('sha256').update(css).digest('base64')}'`;

test('the hash is the SHA-256 of the stylesheet text, exactly as written, in base64', () => {
  const css = '\n  body { color: red; }\n';
  assert.equal(styleHash(page(css)), hashOf(css));
  // Whitespace counts: a policy hash is of the exact bytes between the tags.
  assert.notEqual(styleHash(page('body{}')), styleHash(page('body{} ')));
});

test('a stale hash is replaced and nothing else in the page or the policy changes', () => {
  const css = 'body { margin: 0; }';
  const updated = withCurrentHash(page(css));
  assert.equal(updated, page(css, `default-src 'none'; style-src ${hashOf(css)}; connect-src https://rpc.example`));
});

test('a current hash leaves the page byte for byte as it was', () => {
  const css = 'a { color: blue; }';
  const current = page(css, `default-src 'none'; style-src ${hashOf(css)}`);
  assert.equal(withCurrentHash(current), current);
});

test('style-src as the first or the last directive is found, and a look-alike directive is left alone', () => {
  const css = 'p{}';
  assert.equal(withCurrentHash(page(css, "style-src 'sha256-OLD'")), page(css, `style-src ${hashOf(css)}`));
  assert.equal(withCurrentHash(page(css, "default-src 'none'; style-src 'sha256-OLD'")), page(css, `default-src 'none'; style-src ${hashOf(css)}`));
  const lookalike = page(css, "style-src-elem 'none'; style-src 'sha256-OLD'");
  assert.equal(withCurrentHash(lookalike), page(css, `style-src-elem 'none'; style-src ${hashOf(css)}`));
});

test('refuses a page it cannot update safely, saying why', () => {
  assert.throws(() => withCurrentHash('<head><style>a{}</style></head>'), /expected one Content-Security-Policy meta tag, found 0/);
  assert.throws(() => withCurrentHash(page('a{}') + page('b{}')), /found 2/);
  assert.throws(() => withCurrentHash('<meta http-equiv="Content-Security-Policy" content="style-src \'sha256-OLD\'" />'), /expected one inline <style>, found 0/);
  assert.throws(() => withCurrentHash(page('a{}').replace('<style>a{}</style>', '<style>a{}</style><style>b{}</style>')), /expected one inline <style>, found 2/);
  assert.throws(() => withCurrentHash(page('a{}', "default-src 'none'")), /no style-src directive/);
});

/** Runs the script in a temp directory holding this index.html; resolves { status, stdout, stderr, html }. */
function run(args, html) {
  const dir = mkdtempSync(join(tmpdir(), 'update-csp-'));
  writeFileSync(join(dir, 'index.html'), html);
  return new Promise((resolve) =>
    execFile(process.execPath, [SCRIPT, ...args], { cwd: dir }, (error, stdout, stderr) => {
      const after = readFileSync(join(dir, 'index.html'), 'utf8');
      rmSync(dir, { recursive: true, force: true });
      resolve({ status: error ? error.code : 0, stdout, stderr, html: after });
    }),
  );
}

test('run with no arguments it fixes a stale page and says so', async () => {
  const result = await run([], page('b{}'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Updated the stylesheet hash in index.html.\n');
  assert.equal(result.html, page('b{}', `default-src 'none'; style-src ${hashOf('b{}')}; connect-src https://rpc.example`));
});

test('--check exits 1 and changes nothing for a stale page, 0 for a current one', async () => {
  const stale = page('b{}');
  const checked = await run(['--check'], stale);
  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /hash in index\.html is stale\. Run: node update-csp\.mjs/);
  assert.equal(checked.html, stale, '--check rewrote the file');
  const current = page('c{}', `style-src ${hashOf('c{}')}`);
  assert.equal((await run(['--check'], current)).status, 0);
});

test('exits 2 for an unknown argument or a page it cannot read', async () => {
  const unknown = await run(['--force'], page('b{}'));
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown argument --force/);
  const broken = await run([], '<html></html>');
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /^error: expected one Content-Security-Policy meta tag/);
});

test('the real index.html is current', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(withCurrentHash(html), html);
});
