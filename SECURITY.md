# Security

This is a demo page for [Wasmward](https://github.com/contract-version/Wasmward-backend). It holds no secrets, signs nothing and sends no transactions (the "Deposit" button only shows what a guarded call looks like). What is worth getting right is that a page which displays what a public RPC says does not trust it.

## What the page defends against

- **Markup or script arriving from the network.** Everything is shown with `textContent`; a test scans the source for `innerHTML`, `eval` and similar. A Content-Security-Policy in the page allows only its own script, one RPC, the inline stylesheet by hash, and `data:` images, so injected markup could not run code or send data elsewhere.
- **Values read from the address bar, storage or the clipboard.** The `#build=` fragment, the saved theme and any copied text may only select from fixed sets and are shown as text. `__proto__` and the other names an object inherits are refused.
- **The dev server.** `pnpm serve` listens on 127.0.0.1, answers GET and HEAD for `index.html` and `dist/` only, refuses path tricks, answers a malformed URL with a 400, and never logs a query string. It is for trying the page, not for hosting it.

## What it does not defend against

- **Someone who controls the browser.** Code running in a browser can be tampered with by whoever runs it. The page protects honest clients from a contract upgrade, it is not access control.
- **A dishonest RPC.** Wasmward trusts the RPC it is pointed at. The page uses one public testnet RPC and has no second opinion.
- **The window between an upgrade and the next check.** A write sent in that window can reach the new code.

## What is worth reporting

- A way to make the page run script or add markup from the RPC, the address, storage or the clipboard.
- A way to make the dev server serve a file other than `index.html` or something in `dist/`, or stop it.
- A change that weakens the policy in the page (`'unsafe-inline'`, `'unsafe-eval'`, a wider `connect-src`).

## How to report

Use GitHub's private vulnerability reporting for this repository if it is enabled (the Security tab). If it is not, open an issue that says a security problem exists **without describing it**, and the maintainers will arrange a private channel.
