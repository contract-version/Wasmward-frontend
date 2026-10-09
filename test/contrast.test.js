import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// WCAG 2 asks for a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text and for the parts
// of a control a person has to see. The page has a light and a dark theme (prefers-color-scheme), so each pair
// of colours that is actually drawn on top of one another is checked in both, from the page's own variables.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/)[1];

/** `--name: value;` declarations of a block of CSS, as { name: value }. */
function variables(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const lightBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
const darkBlock = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1];
const themes = { light: variables(lightBlock), dark: { ...variables(lightBlock), ...variables(darkBlock) } };

/** '#rgb' or '#rrggbb' as [r, g, b] in 0 to 255. */
export function rgb(hex) {
  const text = hex.replace('#', '');
  const full = text.length === 3 ? [...text].map((c) => c + c).join('') : text;
  assert.match(full, /^[0-9a-f]{6}$/i, `not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** Relative luminance, as defined by WCAG 2. */
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test('the contrast function agrees with known values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#fff', '#fff'), 1);
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48'); // the classic just-failing grey
  assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54'); // and the lightest grey that passes
  assert.equal(contrast('#fff', '#000'), contrast('#000', '#fff'), 'order must not matter');
});

test('the page defines the colours the checks below use, in both themes', () => {
  for (const [name, theme] of Object.entries(themes)) {
    for (const key of ['bg', 'card', 'text', 'muted', 'line', 'ok', 'ok-bg', 'bad', 'bad-bg', 'wait', 'wait-bg', 'accent', 'on-accent']) {
      assert.match(theme[key] ?? '', /^#[0-9a-f]{3,6}$/i, `${name} theme has no usable --${key}`);
    }
  }
});

// [text colour, background, minimum ratio, what it is]. A name is one of the page's variables; a '#' value is literal.
const PAIRS = [
  ['text', 'bg', 4.5, 'body text on the page'],
  ['text', 'card', 4.5, 'text in a card, and in the select'],
  ['muted', 'bg', 4.5, 'the lead paragraph'],
  ['muted', 'card', 4.5, 'labels, hints and times in a card'],
  ['ok', 'ok-bg', 4.5, 'the "supported" badge'],
  ['bad', 'bad-bg', 4.5, 'the "blocked" badge'],
  ['wait', 'wait-bg', 4.5, 'the "waiting" badge and the expiry warning'],
  ['accent', 'card', 4.5, 'a link in a card'],
  ['on-accent', 'accent', 4.5, 'the label of the button'],
  ['muted', 'line', 4.5, 'the label of a disabled button'],
  ['accent', 'card', 3, 'the focus ring against the card'],
];

for (const theme of ['light', 'dark']) {
  test(`${theme} theme: every pair of colours that is drawn has enough contrast`, () => {
    const failures = [];
    for (const [foreground, background, minimum, what] of PAIRS) {
      const colour = (value) => (value.startsWith('#') ? value : themes[theme][value]);
      const ratio = contrast(colour(foreground), colour(background));
      if (ratio < minimum) failures.push(`${what}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
    }
    assert.deepEqual(failures, []);
  });
}

// The pairs above are only worth anything if the stylesheet really draws those colours. These check that it does.
test('links are drawn in the accent colour, not the browser default', () => {
  assert.match(css, /(^|\n)\s*a\s*\{[^}]*color:\s*var\(--accent\)/);
});

test('the button label is drawn in --on-accent, on the --accent background', () => {
  const button = css.match(/(^|\n)\s*button\s*\{([^}]*)\}/)[2];
  assert.match(button, /color:\s*var\(--on-accent\)/);
  assert.match(button, /background:\s*var\(--accent\)/);
});

test('the disabled button is drawn in --muted on --line', () => {
  assert.match(css, /button:disabled\s*\{[^}]*background:\s*var\(--line\)[^}]*color:\s*var\(--muted\)/);
});

test('no rule sets a literal colour for text, so every colour checked above is the one that is drawn', () => {
  // A literal colour would escape the checks. (Variable definitions are the theme's own and are removed first.)
  const withoutVariables = css.replace(/--[a-z-]+\s*:\s*[^;]+;/g, '');
  const literals = [...withoutVariables.matchAll(/(?<![-\w])color:\s*(#[0-9a-f]{3,8}|rgb|hsl)/gi)].map((m) => m[0]);
  assert.deepEqual(literals, []);
});
