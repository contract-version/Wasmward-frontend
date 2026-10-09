// Shows what the browser bundle is made of, by package, from the metafile the build writes.
//
//   node analyze-bundle.mjs [--file dist/meta.json] [--top 10]
//
// check-bundle.mjs fails when the bundle is over its size budget; this says where the bytes are, which is what you
// need to know before deciding what to do about it. Almost all of it is the Stellar SDK and its dependencies.
//
// Exit codes: 0 shown, 2 the file could not be read or an option is wrong. No dependencies; needs Node 20 or newer.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PAGE = 'this page (src/)';
const LIBRARY = 'the Wasmward library (src/)';

/** The part of the bundle a file belongs to: its package, this page, or the Wasmward library. */
export function packageOf(path) {
  const parts = path.replaceAll('\\', '/').split('/');
  const last = parts.lastIndexOf('node_modules');
  if (last >= 0 && parts.length > last + 1) {
    const first = parts[last + 1];
    return first.startsWith('@') && parts.length > last + 2 ? `${first}/${parts[last + 2]}` : first;
  }
  if (parts[0] === 'src') return PAGE;
  if (parts.includes('Wasmward-backend') && parts.includes('src')) return LIBRARY;
  return parts[0];
}

/** { total, files, rows: [{ name, bytes, share, files }] } for the JavaScript output of a metafile, biggest first. */
export function breakdown(metafile) {
  if (typeof metafile !== 'object' || metafile === null) throw new Error('this is not an esbuild metafile');
  // The output that is JavaScript, not its source map (which is listed as an output with no inputs).
  const entry = Object.entries(metafile.outputs ?? {}).find(([name]) => name.endsWith('.js'));
  if (entry === undefined) throw new Error('the metafile has no JavaScript output');
  const inputs = Object.entries(entry[1].inputs ?? {});

  const byName = new Map();
  let total = 0;
  for (const [path, { bytesInOutput }] of inputs) {
    const name = packageOf(path);
    const row = byName.get(name) ?? { name, bytes: 0, files: 0 };
    row.bytes += bytesInOutput;
    row.files += 1;
    byName.set(name, row);
    total += bytesInOutput;
  }
  const rows = [...byName.values()]
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .map((row) => ({ ...row, share: total === 0 ? 0 : row.bytes / total }));
  return { total, files: inputs.length, rows };
}

const percent = (share) => `${(share * 100).toFixed(1)}%`;
const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The report as lines: the total, the `top` biggest packages, and what the rest add up to. */
export function render({ total, files, rows }, top) {
  const shown = rows.slice(0, top);
  const width = Math.max(...shown.map((row) => row.name.length), 0);
  const lines = [`The bundle is ${total.toLocaleString('en-US')} bytes from ${files} files.`, ''];
  for (const row of shown) {
    lines.push(`  ${row.name.padEnd(width)}  ${String(row.bytes).padStart(8)}  ${percent(row.share)}  (${count(row.files, 'file')})`);
  }
  const rest = rows.slice(top);
  if (rest.length > 0) {
    const bytes = rest.reduce((sum, row) => sum + row.bytes, 0);
    lines.push(`  and ${rest.length} more, ${bytes} bytes (${percent(total === 0 ? 0 : bytes / total)})`);
  }
  return lines;
}

/** Reads the options. Throws an Error that says what is wrong. */
export function parseArgs(argv) {
  const options = { file: 'dist/meta.json', top: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--file') {
      options.file = argv[++i];
      if (options.file === undefined || options.file === '' || options.file.startsWith('--')) throw new Error('--file needs a path');
    } else if (flag === '--top') {
      const text = argv[++i] ?? '';
      const top = /^\d+$/.test(text) ? Number(text) : 0;
      if (top < 1 || top > 1000) throw new Error('--top needs a whole number from 1 to 1000');
      options.top = top;
    } else throw new Error(`unknown option ${flag}`);
  }
  return options;
}

function main(argv) {
  let options;
  let report;
  try {
    options = parseArgs(argv);
    report = render(breakdown(JSON.parse(readFileSync(options.file, 'utf8'))), options.top);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }
  console.log(report.join('\n'));
  return 0;
}

// Run only when this file is the script being executed, by name (see check-bundle.mjs for why the name matters).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href && basename(fileURLToPath(import.meta.url)) === 'analyze-bundle.mjs') {
  process.exitCode = main(process.argv.slice(2));
}
