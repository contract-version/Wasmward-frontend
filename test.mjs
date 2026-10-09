// Runs the tests in test/. They import the same modules the page does, including @wasmward/core, so each is
// bundled for Node first with the same alias the browser build uses, then run with node --test.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { coreEntry } from './core-entry.mjs';

const tests = readdirSync('test').filter((file) => file.endsWith('.test.js'));
if (tests.length === 0) {
  console.error('No tests found in test/.');
  process.exit(1);
}

await build({
  entryPoints: tests.map((file) => `test/${file}`),
  outdir: 'dist-test',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outExtension: { '.js': '.mjs' },
  alias: { '@wasmward/core': coreEntry },
  logLevel: 'warning',
});

const bundled = tests.map((file) => `dist-test/${file.replace(/\.js$/, '.mjs')}`);
// --test-timeout: a test that never finishes (a promise nobody resolves) fails after a minute, instead of making
// the whole run, and CI with it, hang until something kills it.
const run = spawnSync(process.execPath, ['--test', '--test-timeout=60000', ...bundled], { stdio: 'inherit' });
process.exit(run.status ?? 1);
