import { readFileSync } from 'node:fs';
import { createApp } from '../../src/app.js';
import { CONTRACT_ID, configFor, PROFILE_NAMES } from '../../src/demo-config.js';
import { documentFromHtml } from './fake-dom.js';
import { fakeGuardFactory } from './fake-guard.js';

// Read from the working directory, which is the repository root under `pnpm test`. A path relative to this file
// would be wrong: the tests are bundled into dist-test/, which is not as deep as test/support/.
const html = readFileSync('index.html', 'utf8');

export const START = Date.parse('2026-10-09T12:00:00Z');

/**
 * The page's app on the real index.html, with a fake guard and a clock and timers the test controls.
 *   h.run(options)     starts the app; resolves when its first start() has finished
 *   h.guards           every guard the app made, in order (`h.guard` is the newest)
 *   h.el(id)           an element of the page
 *   h.text(id)         its text
 *   h.advance(ms)      moves the clock on
 *   h.tick()           runs what setInterval was given, as the timer would
 *   h.waits            the waits the app is in (newest last): { ms, resolve }
 *   h.elapse()         lets the oldest wait end, and lets the app carry on
 *   h.logLines()       the log, newest first, without the time of day
 *   h.choose(profile)  does what a person does in the selector
 *   h.hide() / h.show() the tab goes to the background / comes back, as the browser reports it
 */
export function harness({ setup = () => undefined, configFor: configForOverride = configFor } = {}) {
  const doc = documentFromHtml(html);
  const factory = fakeGuardFactory(setup);
  const timers = [];
  const waits = [];
  let time = START;
  const app = createApp({
    document: doc,
    createGuard: factory.createGuard,
    configFor: configForOverride,
    contractId: CONTRACT_ID,
    profileNames: PROFILE_NAMES,
    now: () => time,
    wait: (ms) => new Promise((resolve) => waits.push({ ms, resolve })),
  });

  const h = {
    doc,
    app,
    timers,
    waits,
    guards: factory.guards,
    get guard() {
      return factory.guards.at(-1);
    },
    el: (id) => doc.getElementById(id),
    text: (id) => doc.getElementById(id).textContent,
    run: (options = {}) => app.run({ setInterval: (fn, ms) => timers.push({ fn, ms }), ...options }),
    advance: (ms) => {
      time += ms;
    },
    tick: () => timers.forEach((timer) => timer.fn()),
    logLines: () => doc.getElementById('log').children.map((item) => item.childNodes.at(-1).textContent),
    async choose(profile) {
      const select = doc.getElementById('profile');
      select.value = profile;
      await select.dispatch('change');
    },
    async hide() {
      doc.visibilityState = 'hidden';
      await doc.dispatch('visibilitychange');
    },
    async show() {
      doc.visibilityState = 'visible';
      await doc.dispatch('visibilitychange');
    },
    /** Ends the oldest wait, as if its time had passed, and lets the app carry on. */
    async elapse() {
      waits.shift().resolve();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
    /** Lets promises that are already resolved run their continuations. */
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
  return h;
}
