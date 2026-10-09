// Checks the browser bundle after a build: it must not reach for Node-only modules, and it must stay within a
// size budget.
//
//   node check-bundle.mjs [--file dist/app.js] [--max-bytes 1500000] [--max-gzip-bytes 350000]
//
// Almost all of the bundle is the Stellar SDK (about 1.2 MB, 260 KB gzipped when this was written). The budget
// leaves room to grow but not to double: a dependency that suddenly pulls in a lot should fail CI, not ship.
//
// Exit codes: 0 fine, 1 a problem (each is printed), 2 the file could not be read or an option is wrong.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const DEFAULT_MAX_BYTES = 1_500_000;
export const DEFAULT_MAX_GZIP_BYTES = 350_000;

// Modules that exist in Node and not in a browser. (crypto, buffer and stream are left out on purpose: the
// SDK's dependencies bundle browser versions of them.)
const NODE_ONLY = ['fs', 'path', 'os', 'child_process', 'net', 'tls', 'dns', 'http', 'https', 'http2', 'zlib', 'worker_threads', 'cluster', 'readline', 'vm'];

/** The Node-only modules a piece of bundled code imports or requires, each once, in alphabetical order. */
export function nodeOnlyReferences(source) {
  const names = NODE_ONLY.join('|');
  const patterns = [
    new RegExp(`\\bfrom\\s*["'](?:node:)?(${names})["']`, 'g'),
    new RegExp(`\\brequire\\s*\\(\\s*["'](?:node:)?(${names})["']\\s*\\)`, 'g'),
    new RegExp(`\\bimport\\s*\\(\\s*["'](?:node:)?(${names})["']\\s*\\)`, 'g'),
    new RegExp(`\\bimport\\s*["'](?:node:)?(${names})["']`, 'g'),
  ];
  const found = new Set();
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) found.add(match[1]);
  return [...found].sort();
}

/** What is wrong with a bundle, as sentences. An empty array means it passes. */
export function problemsWith(source, { maxBytes = DEFAULT_MAX_BYTES, maxGzipBytes = DEFAULT_MAX_GZIP_BYTES } = {}) {
  const problems = [];
  const bytes = Buffer.byteLength(source);
  if (bytes === 0) problems.push('the bundle is empty');
  for (const name of nodeOnlyReferences(source)) problems.push(`the bundle imports the Node-only module '${name}'`);
  if (bytes > maxBytes) problems.push(`the bundle is ${bytes} bytes, over the budget of ${maxBytes}`);
  const gzipped = gzipSync(source).length;
  if (gzipped > maxGzipBytes) problems.push(`the bundle is ${gzipped} bytes gzipped, over the budget of ${maxGzipBytes}`);
  return problems;
}

/** Reads the options. Throws an Error that says what is wrong. */
export function parseArgs(argv) {
  const options = { file: 'dist/app.js', maxBytes: DEFAULT_MAX_BYTES, maxGzipBytes: DEFAULT_MAX_GZIP_BYTES };
  const whole = (flag, text) => {
    if (!/^\d+$/.test(text ?? '') || Number(text) < 1) throw new Error(`${flag} needs a whole number of bytes, 1 or more`);
    return Number(text);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--file') {
      options.file = argv[++i];
      if (options.file === undefined || options.file === '' || options.file.startsWith('--')) throw new Error('--file needs a path');
    } else if (flag === '--max-bytes') options.maxBytes = whole(flag, argv[++i]);
    else if (flag === '--max-gzip-bytes') options.maxGzipBytes = whole(flag, argv[++i]);
    else throw new Error(`unknown option ${flag}`);
  }
  return options;
}

function main(argv) {
  let options;
  let source;
  try {
    options = parseArgs(argv);
    source = readFileSync(options.file, 'utf8');
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }
  const problems = problemsWith(source, options);
  console.log(`${options.file}: ${Buffer.byteLength(source)} bytes, ${gzipSync(source).length} gzipped (budget ${options.maxBytes} / ${options.maxGzipBytes}).`);
  for (const problem of problems) console.error(`problem: ${problem}`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
