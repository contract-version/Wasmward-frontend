// Bundles src/main.js for the browser. See core-entry.mjs for where @wasmward/core comes from.
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { coreEntry } from './core-entry.mjs';

const result = await build({
  entryPoints: ['src/main.js'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  // What went into the bundle and how much each part cost, for `pnpm analyze`.
  metafile: true,
  alias: { '@wasmward/core': coreEntry },
  logLevel: 'info',
});

writeFileSync('dist/meta.json', JSON.stringify(result.metafile));
