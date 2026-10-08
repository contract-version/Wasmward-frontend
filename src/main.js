import { createVersionGuard, loadConfig } from '@wasmward/core';

// The Wasmward test contract on Stellar testnet, running its "v1" build.
const CONTRACT_ID = 'CBR5ZFDI2GBXG66DAEWWHSAK4NDLKSKHWVUEUSOM4UOBM66TI6DYPDPV';
const V1_HASH = 'a7a82511fa284650178b02fe3a4bafc587b95212f2f8ce647f2df5ef4cf42509';

// Which Wasm builds each pretend release of this app was tested against.
const PROFILES = {
  current: [{ wasmHash: V1_HASH, label: 'v1' }],
  older: [{ wasmHash: '0'.repeat(64), label: 'an earlier build' }],
};

const $ = (id) => document.getElementById(id);
const badge = $('badge');
const depositButton = $('deposit');
const hint = $('hint');

let guard;
let deposit;

function configFor(profile) {
  return loadConfig({
    version: 1,
    network: {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      passphrase: 'Test SDF Network ; September 2015',
    },
    pollIntervalMs: 10_000,
    contracts: { vault: { contractId: CONTRACT_ID, supported: PROFILES[profile] } },
  });
}

function log(text) {
  const item = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString();
  item.append(time, document.createTextNode(text));
  $('log').prepend(item);
}

function ago(timestamp) {
  if (timestamp === undefined) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  return seconds < 2 ? 'just now' : `${seconds} seconds ago`;
}

// Everything shown comes from the guard. Text is always set with textContent, never as HTML.
function render() {
  if (guard === undefined) return;
  const state = guard.status().vault;
  const writable = guard.isWritable('vault');

  badge.textContent = state.status;
  badge.className = `badge ${writable ? 'supported' : state.status === 'pending' ? 'waiting' : 'blocked'}`;
  $('hash').textContent = state.liveWasmHash ?? 'unknown';
  $('label').textContent = state.matchedLabel ?? 'none';
  $('checked').textContent = ago(state.lastSuccessAt);
  $('error').textContent = state.lastError ?? 'none';

  // The point of the example: the button follows the guard.
  depositButton.disabled = !writable;
  if (writable) {
    hint.textContent = 'The live code is one this app supports, so writes are allowed.';
  } else {
    try {
      guard.assertWritable('vault');
    } catch (error) {
      hint.textContent = error.message;
    }
  }
}

async function begin(profile) {
  if (guard !== undefined) await guard.stop();
  const next = createVersionGuard(configFor(profile));
  guard = next;
  deposit = next.guard('vault', async (amount) => `Pretended to send a transaction depositing ${amount}.`);

  badge.textContent = 'checking';
  badge.className = 'badge waiting';
  depositButton.disabled = true;
  hint.textContent = 'Checking which code the contract is running…';

  next.subscribe((change) => {
    log(`${change.name}: ${change.from} → ${change.to}`);
    render();
  });
  try {
    await next.start();
  } catch (error) {
    if (guard === next) {
      badge.textContent = 'cannot check';
      badge.className = 'badge blocked';
      hint.textContent = error.message;
      log(`Could not start: ${error.message}`);
    }
    return;
  }
  render();
}

depositButton.addEventListener('click', async () => {
  try {
    log(await deposit(10));
  } catch (error) {
    // WriteBlockedError explains exactly why the write was refused.
    log(error.message);
  }
});

$('profile').addEventListener('change', (event) => {
  log(`Switched to ${event.target.value === 'current' ? 'the current' : 'an older'} build of the app.`);
  void begin(event.target.value);
});

// Keep "last check" fresh between polls.
setInterval(render, 1000);
void begin('current');
