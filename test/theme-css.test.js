import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// The stylesheet has the dark palette twice: once for a system that is set to dark (unless the person forced light),
// and once for a person who forced dark. Data that is written twice drifts, so this says the two are the same, and
// that a forced choice also sets color-scheme, which is what makes the browser's own controls (the select's menu,
// scrollbars) follow.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/)[1];

const variables = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

const light = css.match(/:root\s*\{([^}]*)\}/)[1];
const darkWhenSystemIsDark = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/)?.[1];
const darkForced = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1];
const lightForced = css.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/)?.[1];

test('there is a dark palette for a system set to dark, unless light was chosen, and one for dark chosen', () => {
  assert.ok(darkWhenSystemIsDark, 'no @media (prefers-color-scheme: dark) block for :root:not([data-theme="light"])');
  assert.ok(darkForced, 'no :root[data-theme="dark"] block');
});

test('the two dark palettes are the same, colour for colour', () => {
  assert.deepEqual(variables(darkForced), variables(darkWhenSystemIsDark));
  assert.ok(Object.keys(variables(darkForced)).length >= 12, 'the dark palette lost colours');
});

test('the dark palettes change every colour the light one defines, and nothing else', () => {
  const lightNames = Object.keys(variables(light)).sort();
  assert.deepEqual(Object.keys(variables(darkForced)).sort(), lightNames);
});

test('forcing a theme also sets color-scheme, so native controls match', () => {
  assert.match(darkForced, /color-scheme:\s*dark\s*;/);
  assert.ok(lightForced, 'no :root[data-theme="light"] block');
  assert.match(lightForced, /color-scheme:\s*light\s*;/);
});

test('following the system says both are supported, so native controls follow the system', () => {
  assert.match(light, /color-scheme:\s*light dark\s*;/);
});

test('light is the base, so a person who chose light on a dark system gets the light palette', () => {
  // The dark @media block must not apply under data-theme="light"; that is what the :not() is for.
  assert.match(css, /:root:not\(\[data-theme="light"\]\)/);
  assert.ok(!/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/.test(css), 'an unconditional dark block would override a forced light theme');
});
