import { describeExpiry } from './expiry.js';
import { ago } from './format.js';
import { explorerUrl } from './links.js';
import { describeDelay, isPermanent, retryDelayMs } from './retry.js';
import { CANNOT_CHECK, CHECKING, PAUSED, statusView } from './status-view.js';

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
 *   wait         waits this many milliseconds, for the pause between retries
 *
 * Everything shown comes from the guard. Text is always set with textContent, never as HTML.
 */
export function createApp({
  document,
  createGuard,
  configFor,
  contractId,
  profileNames,
  now = Date.now,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const $ = (id) => document.getElementById(id);
  const badge = $('badge');
  const depositButton = $('deposit');
  const hint = $('hint');

  let guard;
  let deposit;
  // True while the current guard has not been able to start. The page then shows why (badge and hint), and the
  // once-a-second refresh must leave that alone: the guard exists but has checked nothing, so a normal render would
  // replace the explanation with "pending".
  let startProblem = false;
  // The build being watched, and whether checking is paused because the tab is in the background. A hidden tab
  // would otherwise poll the RPC every few seconds for as long as it stays open.
  let currentProfile;
  let paused = false;
  const hidden = () => document.visibilityState === 'hidden';

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
    if (guard === undefined || startProblem || hidden()) return;
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

  // Stops a guard that is no longer wanted. If it will not stop there is nothing more to do about it, but that
  // must not stop the page from moving on to the next one.
  async function discard(old) {
    try {
      await old.stop();
    } catch (error) {
      log(`Could not stop the previous check: ${error.message}`);
    }
  }

  async function begin(profile) {
    currentProfile = profile;
    paused = false;
    const mine = ++latestChoice;
    const previous = guard;
    guard = undefined;
    deposit = undefined;
    startProblem = false;
    depositButton.disabled = true;
    if (previous !== undefined) await discard(previous);
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
    // Starting can fail because the network is down for a moment, which a retry fixes, or because the RPC serves
    // another network, which it does not. A failed start can simply be asked again (the guard allows it).
    let retries = 0;
    for (;;) {
      try {
        await next.start();
        break;
      } catch (error) {
        if (guard !== next) return; // replaced meanwhile, and already stopped by whoever replaced it
        startProblem = true;
        showBadge(CANNOT_CHECK);
        if (isPermanent(error)) {
          hint.textContent = error.message;
          log(`Could not start: ${error.message}`);
          return;
        }
        retries += 1;
        const delay = retryDelayMs(retries);
        hint.textContent = `${error.message} (trying again in ${describeDelay(delay)})`;
        if (retries === 1) log(`Could not start: ${error.message} (will keep trying)`);
        await wait(delay);
        if (guard !== next) return;
      }
    }
    startProblem = false;
    if (retries > 0) log(`Connected after ${retries} ${retries === 1 ? 'retry' : 'retries'}.`);
    if (guard !== next) {
      // Replaced while it was starting: make sure it is not left polling.
      await discard(next);
      return;
    }
    render();
  }

  // Leaving the tab: stop the guard (so nothing polls in the background) and cancel any start or retry in progress.
  async function pause() {
    if (paused) return;
    paused = true;
    latestChoice += 1; // a begin() still running sees it has been replaced and gives up
    const previous = guard;
    guard = undefined;
    deposit = undefined;
    startProblem = false;
    depositButton.disabled = true;
    showBadge(PAUSED);
    hint.textContent = 'Checking is paused while this tab is hidden.';
    log('Checking paused: this tab is hidden.');
    if (previous !== undefined) await discard(previous);
  }

  async function resume() {
    if (!paused) return;
    log('Checking again: this tab is visible.');
    await begin(currentProfile);
  }

  function onVisibilityChange() {
    void (hidden() ? pause() : resume());
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
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Keep "last check" fresh between polls.
    setInterval(render, 1000);
    currentProfile = initialProfile;
    // A page opened in a background tab waits until it is shown before it starts checking.
    if (hidden()) return pause();
    return begin(initialProfile);
  }

  return { run, begin, render };
}
