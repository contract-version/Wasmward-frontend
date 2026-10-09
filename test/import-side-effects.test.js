import assert from 'node:assert/strict';
import { test } from 'node:test';
// Imported only for what importing them does. Each of these is also a command-line script, and the tests bundle
// them into test files; they must not run their command-line part when that happens (check-bundle would look for
// dist/app.js, which CI has not built yet when it runs the tests, and update-csp could rewrite index.html).
import '../check-bundle.mjs';
import '../update-csp.mjs';

test('importing the command-line scripts does not run them', () => {
  // main() ends with `process.exitCode = ...`, so any run would have set it, even to 0.
  assert.equal(process.exitCode, undefined);
});
