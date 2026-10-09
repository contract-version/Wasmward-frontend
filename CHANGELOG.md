# Changelog

Nothing has been released: this is a demo page, built from the repository. Changes are listed newest first, under the
heading "Unreleased", grouped by what a person using the page, or working on it, would notice.

## Unreleased

### The page

- **Retries a check that cannot start.** If the first check fails for a passing reason (offline for a moment, a slow RPC) the page said "cannot check" and never recovered without a reload. It now retries after 2 seconds, then twice as long each time up to 30, says when, and logs it once. **Try again now** and the browser coming back online end the wait at once. A problem retrying cannot fix (another network, a bad config) is shown and not retried.
- **Pauses while the tab is hidden.** A page left in a background tab polled the RPC every 10 seconds for as long as it stayed open. It now stops and checks again as soon as the tab is shown.
- **Shows an error it did not expect,** as text with `role="alert"`, instead of quietly stopping.
- **Shows the effective status.** The badge followed the status of the last check, so a stalled poll still read "supported" while writes were blocked. It now reads `stale`.
- **New:** a Network row, a list of the builds this app supports (the live one marked "running now"), a Copy button for the live hash, the status in the tab title, a Theme choice (follow the system, light or dark, remembered and applied before the page is drawn), and the chosen build in the address (`#build=older`) so a link can share it.
- **Fixed:** the Changes log grew without limit (it keeps the last 100); an unknown build choice left a dead page; a `stop()` that failed blocked switching builds; the once-a-second refresh rewrote text that had not changed, which can make a screen reader read a live region again every second; log times were not real `<time>` elements.
- **Readable in dark mode:** links were the browser's default blue on a dark card (about 1.7:1) and the button label was 2.34:1; the disabled button's label was just under 4.5:1 in the light theme. Contrast is now tested for every pair of colours in both themes.

### Security

- A Content-Security-Policy in the page (its own script, one RPC, the inline stylesheet by hash, `data:` images). `pnpm csp:update` keeps the hash current.
- Nothing is parsed as HTML: a test scans the source for `innerHTML`, `eval` and the like. Values read from the address, storage and the clipboard can only select from fixed sets and are shown as text.
- The dev server answers GET and HEAD only, for `index.html` and `dist/` only; a malformed URL (`/%E0%A4%A`) is a 400 where it used to stop the server; a bad or busy `PORT` gets a sentence; each request is logged without its query string.

### Working on it

- The page's behaviour is `createApp` in `src/app.js`, with its dependencies passed in, and is tested against a fake DOM and a fake guard. See [docs/TESTING.md](docs/TESTING.md).
- `pnpm analyze` shows what the bundle is made of (the Stellar SDK is 55%, zod 37%, this page 0.7%); `pnpm check:bundle` enforces a size budget and no Node-only modules.
- Tests that keep package.json, the README, CI and `.nvmrc` from drifting apart; a test that never finishes fails after a minute instead of hanging the run; CI runs on Node 20 and 22.
