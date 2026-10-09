# Testing

`pnpm test` bundles every `test/*.test.js` with esbuild (so the tests can import the page's modules and the real `@wasmward/core`) and runs them with `node --test`. There is no browser and no test framework to install. A test that never finishes fails after a minute instead of hanging the run.

## The page's behaviour is tested through `createApp`

[`src/app.js`](../src/app.js) takes everything it touches as an argument. A test gives it:

| Stand-in | From | What it does |
|---|---|---|
| a document | `test/support/fake-dom.js` | Built from the real `index.html`: every element with an id, its tag, and its initial `hidden`/`disabled`. It implements only what the page uses, and throws on the rest. |
| a guard | `test/support/fake-guard.js` | Reports what you set, and can hold or fail `start()` and `stop()`, to make races and failures on demand. |
| the rest | `test/support/app-harness.js` | A clock (`h.advance(ms)`), the timers (`h.tick()`), the pauses between retries (`h.elapse()`), the build selector (`h.choose('older')`), the tab (`h.hide()`, `h.show()`), the address, the clipboard, storage and the window's error events. |

```js
const h = harness({ setup: (guard) => guard.set({ status: 'supported', liveWasmHash: V1_HASH }) });
await h.run();
assert.equal(h.text('badge'), 'supported');
assert.equal(h.el('deposit').disabled, false);
```

Start from a test that fails, then change `app.js`. See [`test/app-retry.test.js`](../test/app-retry.test.js) for a feature written that way.

## Things that will catch you out

- **`await h.run()` waits for the first start to work or be abandoned.** While the page is retrying it does not finish. Do not await it in a test of a failing start: call `h.run()`, then `await h.settle()`, and drive the retries with `h.elapse()`.
- **The fake DOM's `dispatch` waits for listeners.** A click handler that awaits a long timer makes `await button.click()` hang. Handlers should not wait for timers that only the test can end.
- **The fake DOM does not read arbitrary attributes from the HTML.** Check `aria-label`, `role` and the like in a page test, on the HTML string (see `test/page.test.js`).
- **Support files are bundled into `dist-test/`,** which is not as deep as `test/support/`. Read files from the working directory (`readFileSync('index.html')`), not from a path relative to the support file.
- **A script that is also a module** (`check-bundle.mjs`, `update-csp.mjs`, `analyze-bundle.mjs`) must only run its command line when its file *name* is the one executed. Bundled into a test, the usual "am I the main module" check is true for the test file as well. `test/import-side-effects.test.js` guards it.
- **Run the tests from a clean state before you push:** `rm -rf dist dist-test && pnpm test`. CI runs the tests before it builds.

## Show that a test can fail

A test that has never failed has not shown it tests anything. After writing one, break the code it is about (comment out the line, flip a condition) and check that exactly this test goes red, then put the code back. Two examples from this repository: removing the guard against replaced guards in `begin()` fails `test/app-switching.test.js`; removing the generation bump in `pause()` did *not* fail anything until the case "hiding the tab while a switch waits for the old guard" was added.

## What the tests do not cover, and what does

The fakes do not know what the real library or a real browser does, and some things only a browser shows: the refresh that overwrote a failure message, a page left dead by an unknown build choice, a retry that came back after one second. Look at the page in a browser after a change to what it shows (`pnpm build && pnpm serve`). Notes for doing that:

- A tab that is not in front reports `visibilityState: hidden`, so the page loads *paused*. Bring it to the front, or in a scripted browser define `document.visibilityState` and fire `visibilitychange`.
- To see the failure and retry display, serve a copy of the page whose Content-Security-Policy has `connect-src 'none'`: the RPC request is then really blocked.
- The clipboard may be denied in an automated browser. The page then shows the browser's own refusal; the success path is covered by the unit tests only.
