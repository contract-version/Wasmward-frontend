import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { breakdown, packageOf, parseArgs, render } from '../analyze-bundle.mjs';

const SCRIPT = fileURLToPath(new URL('../analyze-bundle.mjs', import.meta.url));

test('a file in node_modules belongs to its package, whichever package manager laid it out', () => {
  assert.equal(packageOf('node_modules/zod/v4/core/schemas.js'), 'zod');
  assert.equal(packageOf('node_modules/@stellar/stellar-sdk/lib/esm/xdr/index.js'), '@stellar/stellar-sdk');
  // pnpm nests the real package inside a .pnpm folder; the package is the last node_modules segment
  assert.equal(packageOf('../Wasmward-backend/node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/util.js'), 'zod');
  assert.equal(packageOf('../Wasmward-backend/node_modules/.pnpm/@stellar+js-xdr@5.0.0/node_modules/@stellar/js-xdr/dist/js-xdr.mjs'), '@stellar/js-xdr');
});

test('the page\'s own code and the library it uses are told apart from the dependencies', () => {
  assert.equal(packageOf('src/app.js'), 'this page (src/)');
  assert.equal(packageOf('src/main.js'), 'this page (src/)');
  assert.equal(packageOf('../Wasmward-backend/src/guard.ts'), 'the Wasmward library (src/)');
  assert.equal(packageOf('../elsewhere/Wasmward-backend/src/config.ts'), 'the Wasmward library (src/)');
});

test('anything else is named by its first folder, and a bare name by itself', () => {
  assert.equal(packageOf('lib/helper.js'), 'lib');
  assert.equal(packageOf('single.js'), 'single.js');
  assert.equal(packageOf('C:\\Users\\Dell\\project\\node_modules\\left-pad\\index.js'), 'left-pad', 'Windows separators work too');
});

const META = {
  inputs: {},
  outputs: {
    'dist/app.js.map': { bytes: 5000, inputs: {} },
    'dist/app.js': {
      bytes: 1000,
      inputs: {
        'node_modules/big/a.js': { bytesInOutput: 400 },
        'node_modules/big/b.js': { bytesInOutput: 200 },
        'node_modules/@scope/mid/index.js': { bytesInOutput: 250 },
        'src/app.js': { bytesInOutput: 100 },
        'node_modules/tiny/index.js': { bytesInOutput: 50 },
      },
    },
  },
};

test('the breakdown adds up files by package, biggest first, with their share of the bundle', () => {
  const { total, files, rows } = breakdown(META);
  assert.equal(total, 1000);
  assert.equal(files, 5);
  assert.deepEqual(rows.map((row) => [row.name, row.bytes, row.files]), [
    ['big', 600, 2],
    ['@scope/mid', 250, 1],
    ['this page (src/)', 100, 1],
    ['tiny', 50, 1],
  ]);
  assert.deepEqual(rows.map((row) => row.share), [0.6, 0.25, 0.1, 0.05]);
});

test('the source map is never counted as part of the bundle', () => {
  assert.equal(breakdown(META).total, 1000);
});

test('packages of the same size are listed in a stable, alphabetical order', () => {
  const meta = { outputs: { 'out.js': { bytes: 20, inputs: { 'node_modules/b/i.js': { bytesInOutput: 10 }, 'node_modules/a/i.js': { bytesInOutput: 10 } } } } };
  assert.deepEqual(breakdown(meta).rows.map((row) => row.name), ['a', 'b']);
});

test('a metafile with no JavaScript output is refused, saying so', () => {
  assert.throws(() => breakdown({ outputs: { 'x.css': { bytes: 1, inputs: {} } } }), /no JavaScript output/);
  assert.throws(() => breakdown({}), /no JavaScript output/);
  assert.throws(() => breakdown(null), /not an esbuild metafile/);
});

test('the report shows the total, the biggest packages, and what the rest add up to', () => {
  const lines = render(breakdown(META), 2);
  assert.equal(lines[0], 'The bundle is 1,000 bytes from 5 files.');
  assert.match(lines[2], /^ {2}big {2,}600 {2}60\.0% {2}\(2 files\)$/);
  assert.match(lines[3], /^ {2}@scope\/mid {2,}250 {2}25\.0% {2}\(1 file\)$/);
  assert.equal(lines.at(-1), '  and 2 more, 150 bytes (15.0%)');
});

test('with fewer packages than the limit there is no "and more" line', () => {
  const lines = render(breakdown(META), 10);
  assert.ok(!lines.some((line) => line.includes('and ')));
  assert.equal(lines.filter((line) => line.startsWith('  ')).length, 4);
});

test('parseArgs has defaults, reads its options and refuses bad ones', () => {
  assert.deepEqual(parseArgs([]), { file: 'dist/meta.json', top: 10 });
  assert.deepEqual(parseArgs(['--file', 'm.json', '--top', '3']), { file: 'm.json', top: 3 });
  for (const argv of [['--top'], ['--top', '0'], ['--top', '1.5'], ['--top', 'x'], ['--top', '1001']]) assert.throws(() => parseArgs(argv), /--top needs a whole number from 1 to 1000/, argv.join(' '));
  assert.throws(() => parseArgs(['--file']), /--file needs a path/);
  assert.throws(() => parseArgs(['--bogus']), /unknown option --bogus/);
});

function run(content, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'analyze-'));
  if (content !== undefined) writeFileSync(join(dir, 'meta.json'), content);
  return new Promise((resolve) =>
    execFile(process.execPath, [SCRIPT, '--file', join(dir, 'meta.json'), ...args], (error, stdout, stderr) => {
      rmSync(dir, { recursive: true, force: true });
      resolve({ status: error ? error.code : 0, stdout, stderr });
    }),
  );
}

test('run as a command it prints the report and exits 0', async () => {
  const result = await run(JSON.stringify(META), ['--top', '3']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^The bundle is 1,000 bytes from 5 files\.\n/);
  assert.match(result.stdout, /big/);
});

test('run as a command it exits 2 with a message for a missing file, bad JSON, and a bad option', async () => {
  const missing = await run(undefined);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^error: /);
  const broken = await run('not json');
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /^error: .*JSON/);
  const bad = await run('{}', ['--top', '0']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /^error: --top needs a whole number/);
});

test('with several JavaScript outputs it reports the biggest, which is the app and not a small helper script', () => {
  const meta = {
    outputs: {
      'dist/theme-init.js': { bytes: 100, inputs: { 'src/theme-init.js': { bytesInOutput: 60 }, 'src/theme.js': { bytesInOutput: 40 } } },
      'dist/app.js': { bytes: 5000, inputs: { 'node_modules/big/a.js': { bytesInOutput: 4000 } } },
      'dist/app.js.map': { bytes: 9000, inputs: {} },
    },
  };
  const { total, rows } = breakdown(meta);
  assert.equal(total, 4000);
  assert.deepEqual(rows.map((row) => row.name), ['big']);
});

test('the order the outputs are listed in does not decide which is reported', () => {
  const small = { bytes: 10, inputs: { 'src/a.js': { bytesInOutput: 10 } } };
  const large = { bytes: 90, inputs: { 'src/b.js': { bytesInOutput: 90 } } };
  assert.equal(breakdown({ outputs: { 'one.js': small, 'two.js': large } }).total, 90);
  assert.equal(breakdown({ outputs: { 'two.js': large, 'one.js': small } }).total, 90);
});
