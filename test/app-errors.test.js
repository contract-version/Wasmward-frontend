import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness } from './support/app-harness.js';

// An error the page did not expect, from a bug or a library, used to leave a page that had quietly stopped
// working with nothing to say so. The page now shows it and says what to do.

async function running() {
  const h = harness();
  await h.run();
  return h;
}

test('the notice is hidden until something goes wrong', async () => {
  const h = await running();
  assert.equal(h.el('problem').hidden, true);
  assert.equal(h.text('problem'), '');
});

test('an uncaught error is shown, with the message and what to do', async () => {
  const h = await running();
  await h.events.dispatch('error', { error: new Error('boom'), message: 'Uncaught Error: boom' });
  assert.equal(h.el('problem').hidden, false);
  assert.equal(h.text('problem'), 'Something went wrong: boom. Reload the page to start again.');
});

test('an unhandled promise rejection is shown too', async () => {
  const h = await running();
  await h.events.dispatch('unhandledrejection', { reason: new Error('rejected') });
  assert.equal(h.el('problem').hidden, false);
  assert.equal(h.text('problem'), 'Something went wrong: rejected. Reload the page to start again.');
});

test('a thrown value that is not an Error is still described', async () => {
  const h = await running();
  await h.events.dispatch('unhandledrejection', { reason: 'just a string' });
  assert.equal(h.text('problem'), 'Something went wrong: just a string. Reload the page to start again.');
  await h.events.dispatch('unhandledrejection', { reason: undefined });
  assert.equal(h.text('problem'), 'Something went wrong: an unknown error. Reload the page to start again.');
  await h.events.dispatch('error', { message: 'Script error.' });
  assert.equal(h.text('problem'), 'Something went wrong: Script error. Reload the page to start again.');
});

test('the notice is text only: a message that looks like markup cannot add elements', async () => {
  const h = await running();
  await h.events.dispatch('error', { error: new Error('<img src=x onerror=alert(1)>') });
  assert.ok(h.text('problem').includes('<img src=x onerror=alert(1)>'));
  assert.equal(h.el('problem').children.length, 0);
});

test('every error is logged, but the notice shows the latest, so a flood does not pile up', async () => {
  const h = await running();
  await h.events.dispatch('error', { error: new Error('first') });
  await h.events.dispatch('error', { error: new Error('second') });
  assert.equal(h.text('problem'), 'Something went wrong: second. Reload the page to start again.');
  assert.deepEqual(h.logLines().slice(0, 2), ['Unexpected error: second', 'Unexpected error: first']);
});

test('the notice stays when the page refreshes itself, and when the contract changes', async () => {
  const h = await running();
  await h.events.dispatch('error', { error: new Error('boom') });
  h.advance(2000);
  h.tick();
  await h.guard.emit('pending', 'unsupported');
  assert.equal(h.el('problem').hidden, false);
  assert.match(h.text('problem'), /boom/);
});

test('an error before the app has started is still caught once it has', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.events.listeners.error?.length, 1);
  assert.equal(h.events.listeners.unhandledrejection?.length, 1);
});
