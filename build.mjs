// Bundles the page for the browser. See core-entry.mjs for where @wasmward/core comes from.
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { coreEntry } from './core-entry.mjs';

const result = await build({
  // Two scripts: the page, and a tiny one that runs in <head> to apply the saved theme before anything is drawn
  // (see src/theme-init.js), so it does not wait for the large bundle.
  entryPoints: { app: 'src/main.js', 'theme-init': 'src/theme-init.js' },
  outdir: 'dist',
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
