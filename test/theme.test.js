import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTheme, DEFAULT_THEME, readTheme, saveTheme, STORAGE_KEY, THEMES } from '../src/theme.js';

/** A storage that holds what it is given, or throws on every use (as browsers do in some private modes). */
function storage(initial = {}, { throws = false } = {}) {
  const data = new Map(Object.entries(initial));
  const fail = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return {
    data,
    getItem: (key) => (throws ? fail() : data.has(key) ? data.get(key) : null),
    setItem: (key, value) => (throws ? fail() : void data.set(key, String(value))),
  };
}

test('there are three themes, and following the system is the default', () => {
  assert.deepEqual(THEMES, ['auto', 'light', 'dark']);
  assert.equal(DEFAULT_THEME, 'auto');
});

test('a saved choice is read back', () => {
  for (const theme of THEMES) assert.equal(readTheme(storage({ [STORAGE_KEY]: theme })), theme);
});

test('nothing saved means the default', () => {
  assert.equal(readTheme(storage()), 'auto');
});

test('a saved value that is not a theme is ignored, whatever it is', () => {
  for (const junk of ['', 'DARK', 'Dark', ' dark', 'blue', 'constructor', '__proto__', '<script>', 'dark\n', '0', 'null', 'undefined']) {
    assert.equal(readTheme(storage({ [STORAGE_KEY]: junk })), 'auto', JSON.stringify(junk));
  }
});

test('storage that throws, or is not there, gives the default instead of an error', () => {
  assert.equal(readTheme(storage({}, { throws: true })), 'auto');
  for (const missing of [undefined, null, {}, { getItem: 'no' }]) assert.equal(readTheme(missing), 'auto', String(missing));
});

test('saving stores the choice and says it worked', () => {
  const store = storage();
  assert.equal(saveTheme(store, 'dark'), true);
  assert.equal(store.data.get(STORAGE_KEY), 'dark');
  assert.equal(readTheme(store), 'dark');
});

test('only a real theme is saved', () => {
  const store = storage();
  for (const junk of ['blue', '', undefined, null, 'constructor']) assert.equal(saveTheme(store, junk), false, String(junk));
  assert.equal(store.data.size, 0);
});

test('saving to storage that throws says it did not work, and does not throw', () => {
  assert.equal(saveTheme(storage({}, { throws: true }), 'light'), false);
  for (const missing of [undefined, null, {}]) assert.equal(saveTheme(missing, 'light'), false);
});

/** The page's root element, reduced to the attribute calls the page makes. */
function root() {
  const attributes = new Map();
  return {
    attributes,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
  };
}

test('a chosen theme is put on the page as data-theme, and auto removes it so the system decides', () => {
  const html = root();
  applyTheme(html, 'dark');
  assert.equal(html.getAttribute('data-theme'), 'dark');
  applyTheme(html, 'light');
  assert.equal(html.getAttribute('data-theme'), 'light');
  applyTheme(html, 'auto');
  assert.equal(html.getAttribute('data-theme'), null);
});

test('applying something that is not a theme leaves the page as the default, never writes it into the page', () => {
  const html = root();
  applyTheme(html, 'dark');
  applyTheme(html, '"><script>');
  assert.equal(html.getAttribute('data-theme'), null);
  assert.ok(![...html.attributes.values()].some((value) => value.includes('script')));
});
