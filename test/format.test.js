import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, describeNetwork, describeSupported, shortHash } from '../src/format.js';

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


test('a known network passphrase is named, with the host of the RPC', () => {
  assert.equal(describeNetwork('Test SDF Network ; September 2015', 'https://soroban-testnet.stellar.org'), 'Stellar testnet (soroban-testnet.stellar.org)');
  assert.equal(describeNetwork('Public Global Stellar Network ; September 2015', 'https://rpc.example.org/path'), 'Stellar mainnet (rpc.example.org)');
  assert.equal(describeNetwork('Test SDF Future Network ; October 2022', 'https://rpc-futurenet.stellar.org'), 'Stellar futurenet (rpc-futurenet.stellar.org)');
});

test('an unknown passphrase is shown as it is, in quotes, not guessed at', () => {
  assert.equal(describeNetwork('My Private Net ; 2026', 'http://localhost:8000/rpc'), 'a network called "My Private Net ; 2026" (localhost:8000)');
});

test('only the host of the RPC is shown: never a path, a query or credentials, which can carry an API key', () => {
  const shown = describeNetwork('Test SDF Network ; September 2015', 'https://user:secret@rpc.example.org:8443/v1/KEY123?token=abc#frag');
  assert.equal(shown, 'Stellar testnet (rpc.example.org:8443)');
  for (const leaked of ['secret', 'KEY123', 'token', 'user', 'frag']) assert.ok(!shown.includes(leaked), leaked);
});

test('an RPC address that cannot be read is left out rather than shown raw', () => {
  assert.equal(describeNetwork('Test SDF Network ; September 2015', 'not a url'), 'Stellar testnet');
  assert.equal(describeNetwork('Test SDF Network ; September 2015', ''), 'Stellar testnet');
});

const HASH = 'a7a82511fa284650178b02fe3a4bafc587b95212f2f8ce647f2df5ef4cf42509';

test('a long hash is shortened to its first and last 8 characters, so it can be recognised', () => {
  assert.equal(shortHash(HASH), 'a7a82511…4cf42509');
  assert.equal(shortHash('0'.repeat(64)), '00000000…00000000');
});

test('a short value is left whole, and nothing that is not text is turned into text', () => {
  assert.equal(shortHash('abc'), 'abc');
  assert.equal(shortHash('a'.repeat(17)), `${'a'.repeat(8)}…${'a'.repeat(8)}`);
  assert.equal(shortHash('a'.repeat(16)), 'a'.repeat(16), 'at 16 characters, shortening would hide nothing');
  assert.equal(shortHash(undefined), '');
  assert.equal(shortHash(null), '');
  assert.equal(shortHash(42), '');
});

test('describeSupported lists each supported build, and marks the one that is live', () => {
  const list = [{ wasmHash: HASH, label: 'v1' }, { wasmHash: 'b'.repeat(64), label: 'v2' }];
  assert.deepEqual(describeSupported(list, HASH), [
    { label: 'v1', hash: HASH, short: 'a7a82511…4cf42509', live: true },
    { label: 'v2', hash: 'b'.repeat(64), short: 'bbbbbbbb…bbbbbbbb', live: false },
  ]);
});

test('with no live hash known, or one that matches nothing, no build is marked live', () => {
  const list = [{ wasmHash: HASH, label: 'v1' }];
  assert.deepEqual(describeSupported(list, undefined).map((row) => row.live), [false]);
  assert.deepEqual(describeSupported(list, 'c'.repeat(64)).map((row) => row.live), [false]);
});

test('a build without a label is called "unlabelled", and an empty list gives no rows', () => {
  assert.equal(describeSupported([{ wasmHash: HASH }], HASH)[0].label, 'unlabelled');
  assert.deepEqual(describeSupported([], HASH), []);
  assert.deepEqual(describeSupported(undefined, HASH), []);
});
