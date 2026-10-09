# Contributing

This is a small browser example for [Wasmward](https://github.com/contract-version/Wasmward-backend): one page that watches a contract on Stellar testnet and turns a write button off when the live code is not one the app supports. Keep it small and keep it honest.

## Set up and check

You need Node.js 20 or newer and [pnpm](https://pnpm.io), and a checkout of `Wasmward-backend` next to this one (see the [README](README.md)).

```bash
pnpm install
pnpm test           # the tests, in Node, against the real library
pnpm build
pnpm check:bundle   # no Node-only modules in the bundle, and within its size budget
node update-csp.mjs --check
```

That is what [CI](.github/workflows/ci.yml) runs, on Node 20 and 22. One more CI job, `contract-alive`, needs testnet and checks that the contract the page watches still exists and has time left.

**Run the tests from a clean state at least once before you push** (`rm -rf dist dist-test`, then `pnpm test`). CI runs the tests before it builds, so a test that quietly depends on `dist/` passes on a machine where you have built and fails there.

## Changing what the page does

The behaviour is `createApp` in `src/app.js`, tested against a fake DOM and a fake guard: write the failing test first, then change the code. [docs/TESTING.md](docs/TESTING.md) says how, and lists what will catch you out (an awaited `h.run()` while retrying, handlers that wait on timers, files relative to `test/support/`). After a change to what the page shows, look at it in a browser too: several bugs here were only visible there.

## Rules that the tests enforce

- **Write only what changed.** Set text through `setText`/`setClass`, never `el.textContent = ...` on something the refresh touches. Rewriting a live region with the same words can make a screen reader read it again, once a second (`test/app-writes.test.js`).
- **The log is for changes of the contract.** Do not log interface noise such as switching tabs.
- **Anything read from a URL, storage or the clipboard is untrusted input.** It may only ever select one of a fixed set of values (see `route.js`, `theme.js`), and it is shown as text.

- **Edited the CSS? Run `pnpm csp:update`.** The page's Content-Security-Policy allows the one inline stylesheet by its SHA-256. Without the new hash a browser leaves the page unstyled, and `test/csp.test.js` fails.
- **Never put text into the page as HTML.** Use `textContent` or `document.createTextNode`. `test/no-html-injection.test.js` rejects `innerHTML`, `eval` and the like, and inline scripts and handlers in `index.html`.
- **A new colour needs a contrast check.** `test/contrast.test.js` computes the WCAG ratio of each text and background pair in both themes, and fails if a rule sets a literal text colour that would escape it. Add the new pair to its list.
- **New `id`s in `index.html` and `$('...')` lookups in `main.js` must agree.** `test/page.test.js` checks it, since a missing id stops the whole page on load.
- **The demo and `wasmward.json` describe the same contract.** If the contract is redeployed, change both (`src/demo-config.js` and `wasmward.json`); `test/demo-config.test.js` compares them.
- **A new status or tone needs a CSS rule and a test.** `statusView` treats anything it does not know as blocked on purpose.

## Command-line scripts

`check-bundle.mjs` and `update-csp.mjs` are scripts and also modules the tests import. A script must only run its command-line part when it is the file being executed, **by name**, as they do now: the tests bundle modules into test files, where the usual "is this the main module" check is true for the test file as well. `test/import-side-effects.test.js` guards this.

## Commits

Small and conventional (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `refactor:`, `chore:`), one idea each, with its tests. Say in a `fix:` what was wrong and how you saw it.
