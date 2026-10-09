import { describeExpiry } from './expiry.js';
import { ago } from './format.js';
import { explorerUrl } from './links.js';
import { CANNOT_CHECK, CHECKING, statusView } from './status-view.js';

/** The most entries the "Changes" log keeps. A page can stay open for days; older entries are dropped. */
export const LOG_LIMIT = 100;

/**
 * The page's behaviour, with everything it touches passed in so it can be tested without a browser:
 *   document     the page (or a stand-in with the same few methods)
 *   createGuard  makes a Wasmward guard from a config (`createVersionGuard` in the page)
 *   configFor    the config for one of the pretend releases of this app
 *   contractId   the contract being watched, for the explorer link
 *   profileNames how each release is named in the log
 *   now          the clock, in milliseconds since the epoch
 *
 * Everything shown comes from the guard. Text is always set with textContent, never as HTML.
 */
export function createApp({ document, createGuard, configFor, contractId, profileNames, now = Date.now }) {
  const $ = (id) => document.getElementById(id);
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
    time.textContent = new Date(now()).toLocaleTimeString();
    item.append(time, document.createTextNode(text));
    const list = $('log');
    list.prepend(item);
    while (list.children.length > LOG_LIMIT) list.lastElementChild.remove();
  }

  function render() {
    if (guard === undefined) return;
    const state = guard.status().vault;
    const writable = guard.isWritable('vault');

    // The effective status, which counts a check that is too old as stale: guard.status() would still say
    // "supported" while writes are already blocked.
    showBadge(statusView(guard.health().contracts.vault.status));
    $('hash').textContent = state.liveWasmHash ?? 'unknown';
    $('label').textContent = state.matchedLabel ?? 'none';
    $('checked').textContent = ago(state.lastSuccessAt, now());

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

    let next;
    try {
      next = createGuard(configFor(profile));
    } catch (error) {
      // Nothing to watch with: say so, rather than leave a page that has quietly stopped working.
      showBadge(CANNOT_CHECK);
      hint.textContent = error.message;
      log(`Could not start: ${error.message}`);
      return;
    }
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

  async function onDeposit() {
    if (deposit === undefined) {
      // Between one choice of build and the next there is no guard to send a write through.
      log('Not ready yet: the contract has not been checked.');
      return;
    }
    try {
      log(await deposit(10));
    } catch (error) {
      // WriteBlockedError explains exactly why the write was refused.
      log(error.message);
    }
  }

  function onProfileChange(event) {
    const profile = event.target.value;
    // Object.hasOwn, not `in`: "constructor" and "__proto__" are not builds.
    if (!Object.hasOwn(profileNames, profile)) {
      log(`Ignored a choice of build the page does not know: '${profile}'`);
      return;
    }
    log(`Switched to ${profileNames[profile]} build of the app.`);
    void begin(profile);
  }

  /** Connects the page: the explorer link, the button, the selector, and a once-a-second refresh. Starts checking. */
  function run({ setInterval = globalThis.setInterval, initialProfile = 'current' } = {}) {
    $('explorer').href = explorerUrl(contractId);
    $('explorer').hidden = false;
    depositButton.addEventListener('click', onDeposit);
    $('profile').addEventListener('change', onProfileChange);
    // Keep "last check" fresh between polls.
    setInterval(render, 1000);
    return begin(initialProfile);
  }

  return { run, begin, render };
}
