## What changed, and why

## How you checked it

- [ ] `rm -rf dist dist-test && pnpm test` passes from a clean state
- [ ] If the CSS changed: `pnpm csp:update`
- [ ] If what the page shows changed: I looked at it in a browser (see docs/TESTING.md)
- [ ] A behaviour change has a test that failed before the change
