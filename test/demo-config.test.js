import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadConfig } from '@wasmward/core';
import { CONTRACT_ID, configFor, PROFILE_NAMES, PROFILES, V1_HASH } from '../src/demo-config.js';

const wasmwardJson = JSON.parse(readFileSync(new URL('../wasmward.json', import.meta.url), 'utf8'));

test('the demo and wasmward.json describe the same contract, hash, network and supported list', () => {
  // wasmward.json is what the Wasmward GitHub Action checks in CI. If this drifts, the action would be
  // checking a different contract from the one the page watches, and still pass.
  const fromFile = loadConfig(wasmwardJson);
  const demo = configFor('current');
  assert.equal(demo.network.rpcUrl, fromFile.network.rpcUrl);
  assert.equal(demo.network.passphrase, fromFile.network.passphrase);
  assert.deepEqual(demo.contracts.vault, fromFile.contracts.vault);
  assert.equal(CONTRACT_ID, wasmwardJson.contracts.vault.contractId);
  assert.equal(V1_HASH, wasmwardJson.contracts.vault.supported[0].wasmHash);
});

test('the older profile watches the same contract but supports a build the contract is not running', () => {
  const current = configFor('current');
  const older = configFor('older');
  assert.equal(older.contracts.vault.contractId, current.contracts.vault.contractId);
  const hashes = older.contracts.vault.supported.map((version) => version.wasmHash);
  assert.ok(!hashes.includes(V1_HASH), 'the older build must not support what is live');
});

test('every profile makes a config that Wasmward accepts, and has a name for the log', () => {
  for (const profile of Object.keys(PROFILES)) {
    const config = configFor(profile);
    assert.equal(config.pollIntervalMs, 10_000);
    assert.equal(typeof PROFILE_NAMES[profile], 'string', profile);
  }
  assert.deepEqual(Object.keys(PROFILE_NAMES).sort(), Object.keys(PROFILES).sort());
});

test('a profile that does not exist is refused, including names inherited from Object', () => {
  for (const bad of ['missing', '', 'CURRENT', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined]) {
    assert.throws(() => configFor(bad), /unknown profile/, String(bad));
  }
});

test('every <option> in the page is a profile, and every profile has an option', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const options = [...html.matchAll(/<option\s+value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(options.sort(), Object.keys(PROFILES).sort());
});
