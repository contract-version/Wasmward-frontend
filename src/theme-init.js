import { initTheme } from './theme.js';

// Runs in <head>, before the page is drawn, and does only this: apply the saved theme. It is a separate, tiny file
// so that it can run without waiting for the large bundle, which would draw the page in the wrong theme first.
// Merely reading localStorage throws in some browsers when site data is blocked, hence the try.
let storage;
try {
  storage = globalThis.localStorage;
} catch {
  storage = undefined;
}
initTheme(document.documentElement, storage);
