import { loadConfig } from '@wasmward/core';

// The Wasmward test contract on Stellar testnet, running its "v1" build. `wasmward.json` describes the same
// contract for the Wasmward GitHub Action, and a test keeps the two in step.
export const CONTRACT_ID = 'CBR5ZFDI2GBXG66DAEWWHSAK4NDLKSKHWVUEUSOM4UOBM66TI6DYPDPV';
export const V1_HASH = 'a7a82511fa284650178b02fe3a4bafc587b95212f2f8ce647f2df5ef4cf42509';

export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const PASSPHRASE = 'Test SDF Network ; September 2015';

// Which Wasm builds each pretend release of this app was tested against.
export const PROFILES = {
  current: [{ wasmHash: V1_HASH, label: 'v1' }],
  older: [{ wasmHash: '0'.repeat(64), label: 'an earlier build' }],
};

/** How each profile is named in the log: "Switched to the current build of the app." */
export const PROFILE_NAMES = { current: 'the current', older: 'an older' };

/** The validated Wasmward config for one of the pretend releases. Throws for a profile that does not exist. */
export function configFor(profile) {
  // Object.hasOwn, not `in`: "constructor" and "__proto__" are not profiles.
  if (!Object.hasOwn(PROFILES, profile)) throw new Error(`unknown profile '${profile}'`);
  return loadConfig({
    version: 1,
    network: { rpcUrl: RPC_URL, passphrase: PASSPHRASE },
    pollIntervalMs: 10_000,
    contracts: { vault: { contractId: CONTRACT_ID, supported: PROFILES[profile] } },
  });
}
