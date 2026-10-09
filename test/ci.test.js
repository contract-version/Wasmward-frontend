import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// CI runs the repository's own scripts by name. If one is renamed or removed, CI fails on a push, far from the change.
// This checks the names, here, where the change is made.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml');
const pkg = JSON.parse(read('package.json'));
const root = (path) => existsSync(new URL(`../${path}`, import.meta.url));

/** Every command line in a `run:` block of the workflow. */
function commands() {
  const lines = [];
  // A step is either `run: ...` or, when it has no name, `- run: ...`.
  const runs = [...ci.matchAll(/^\s*(?:-\s+)?run:\s*(.*)$/gm)];
  for (const match of runs) {
    const start = match.index + match[0].length;
    if (match[1].trim() === '|' || match[1].trim() === '>') {
      for (const line of ci.slice(start).split('\n').slice(1)) {
        if (line.trim() !== '' && !/^\s{10,}/.test(line)) break;
        lines.push(line.trim());
      }
    } else {
      lines.push(match[1].trim());
    }
  }
  return lines.filter(Boolean);
}

test('the workflow runs some commands, and the reader finds them', () => {
  const found = commands();
  assert.ok(found.length >= 6, found.join(' | '));
  assert.ok(found.includes('pnpm test'));
});

test('every node script CI runs exists in the repository', () => {
  const scripts = new Set(commands().flatMap((line) => [...line.matchAll(/\bnode ([\w./-]+\.mjs)\b/g)].map((match) => match[1])));
  assert.ok(scripts.size >= 3, [...scripts].join(', '));
  for (const script of scripts) assert.ok(root(script), `CI runs node ${script}, which does not exist`);
});

test('every pnpm script CI runs is defined in package.json', () => {
  const names = commands().flatMap((line) => [...line.matchAll(/\bpnpm ([a-z:]+)\b/g)].map((match) => match[1]));
  const builtIn = new Set(['install']);
  for (const name of names) assert.ok(name in pkg.scripts || builtIn.has(name), `CI runs pnpm ${name}, which is not a script`);
});

test('CI checks the things the repository says it checks', () => {
  const found = commands().join('\n');
  for (const needed of ['pnpm test', 'pnpm build', 'node check-bundle.mjs', 'node update-csp.mjs --check']) {
    assert.ok(found.includes(needed), `CI does not run ${needed}`);
  }
});

test('CI runs the tests before the build, so a test that needs dist/ fails here as it would there', () => {
  const found = commands();
  assert.ok(found.indexOf('pnpm test') < found.indexOf('pnpm build'));
});
