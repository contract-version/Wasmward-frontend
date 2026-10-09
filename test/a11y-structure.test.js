import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// The structure a screen reader and the keyboard rely on, checked on the markup: no browser needed, and it fails the
// moment someone breaks it. (Colour contrast is checked in contrast.test.js.)

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const body = html.slice(html.indexOf('<body'));

const tagsNamed = (name) => [...body.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map((match) => match[1]);
const attr = (attributes, name) => attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

test('the page declares its language, so a screen reader pronounces it correctly', () => {
  assert.match(html, /<html\s+lang="[a-z]{2}(-[A-Za-z]{2,})?"/);
});

test('it has a viewport that does not stop people zooming', () => {
  const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1] ?? '';
  assert.match(viewport, /width=device-width/);
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*(no|0)/i);
  assert.doesNotMatch(viewport, /maximum-scale\s*=\s*1(\.0)?\b/i);
});

test('there is exactly one main landmark and exactly one h1', () => {
  assert.equal(tagsNamed('main').length, 1);
  assert.equal(tagsNamed('h1').length, 1);
});

test('headings go down one level at a time, never skipping one', () => {
  const levels = [...body.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels[0], 1);
  for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] <= levels[i - 1] + 1, `h${levels[i]} follows h${levels[i - 1]}`);
});

test('every section is named by a heading that exists in the page', () => {
  const sections = tagsNamed('section');
  assert.ok(sections.length >= 4);
  for (const attributes of sections) {
    const heading = attr(attributes, 'aria-labelledby');
    assert.ok(heading, `a section has no aria-labelledby: ${attributes}`);
    assert.ok(ids.includes(heading), `aria-labelledby="${heading}" points at nothing`);
    assert.match(body, new RegExp(`<h[1-6]\\b[^>]*\\bid="${heading}"`), `#${heading} is not a heading`);
  }
});

test('every button has a type, and a name a person can hear', () => {
  const buttons = [...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  assert.ok(buttons.length >= 1);
  for (const [, attributes, text] of buttons) {
    assert.equal(attr(attributes, 'type'), 'button', `a button has no type="button": ${attributes}`);
    assert.ok(attr(attributes, 'aria-label') || text.trim() !== '', `a button has no name: ${attributes}`);
  }
});

test('every select has a label that points at it', () => {
  for (const attributes of tagsNamed('select')) {
    const id = attr(attributes, 'id');
    assert.ok(id, 'a select has no id');
    assert.match(body, new RegExp(`<label\\b[^>]*\\bfor="${id}"`), `no <label for="${id}">`);
  }
});

test('a link that opens a new tab cannot reach back into this page', () => {
  for (const attributes of tagsNamed('a')) {
    if (attr(attributes, 'target') === '_blank') assert.match(attr(attributes, 'rel') ?? '', /\bnoopener\b/, attributes);
  }
});

test('links have visible text of their own, not just "click here"', () => {
  for (const [, attributes, text] of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const words = text.replace(/<[^>]*>/g, '').trim();
    assert.ok(words.length >= 8 && !/^(click here|here|link|more)$/i.test(words), `a link says only "${words}": ${attributes}`);
  }
});

test('live regions are few and deliberate: the badge, the hint, the copy note, the log and the alert', () => {
  const live = [...body.matchAll(/<[a-z0-9]+\b[^>]*\b(?:aria-live|role="(?:status|alert|log)")[^>]*>/gi)].map((match) => attr(match[0], 'id'));
  assert.deepEqual(live.sort(), ['badge', 'copy-status', 'hint', 'log', 'problem']);
});

test('nothing is hidden from the accessibility tree by aria-hidden', () => {
  assert.doesNotMatch(body, /aria-hidden="true"/);
});

test('the page has a <noscript> message, since it does nothing without scripts', () => {
  assert.match(body, /<noscript>[^<]+<\/noscript>/);
});
