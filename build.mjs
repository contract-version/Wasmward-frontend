// Bundles src/main.js for the browser. See core-entry.mjs for where @wasmward/core comes from.
import { build } from 'esbuild';
import { coreEntry } from './core-entry.mjs';

await build({
  entryPoints: ['src/main.js'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  alias: { '@wasmward/core': coreEntry },
  logLevel: 'info',
});
