import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_GZIP_BYTES, nodeOnlyReferences, parseArgs, problemsWith } from '../check-bundle.mjs';

const SCRIPT = fileURLToPath(new URL('../check-bundle.mjs', import.meta.url));

test('finds a Node-only module however it is imported, with or without the node: prefix', () => {
  const cases = {
    'import fs from "fs";': ['fs'],
    "import{readFileSync}from'node:fs';": ['fs'],
    'import * as p from "node:path"': ['path'],
    'const os = require("os");': ['os'],
    "const cp = require( 'node:child_process' );": ['child_process'],
    'const m = await import("node:net");': ['net'],
    'import "http";': ['http'],
    'import a from "fs"; import b from "path"; import c from "fs";': ['fs', 'path'],
    'const z = require("zlib"), t = require("tls");': ['tls', 'zlib'],
  };
  for (const [source, expected] of Object.entries(cases)) assert.deepEqual(nodeOnlyReferences(source), expected, source);
});

test('leaves alone modules that only look like Node ones, and plain text', () => {
  const harmless = [
    'import x from "./fs.js";',
    'import x from "fsevents";',
    'import x from "path-browserify";',
    'import x from "os-browserify/browser";',
    'import { Buffer } from "buffer";',
    'import crypto from "crypto";', // bundled in a browser version by the SDK's dependencies
    'const note = "reads the fs and the path";',
    'const profs = require("profs");',
    'var from = 1; var fs = 2;',
  ];
  for (const source of harmless) assert.deepEqual(nodeOnlyReferences(source), [], source);
});

test('a small, clean bundle has no problems', () => {
  assert.deepEqual(problemsWith('console.log("hi");'), []);
});

test('an empty bundle is a problem: a failed build must not pass', () => {
  assert.deepEqual(problemsWith(''), ['the bundle is empty']);
});

test('each Node-only module is reported once, by name', () => {
  assert.deepEqual(problemsWith('import a from "fs"; import b from "node:fs"; require("path")'), [
    "the bundle imports the Node-only module 'fs'",
    "the bundle imports the Node-only module 'path'",
  ]);
});

test('the size budget is exact: at the limit passes, one byte over fails', () => {
  const atLimit = 'a'.repeat(2000);
  assert.deepEqual(problemsWith(atLimit, { maxBytes: 2000 }), []);
  assert.deepEqual(problemsWith(`${atLimit}a`, { maxBytes: 2000 }), ['the bundle is 2001 bytes, over the budget of 2000']);
});

test('the gzip budget catches what the raw size does not', () => {
  // Random-looking text barely compresses, so it is the gzipped size that is over.
  let seed = 12345;
  const noise = Array.from({ length: 4000 }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 94) + 33)
    .map((code) => String.fromCharCode(code))
    .join('');
  const problems = problemsWith(noise, { maxBytes: 1_000_000, maxGzipBytes: 1000 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /bytes gzipped, over the budget of 1000$/);
});

test('the default budgets leave room above the real bundle but not double', () => {
  // The bundle was 1223921 bytes (260711 gzipped) when these were set.
  assert.ok(DEFAULT_MAX_BYTES > 1_223_921 && DEFAULT_MAX_BYTES < 2 * 1_223_921);
  assert.ok(DEFAULT_MAX_GZIP_BYTES > 260_711 && DEFAULT_MAX_GZIP_BYTES < 2 * 260_711);
});

test('parseArgs has defaults, reads each option, and refuses bad ones', () => {
  assert.deepEqual(parseArgs([]), { file: 'dist/app.js', maxBytes: DEFAULT_MAX_BYTES, maxGzipBytes: DEFAULT_MAX_GZIP_BYTES });
  assert.deepEqual(parseArgs(['--file', 'x.js', '--max-bytes', '10', '--max-gzip-bytes', '5']), { file: 'x.js', maxBytes: 10, maxGzipBytes: 5 });
  for (const argv of [['--max-bytes'], ['--max-bytes', '0'], ['--max-bytes', '1.5'], ['--max-bytes', 'big'], ['--max-gzip-bytes', '-1']]) {
    assert.throws(() => parseArgs(argv), /needs a whole number of bytes/, argv.join(' '));
  }
  assert.throws(() => parseArgs(['--file']), /--file needs a path/);
  assert.throws(() => parseArgs(['--file', '--max-bytes']), /--file needs a path/);
  assert.throws(() => parseArgs(['--bogus']), /unknown option --bogus/);
});

/** Runs the script on a file with this content (or a missing file when `content` is undefined). */
function run(content, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'check-bundle-'));
  if (content !== undefined) writeFileSync(join(dir, 'app.js'), content);
  return new Promise((resolve) =>
    execFile(process.execPath, [SCRIPT, '--file', join(dir, 'app.js'), ...args], (error, stdout, stderr) => {
      rmSync(dir, { recursive: true, force: true });
      resolve({ status: error ? error.code : 0, stdout, stderr });
    }),
  );
}

test('exits 0 and prints the size for a good bundle', async () => {
  const result = await run('console.log(1);');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /app\.js: 15 bytes, \d+ gzipped \(budget 1500000 \/ 350000\)\.\n$/);
  assert.equal(result.stderr, '');
});

test('exits 1 and prints every problem for a bad one', async () => {
  const result = await run('import a from "fs"; require("os");', ['--max-bytes', '10']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^problem: the bundle imports the Node-only module 'fs'$/m);
  assert.match(result.stderr, /^problem: the bundle imports the Node-only module 'os'$/m);
  assert.match(result.stderr, /^problem: the bundle is \d+ bytes, over the budget of 10$/m);
});

test('exits 2 for a missing file and for a bad option, with a message', async () => {
  const missing = await run(undefined);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^error: ENOENT/);
  const bad = await run('x', ['--max-bytes', 'lots']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /^error: --max-bytes needs a whole number of bytes/);
});
