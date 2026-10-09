import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashForProfile, profileFromHash } from '../src/route.js';

// What is in the address bar after # is chosen by whoever made the link, so it is untrusted input: it may only ever
// select one of the builds the page already knows, and anything else is ignored.

const KNOWN = { current: 'the current', older: 'an older' };

test('a known build in the fragment is chosen', () => {
  assert.equal(profileFromHash('#build=older', KNOWN), 'older');
  assert.equal(profileFromHash('#build=current', KNOWN), 'current');
});

test('the leading # is optional, and other parameters around it are ignored', () => {
  assert.equal(profileFromHash('build=older', KNOWN), 'older');
  assert.equal(profileFromHash('#x=1&build=older&y=2', KNOWN), 'older');
});

test('the first of several choices wins, and encoded text is decoded before it is compared', () => {
  assert.equal(profileFromHash('#build=older&build=current', KNOWN), 'older');
  assert.equal(profileFromHash('#build=%6Flder', KNOWN), 'older');
});

test('anything that is not a build the page knows is ignored', () => {
  for (const hash of ['#build=bogus', '#build=', '#build', '#', '', '#older', '#BUILD=older', '#build=Older', '#build=older ', '#build= older']) {
    assert.equal(profileFromHash(hash, KNOWN), undefined, JSON.stringify(hash));
  }
});

test('names inherited from Object are not builds, however they are written', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '%5F%5Fproto%5F%5F']) {
    assert.equal(profileFromHash(`#build=${name}`, KNOWN), undefined, name);
  }
});

test('something that is not text, or is absurdly long, is ignored without being parsed', () => {
  for (const bad of [undefined, null, 42, {}, [], ['#build=older']]) assert.equal(profileFromHash(bad, KNOWN), undefined, String(bad));
  assert.equal(profileFromHash(`#build=older&junk=${'a'.repeat(5000)}`, KNOWN), undefined);
  assert.equal(profileFromHash(`#build=${'o'.repeat(300)}`, KNOWN), undefined);
});

test('markup or script in the fragment is just a name that is not a build', () => {
  for (const hash of ['#build=<script>alert(1)</script>', '#build="><img src=x onerror=alert(1)>', "#build=older';alert(1);'", '#build=javascript:alert(1)']) {
    assert.equal(profileFromHash(hash, KNOWN), undefined, hash);
  }
});

test('the default build needs no fragment, and another one is written as build=name', () => {
  assert.equal(hashForProfile('current', 'current'), '');
  assert.equal(hashForProfile('older', 'current'), '#build=older');
});

test('what the page writes it can read back, for every build it knows', () => {
  for (const profile of Object.keys(KNOWN)) {
    const hash = hashForProfile(profile, 'current');
    assert.equal(profileFromHash(hash, KNOWN) ?? 'current', profile);
  }
});

test('a build name is encoded when it is written, so it can never end a fragment early', () => {
  assert.equal(hashForProfile('a b&c', 'current'), '#build=a%20b%26c');
});
