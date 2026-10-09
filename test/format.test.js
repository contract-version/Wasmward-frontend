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

test('from a minute on it counts minutes, with the singular for one', () => {
  assert.equal(ago(NOW - 59_000, NOW), '59 seconds ago');
  assert.equal(ago(NOW - 60_000, NOW), '1 minute ago');
  assert.equal(ago(NOW - 119_000, NOW), '1 minute ago');
  assert.equal(ago(NOW - 120_000, NOW), '2 minutes ago');
  assert.equal(ago(NOW - 59 * 60_000, NOW), '59 minutes ago');
});

test('59.6 seconds is a minute, not "60 seconds"', () => {
  assert.equal(ago(NOW - 59_600, NOW), '1 minute ago');
});

test('then hours and days, each with its singular', () => {
  assert.equal(ago(NOW - 3_600_000, NOW), '1 hour ago');
  assert.equal(ago(NOW - 7_199_000, NOW), '1 hour ago');
  assert.equal(ago(NOW - 7_200_000, NOW), '2 hours ago');
  assert.equal(ago(NOW - 23 * 3_600_000, NOW), '23 hours ago');
  assert.equal(ago(NOW - 24 * 3_600_000, NOW), '1 day ago');
  assert.equal(ago(NOW - 3 * 24 * 3_600_000, NOW), '3 days ago');
});
