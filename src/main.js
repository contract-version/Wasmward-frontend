import { createVersionGuard } from '@wasmward/core';
import { CONTRACT_ID, configFor, PROFILE_NAMES } from './demo-config.js';
import { describeExpiry } from './expiry.js';
import { ago } from './format.js';
import { explorerUrl } from './links.js';
import { CANNOT_CHECK, CHECKING, statusView } from './status-view.js';

const $ = (id) => document.getElementById(id);
$('explorer').href = explorerUrl(CONTRACT_ID);
$('explorer').hidden = false;
const badge = $('badge');
const depositButton = $('deposit');
const hint = $('hint');

let guard;
let deposit;

function showBadge({ text, tone }) {
  badge.textContent = text;
  badge.className = `badge ${tone}`;
}

function log(text) {
  const item = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString();
  item.append(time, document.createTextNode(text));
  $('log').prepend(item);
}

// Everything shown comes from the guard. Text is always set with textContent, never as HTML.
function render() {
  if (guard === undefined) return;
  const state = guard.status().vault;
  const writable = guard.isWritable('vault');

  // The effective status, which counts a check that is too old as stale: guard.status() would still say
  // "supported" while writes are already blocked.
  showBadge(statusView(guard.health().contracts.vault.status));
  $('hash').textContent = state.liveWasmHash ?? 'unknown';
  $('label').textContent = state.matchedLabel ?? 'none';
  $('checked').textContent = ago(state.lastSuccessAt, Date.now());

  // A contract expires unless someone extends it, and its instance and Wasm code expire separately.
  const expiry = describeExpiry(state);
  $('expiry').textContent = expiry.text;
  $('expiry').className = expiry.warn ? 'warn' : '';
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

// Each choice of build gets a number. Changing the selector quickly starts several of these at once, and
// only the newest may keep a guard: every older one must stop its own, or it would keep polling the RPC
// in the background for as long as the page is open.
let latestChoice = 0;

async function begin(profile) {
  const mine = ++latestChoice;
  const previous = guard;
  guard = undefined;
  deposit = undefined;
  depositButton.disabled = true;
  if (previous !== undefined) await previous.stop();
  if (mine !== latestChoice) return; // a newer choice arrived while the old guard was stopping

  const next = createVersionGuard(configFor(profile));
  guard = next;
  deposit = next.guard('vault', async (amount) => `Pretended to send a transaction depositing ${amount}.`);

  showBadge(CHECKING);
  hint.textContent = 'Checking which code the contract is running…';

  next.subscribe((change) => {
    if (guard !== next) return; // a guard that has been replaced must not touch the page
    log(`${change.name}: ${change.from} → ${change.to}`);
    render();
  });
  try {
    await next.start();
  } catch (error) {
    if (guard === next) {
      showBadge(CANNOT_CHECK);
      hint.textContent = error.message;
      log(`Could not start: ${error.message}`);
    }
    return;
  }
  if (guard !== next) {
    // Replaced while it was starting: make sure it is not left polling.
    await next.stop();
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
  log(`Switched to ${PROFILE_NAMES[event.target.value]} build of the app.`);
  void begin(event.target.value);
});

// Keep "last check" fresh between polls.
setInterval(render, 1000);
void begin('current');
