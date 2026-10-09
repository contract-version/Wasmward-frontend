import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// GitHub silently ignores an issue form that is missing a required key, and then people get a blank box. There is no
// YAML parser here, so these check the keys GitHub requires, line by line.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const forms = readdirSync(new URL('../.github/ISSUE_TEMPLATE/', import.meta.url)).filter((name) => name !== 'config.yml');

test('there are issue forms for a bug and for an idea', () => {
  assert.deepEqual(forms.sort(), ['bug_report.yml', 'feature_request.yml']);
});

test('every form has a name, a description and a body, and nothing is indented with a tab', () => {
  for (const form of forms) {
    const text = read(`.github/ISSUE_TEMPLATE/${form}`);
    for (const key of ['name', 'description', 'body']) assert.match(text, new RegExp(`^${key}:`, 'm'), `${form} has no top-level ${key}:`);
    assert.doesNotMatch(text, /\t/, `${form} has a tab, which YAML does not allow`);
  }
});

test('every input in a form has a type, an id and a label, and the ids are unique within the form', () => {
  for (const form of forms) {
    const text = read(`.github/ISSUE_TEMPLATE/${form}`);
    const inputs = text.split(/^ {2}- type: /m).slice(1);
    assert.ok(inputs.length >= 2, `${form} has too few inputs`);
    const ids = [];
    for (const input of inputs) {
      const type = input.split('\n')[0].trim();
      assert.match(type, /^(markdown|textarea|input|dropdown|checkboxes)$/, `${form}: unknown input type ${type}`);
      if (type === 'markdown') continue;
      const id = input.match(/^ {4}id: (\S+)/m)?.[1];
      assert.ok(id, `${form}: a ${type} has no id`);
      assert.match(input, /^ {6}label: \S/m, `${form}: ${id} has no label`);
      ids.push(id);
    }
    assert.equal(new Set(ids).size, ids.length, `${form} repeats an id`);
  }
});

test('the bug form asks for what a report about this page needs', () => {
  const text = read('.github/ISSUE_TEMPLATE/bug_report.yml');
  for (const needed of ['badge said', 'Which build was selected', 'Browser and version', 'browser console', 'Content-Security-Policy', 'SECURITY.md']) {
    assert.ok(text.includes(needed), `the bug form does not mention "${needed}"`);
  }
});

test('blank issues are off, and the contact link points at the library repository', () => {
  const config = read('.github/ISSUE_TEMPLATE/config.yml');
  assert.match(config, /^blank_issues_enabled: false$/m);
  assert.match(config, /url: https:\/\/github\.com\/contract-version\/Wasmward-backend\/issues/);
});

test('the pull request template asks for the checks CONTRIBUTING and the testing guide describe', () => {
  const template = read('.github/pull_request_template.md');
  assert.match(template, /rm -rf dist dist-test && pnpm test/);
  assert.match(template, /pnpm csp:update/);
  assert.match(template, /docs\/TESTING\.md/);
  assert.match(read('CONTRIBUTING.md'), /rm -rf dist dist-test/);
});
