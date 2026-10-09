import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// The README says everything on the page is set with textContent, so nothing an RPC returns can inject markup.
// That is only true while no code path reaches for an API that parses a string as HTML or runs it as code.
// This scans the page's own source for those APIs.

const UNSAFE = [
  [/\.innerHTML\b/, 'innerHTML'],
  [/\.outerHTML\b/, 'outerHTML'],
  [/\binsertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
  [/\bdocument\.write(ln)?\s*\(/, 'document.write'],
  [/\.srcdoc\b/, 'srcdoc'],
  [/\bcreateContextualFragment\s*\(/, 'createContextualFragment'],
  [/\bDOMParser\b/, 'DOMParser'],
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\s*\(/, 'new Function'],
  [/\bset(Timeout|Interval)\s*\(\s*['"`]/, 'a timer given a string to run'],
];

/** The unsafe APIs a piece of source uses, by name. Comments are ignored; code and strings are not. */
export function unsafeApisIn(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return UNSAFE.filter(([pattern]) => pattern.test(withoutComments)).map(([, name]) => name);
}

test('the scanner flags each unsafe API, and only those', () => {
  const cases = {
    'el.innerHTML = x;': ['innerHTML'],
    'el.outerHTML = x;': ['outerHTML'],
    "el.insertAdjacentHTML('beforeend', x);": ['insertAdjacentHTML'],
    'document.write(x);': ['document.write'],
    'document.writeln(x);': ['document.write'],
    'frame.srcdoc = x;': ['srcdoc'],
    'range.createContextualFragment(x);': ['createContextualFragment'],
    "new DOMParser().parseFromString(x, 'text/html');": ['DOMParser'],
    'eval(x);': ['eval'],
    'new Function(x)();': ['new Function'],
    "setTimeout('run()', 1);": ['a timer given a string to run'],
    'setInterval(`run()`, 1);': ['a timer given a string to run'],
    'a.innerHTML = b; eval(c);': ['innerHTML', 'eval'],
  };
  for (const [source, expected] of Object.entries(cases)) assert.deepEqual(unsafeApisIn(source), expected, source);
});

test('the scanner leaves safe code and comments alone', () => {
  const safe = [
    'el.textContent = x;',
    'el.append(document.createTextNode(x));',
    'setTimeout(() => render(), 1000);',
    'setInterval(render, 1000);',
    '// we never use innerHTML here\nel.textContent = x;',
    '/* eval( is banned */ el.textContent = x;',
    'const evaluate = 1; const medieval = 2;',
    'el.setAttribute("title", x);',
  ];
  for (const source of safe) assert.deepEqual(unsafeApisIn(source), [], source);
});

test('nothing under src/ uses an API that parses text as HTML or runs it as code', () => {
  const files = readdirSync(new URL('../src/', import.meta.url)).filter((name) => name.endsWith('.js'));
  assert.ok(files.includes('main.js'), 'the scan did not find the page script');
  for (const name of files) {
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    assert.deepEqual(unsafeApisIn(source), [], `src/${name} uses an unsafe API`);
  }
});

test('index.html has no inline script, inline event handler or javascript: URL', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([, attributes, body]) => !/\bsrc=/.test(attributes) || body.trim() !== '');
  assert.deepEqual(inlineScripts.map(([tag]) => tag.slice(0, 60)), []);
  assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, 'an inline event handler');
  assert.doesNotMatch(html, /javascript:/i);
});
