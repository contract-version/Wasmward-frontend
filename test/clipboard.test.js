import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyText } from '../src/clipboard.js';

const HASH = 'a7a82511fa284650178b02fe3a4bafc587b95212f2f8ce647f2df5ef4cf42509';

/** A clipboard that remembers what was written, or fails with this error. */
function clipboard({ fail } = {}) {
  const written = [];
  return {
    written,
    async writeText(text) {
      if (fail !== undefined) throw fail;
      written.push(text);
    },
  };
}

test('copies the text and says so', async () => {
  const board = clipboard();
  assert.deepEqual(await copyText(HASH, board), { ok: true, message: 'Copied.' });
  assert.deepEqual(board.written, [HASH]);
});

test('copies exactly what it was given, whole, however long', async () => {
  const board = clipboard();
  await copyText('x'.repeat(10_000), board);
  assert.equal(board.written[0].length, 10_000);
});

test('a refused write is reported with the reason, not thrown', async () => {
  const board = clipboard({ fail: new DOMException('Write permission denied.', 'NotAllowedError') });
  assert.deepEqual(await copyText(HASH, board), { ok: false, message: 'Could not copy: Write permission denied.' });
});

test('a rejection that is not an Error is still reported', async () => {
  const board = { writeText: () => Promise.reject('denied') };
  assert.deepEqual(await copyText(HASH, board), { ok: false, message: 'Could not copy: denied' });
});

test('a write that throws at once, instead of rejecting later, is reported too', async () => {
  const board = {
    writeText() {
      throw new Error('synchronous failure');
    },
  };
  assert.deepEqual(await copyText(HASH, board), { ok: false, message: 'Could not copy: synchronous failure' });
});

test('a browser with no clipboard, or one without writeText, is told so', async () => {
  for (const missing of [undefined, null, {}, { writeText: 'not a function' }]) {
    assert.deepEqual(await copyText(HASH, missing), { ok: false, message: 'Copying is not available in this browser.' }, String(missing));
  }
});

test('nothing is copied when there is nothing to copy', async () => {
  const board = clipboard();
  for (const empty of [undefined, null, '', 42, {}]) {
    assert.deepEqual(await copyText(empty, board), { ok: false, message: 'Nothing to copy.' }, String(empty));
  }
  assert.deepEqual(board.written, []);
});
