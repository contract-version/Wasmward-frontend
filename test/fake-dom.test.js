import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { documentFromHtml, FakeDocument } from './support/fake-dom.js';

// Every later test of the page's behaviour runs on this fake, so the fake itself is tested first.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('has an element for every id in the real page, with its tag and initial state', () => {
  const doc = documentFromHtml(html);
  for (const id of ['badge', 'deposit', 'hint', 'hash', 'label', 'checked', 'expiry', 'error', 'explorer', 'profile', 'log']) {
    assert.ok(doc.getElementById(id), `no #${id}`);
  }
  assert.equal(doc.getElementById('deposit').tagName, 'BUTTON');
  assert.equal(doc.getElementById('deposit').disabled, true, 'the button starts disabled in the markup');
  assert.equal(doc.getElementById('explorer').hidden, true, 'the link starts hidden in the markup');
  assert.equal(doc.getElementById('badge').disabled, false);
  assert.equal(doc.getElementById('badge').className, 'badge waiting');
  assert.equal(doc.getElementById('log').tagName, 'OL');
});

test('a <select> starts on its first option', () => {
  assert.equal(documentFromHtml(html).getElementById('profile').value, 'current');
});

test('an id that is not in the page is null, as in a browser', () => {
  assert.equal(documentFromHtml(html).getElementById('nothing'), null);
});

test('a page with the same id twice is refused', () => {
  assert.throws(() => documentFromHtml('<p id="a"></p><p id="a"></p>'), /the id "a" twice/);
});

test('setting textContent replaces everything, and reading it joins the children', () => {
  const doc = new FakeDocument();
  const parent = doc.createElement('div');
  parent.textContent = 'one';
  parent.append(doc.createTextNode(' two'), ' three');
  assert.equal(parent.textContent, 'one two three');
  parent.textContent = 'fresh';
  assert.equal(parent.textContent, 'fresh');
  assert.equal(parent.childNodes.length, 0);
});

test('append adds at the end, prepend at the start, and a moved node leaves its old parent', () => {
  const doc = new FakeDocument();
  const list = doc.createElement('ol');
  const [a, b, c] = ['a', 'b', 'c'].map((text) => {
    const item = doc.createElement('li');
    item.textContent = text;
    return item;
  });
  list.append(a, b);
  list.prepend(c);
  assert.deepEqual(list.children.map((item) => item.textContent), ['c', 'a', 'b']);
  const other = doc.createElement('ol');
  other.append(a);
  assert.deepEqual(list.children.map((item) => item.textContent), ['c', 'b']);
  assert.equal(a.parentNode, other);
  assert.equal(list.firstElementChild, c);
  assert.equal(list.lastElementChild, b);
});

test('remove takes an element out of its parent', () => {
  const doc = new FakeDocument();
  const list = doc.createElement('ol');
  const item = doc.createElement('li');
  list.append(item);
  item.remove();
  assert.equal(list.children.length, 0);
  assert.equal(item.parentNode, null);
  assert.doesNotThrow(() => item.remove(), 'removing an element that has no parent does nothing');
});

test('children counts elements, not text', () => {
  const doc = new FakeDocument();
  const item = doc.createElement('li');
  item.append('text', doc.createElement('time'));
  assert.equal(item.children.length, 1);
  assert.equal(item.childNodes.length, 2);
});

test('listeners run in order with an event whose target is the element, and dispatch waits for them', async () => {
  const doc = documentFromHtml(html);
  const select = doc.getElementById('profile');
  const seen = [];
  select.addEventListener('change', async (event) => {
    await Promise.resolve();
    seen.push(['first', event.target === select, event.type]);
  });
  select.addEventListener('change', () => seen.push(['second']));
  await select.dispatch('change');
  assert.deepEqual(seen, [['first', true, 'change'], ['second']]);
});

test('a disabled element ignores clicks, like a real button', async () => {
  const doc = documentFromHtml(html);
  const button = doc.getElementById('deposit');
  let clicks = 0;
  button.addEventListener('click', () => (clicks += 1));
  await button.click();
  assert.equal(clicks, 0);
  button.disabled = false;
  await button.click();
  assert.equal(clicks, 1);
});

test('attributes are stored as text', () => {
  const doc = new FakeDocument();
  const element = doc.createElement('p');
  assert.equal(element.getAttribute('title'), null);
  element.setAttribute('title', 42);
  assert.equal(element.getAttribute('title'), '42');
});

test('the document can have its own listeners and a visibility state', async () => {
  const doc = new FakeDocument();
  let seen = 0;
  doc.addEventListener('visibilitychange', () => (seen += 1));
  assert.equal(doc.visibilityState, 'visible');
  await doc.dispatch('visibilitychange');
  assert.equal(seen, 1);
});
