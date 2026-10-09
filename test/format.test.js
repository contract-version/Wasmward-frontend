import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago } from '../src/format.js';

const NOW = 1_800_000_000_000;

test('no timestamp means it never happened', () => {
  assert.equal(ago(undefined, NOW), 'never');
});

test('under two seconds is "just now"', () => {
  assert.equal(ago(NOW, NOW), 'just now');
  assert.equal(ago(NOW - 1_000, NOW), 'just now');
  assert.equal(ago(NOW - 1_400, NOW), 'just now');
});

test('a clock that moved backwards, or a timestamp in the future, is "just now", never negative', () => {
  assert.equal(ago(NOW + 5_000, NOW), 'just now');
  assert.equal(ago(NOW + 3_600_000, NOW), 'just now');
});

test('a few seconds are counted in seconds, rounded to the nearest', () => {
  assert.equal(ago(NOW - 2_000, NOW), '2 seconds ago');
  assert.equal(ago(NOW - 1_600, NOW), '2 seconds ago');
  assert.equal(ago(NOW - 12_400, NOW), '12 seconds ago');
  assert.equal(ago(NOW - 40_000, NOW), '40 seconds ago');
});
