// Bundles src/main.js for the browser.
//
// @wasmward/core is not on npm yet, so it is read straight from a checkout of the Wasmward-backend
// repository. By default that is the folder next to this one; set WASMWARD_CORE_DIR to use another.
// Once the package is published, replace this alias with a normal dependency.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const coreDir = resolve(process.env.WASMWARD_CORE_DIR ?? '../Wasmward-backend');
const coreEntry = resolve(coreDir, 'src/index.ts');

if (!existsSync(coreEntry)) {
  console.error(`Cannot find ${coreEntry}.`);
  console.error('Clone https://github.com/contract-version/Wasmward-backend next to this folder, or set WASMWARD_CORE_DIR.');
  process.exit(1);
}
if (!existsSync(resolve(coreDir, 'node_modules'))) {
  console.error(`Install the library's dependencies first: cd ${coreDir} && pnpm install`);
  process.exit(1);
}

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
