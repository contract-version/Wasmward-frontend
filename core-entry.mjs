// Where @wasmward/core is read from. It is not on npm yet, so it is read straight from a checkout of the
// Wasmward-backend repository. By default that is the folder next to this one; set WASMWARD_CORE_DIR to use
// another. Once the package is published, replace this with a normal dependency. Shared by build and test.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const coreDir = resolve(process.env.WASMWARD_CORE_DIR ?? '../Wasmward-backend');
export const coreEntry = resolve(coreDir, 'src/index.ts');

if (!existsSync(coreEntry)) {
  console.error(`Cannot find ${coreEntry}.`);
  console.error('Clone https://github.com/contract-version/Wasmward-backend next to this folder, or set WASMWARD_CORE_DIR.');
  process.exit(1);
}
if (!existsSync(resolve(coreDir, 'node_modules'))) {
  console.error(`Install the library's dependencies first: cd ${coreDir} && pnpm install`);
  process.exit(1);
}
