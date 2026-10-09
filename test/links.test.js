import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explorerUrl } from '../src/links.js';

const ID = 'CBR5ZFDI2GBXG66DAEWWHSAK4NDLKSKHWVUEUSOM4UOBM66TI6DYPDPV';

test('builds the testnet explorer link for a contract address', () => {
  assert.equal(explorerUrl(ID), `https://stellar.expert/explorer/testnet/contract/${ID}`);
});

test('refuses anything that is not a contract address, so nothing odd reaches an href', () => {
  for (const bad of [
    '',
    'GBR5ZFDI2GBXG66DAEWWHSAK4NDLKSKHWVUEUSOM4UOBM66TI6DYPDPV', // an account, not a contract
    ID.slice(1), // too short
    `${ID}A`, // too long
    ID.toLowerCase(),
    `${ID.slice(0, 50)}"><b>`,
    'javascript:alert(1)',
    undefined,
    null,
    42,
  ]) {
    assert.throws(() => explorerUrl(bad), /not a contract address/, String(bad));
  }
});
