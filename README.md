# Wasmward browser example

A small web page that uses [Wasmward](https://github.com/contract-version/Wasmward-backend) in the browser. It watches a contract on Stellar testnet and **turns a write button off whenever the code the contract is running is not one this app supports.**

It is the "disable write buttons with `subscribe`" example from Wasmward's docs, and it needs no framework: one HTML file, one JavaScript file, and a build step.

## What you will see

- The contract's status (`supported`, `unsupported`, `missing`, ...), the live Wasm hash, the label of the supported version it matched, and **how long the contract has left before it expires** (turning amber under about a week). A contract runs from its instance and its Wasm code, which expire separately; the row shows the sooner of the two and says "(Wasm code)" when that is the one running out. It is built in `src/expiry.js` from `ledgersUntilExpiry`, `expiringEntry` and `describeTimeLeft` in the library, and is informational: it never changes whether writes are allowed. If either entry has expired the status becomes `archived` and the button turns off.
- A **Deposit 10 (demo)** button that is enabled only while the guard says writes are allowed. Clicking it does not send a transaction; it shows what a guarded call looks like.
- A switch that pretends this is an **older build of the app**, one that was never tested against the contract's current code. The status becomes `unsupported`, the button turns off, and the page shows the exact reason Wasmward gives:

  ```text
  Writes to 'vault' are blocked: live code a7a82511... is not in the supported list
  ```

  That is what a user of an out-of-date app would see after a contract upgrade, instead of a failed or wrongly interpreted transaction.
- A log of every status change.

## Run it

You need Node.js 20 or later and [pnpm](https://pnpm.io). The library is not on npm yet, so this example reads it from a checkout of the Wasmward-backend repository placed next to this one:

```bash
git clone https://github.com/contract-version/Wasmward-backend.git
git clone https://github.com/contract-version/Wasmward-frontend.git

cd Wasmward-backend && pnpm install && cd ..
cd Wasmward-frontend && pnpm install
pnpm dev
```

Then open <http://127.0.0.1:5173>. To keep the library somewhere else, set `WASMWARD_CORE_DIR` to that folder. `pnpm build` only builds; `pnpm serve` only serves; `pnpm test` runs the tests in `test/` (the page's display logic, run in Node against the real library).

The page talks to the public testnet RPC (`https://soroban-testnet.stellar.org`) straight from your browser, so it needs network access. It uses the Wasmward test contract from [Wasmward-contract](https://github.com/contract-version/Wasmward-contract). If testnet is reset or that contract has expired, the status will read `missing`, and the button will stay off: the guard fails closed.

## How it works

All of the Wasmward code is in [`src/main.js`](src/main.js):

```js
import { createVersionGuard, loadConfig } from '@wasmward/core';

const guard = createVersionGuard(loadConfig({ /* network, contract, supported hashes */ }));

// The button follows the guard.
guard.subscribe(() => {
  depositButton.disabled = !guard.isWritable('vault');
});
await guard.start();

// A wrapped write refuses to run while the live code is not supported.
const deposit = guard.guard('vault', sendDepositTransaction);
```

To use the same pattern in your own app:

1. List the Wasm hashes your app was tested against in `supported` (get one with `npx wasmward hash your.wasm`).
2. Call `guard.start()` once when the app loads.
3. Wrap your write functions with `guard.guard(...)`, or call `guard.assertWritable(...)` first, and disable the matching buttons from `guard.subscribe`.
4. Keep simulating transactions before you submit them. The guard narrows the window around an upgrade; it cannot close it.

See [the operations guide](https://github.com/contract-version/Wasmward-backend/blob/main/docs/OPERATIONS.md) for the limits, and remember that code running in a browser can be tampered with by its user: this protects honest clients, it is not access control.

## Keeping the demo honest

The demo is only as good as the contract it points at. [`wasmward.json`](wasmward.json) describes that contract the way Wasmward describes any contract, and CI uses it twice:

- an offline check that `src/main.js` and `wasmward.json` still name the same contract and hash;
- a `contract-alive` job that runs the [Wasmward GitHub Action](https://github.com/contract-version/Wasmward-backend#in-github-actions) with `min-ttl-days: 1`, so a missing, changed or about-to-expire contract turns CI red. It needs testnet, so it is a separate job from the build.

## Notes

- Everything shown is set with `textContent`, never as HTML, so nothing returned by an RPC can inject markup.
- The page works at phone width and follows the system light or dark setting.
- `dist/` is a build output and is not committed.

## License

Apache-2.0. See [LICENSE](LICENSE).
