import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// package.json, the README and the CI workflow each say something about the same facts. These checks keep them
// from drifting apart without anyone noticing.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');
const ci = read('.github/workflows/ci.yml');

test('the package is private: this is an example, not something to publish', () => {
  assert.equal(pkg.private, true);
});

test('every pnpm script is documented in the README', () => {
  for (const name of Object.keys(pkg.scripts)) {
    assert.match(readme, new RegExp(`pnpm ${name}\\b`), `the README does not mention \`pnpm ${name}\``);
  }
});

test('the README does not document a pnpm script that does not exist', () => {
  const mentioned = [...readme.matchAll(/`pnpm ([a-z:]+)`/g)].map((match) => match[1]);
  const builtIn = new Set(['install']);
  for (const name of mentioned) assert.ok(name in pkg.scripts || builtIn.has(name), `the README mentions \`pnpm ${name}\`, which is not a script`);
});

test('the license field is the license in the LICENSE file', () => {
  assert.equal(pkg.license, 'Apache-2.0');
  assert.match(read('LICENSE'), /Apache License\s+Version 2\.0/);
});

test('the Node version in package.json is the oldest one CI runs', () => {
  const minimum = Number(pkg.engines.node.match(/>=\s*(\d+)/)[1]);
  const matrix = [...ci.matchAll(/node:\s*\[([^\]]*)\]/g)][0][1].split(',').map((n) => Number(n.trim()));
  assert.equal(Math.min(...matrix), minimum, 'CI does not test the oldest Node version the package claims');
});

test('the repository, bugs and homepage point at this project', () => {
  assert.equal(pkg.repository?.type, 'git');
  assert.equal(pkg.repository?.url, 'git+https://github.com/contract-version/Wasmward-frontend.git');
  assert.equal(pkg.bugs?.url, 'https://github.com/contract-version/Wasmward-frontend/issues');
  assert.equal(pkg.homepage, 'https://github.com/contract-version/Wasmward-frontend#readme');
});

test('the package manager is pinned, and the README tells people to use it', () => {
  assert.match(pkg.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  assert.match(readme, /\[pnpm\]/);
});

test('there is a description, and it says what the page does', () => {
  assert.match(pkg.description, /write button/i);
});
