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

test('.nvmrc names the newest Node version CI runs, and it is not older than the package requires', () => {
  const nvmrc = Number(read('.nvmrc').trim());
  const matrix = [...ci.matchAll(/node:\s*\[([^\]]*)\]/g)][0][1].split(',').map((n) => Number(n.trim()));
  assert.equal(nvmrc, Math.max(...matrix));
  assert.ok(nvmrc >= Number(pkg.engines.node.match(/>=\s*(\d+)/)[1]));
});

test('no source file has a tab, a carriage return or trailing spaces, as .editorconfig says', async () => {
  const { readdirSync } = await import('node:fs');
  const files = ['index.html', 'build.mjs', 'serve.mjs', 'static-server.mjs', 'check-bundle.mjs', 'analyze-bundle.mjs', 'update-csp.mjs', ...readdirSync(new URL('../src/', import.meta.url)).map((name) => `src/${name}`)];
  for (const file of files) {
    const text = read(file);
    assert.doesNotMatch(text, /\t/, `${file} has a tab`);
    assert.doesNotMatch(text, /\r/, `${file} has a carriage return`);
    assert.doesNotMatch(text, /[ ]+\n/, `${file} has trailing spaces`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${file} must end with exactly one newline`);
  }
});

test('every module in src/ is described in the README, so a new one is not left out', async () => {
  const { readdirSync } = await import('node:fs');
  for (const name of readdirSync(new URL('../src/', import.meta.url)).filter((file) => file.endsWith('.js'))) {
    assert.ok(readme.includes(`src/${name}`) || readme.includes(`\`${name}\``) || readme.includes(`[\`${name}\`]`), `the README does not mention src/${name}`);
  }
});

test('the README does not still say the page is one JavaScript file or that all the code is in main.js', () => {
  assert.doesNotMatch(readme, /one JavaScript file/);
  assert.doesNotMatch(readme, /All of the Wasmward code is in/);
});

test('the testing guide only names helpers that exist, and files that exist', () => {
  const guide = read('docs/TESTING.md');
  const harness = read('test/support/app-harness.js');
  for (const helper of ['advance', 'tick', 'elapse', 'hide', 'show', 'settle', 'run', 'choose']) {
    assert.ok(guide.includes(`h.${helper}`), `the guide does not mention h.${helper}`);
    assert.match(harness, new RegExp(`\\b${helper}\\b`), `h.${helper} is in the guide but not in the harness`);
  }
  for (const file of ['test/support/fake-dom.js', 'test/support/fake-guard.js', 'test/support/app-harness.js', 'test/app-retry.test.js', 'test/app-switching.test.js', 'test/page.test.js', 'test/import-side-effects.test.js']) {
    assert.doesNotThrow(() => read(file), `${file} does not exist`);
  }
  for (const [, link] of guide.matchAll(/\]\(\.\.\/([^)#]+)\)/g)) assert.doesNotThrow(() => read(link), `the guide links to ${link}, which does not exist`);
});

test('CONTRIBUTING points at the testing guide', () => {
  assert.match(read('CONTRIBUTING.md'), /docs\/TESTING\.md/);
});

test('every behaviour the README promises under "When things go wrong" has a test file', async () => {
  const { readdirSync } = await import('node:fs');
  // (dist-test/ and test/ are siblings, and the tests run from dist-test/.)
  const tests = readdirSync(new URL('../test/', import.meta.url));
  for (const file of ['app-retry.test.js', 'app-retry-now.test.js', 'app-visibility.test.js', 'app-errors.test.js']) {
    assert.ok(tests.includes(file), `no ${file}`);
  }
});
