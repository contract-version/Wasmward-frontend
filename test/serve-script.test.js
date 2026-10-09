import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, parsePort } from '../static-server.mjs';

const SERVE = fileURLToPath(new URL('../serve.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('parsePort uses 5173 when PORT is not set, and accepts a whole number from 1 to 65535', () => {
  assert.equal(DEFAULT_PORT, 5173);
  assert.equal(parsePort(undefined), 5173);
  for (const [text, port] of [['1', 1], ['80', 80], ['5174', 5174], ['65535', 65_535], ['08080', 8080]]) {
    assert.equal(parsePort(text), port, text);
  }
});

test('parsePort refuses everything else, naming the value', () => {
  for (const bad of ['', 'abc', '0', '65536', '70000', '-1', '1.5', '8080x', ' 8080', '1e3', 'NaN']) {
    assert.throws(() => parsePort(bad), new RegExp(`PORT must be a whole number from 1 to 65535, not '${bad}'`), JSON.stringify(bad));
  }
});

/** Runs serve.mjs with this PORT and resolves { status, stdout, stderr }, killing it if it keeps running. */
function runServe(port) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVE], { cwd: ROOT, env: { ...process.env, PORT: port } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    // A server that started never exits on its own; give a failing one a moment to say so, then stop it.
    const timer = setTimeout(() => child.kill(), 3000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    child.on('error', () => undefined);
  });
}

test('serve.mjs says what is wrong with PORT and exits 1, instead of a stack trace', async () => {
  for (const bad of ['abc', '0', '70000']) {
    const result = await runServe(bad);
    assert.equal(result.status, 1, bad);
    assert.equal(result.stderr, `error: PORT must be a whole number from 1 to 65535, not '${bad}'\n`);
    assert.equal(result.stdout, '');
  }
});

test('serve.mjs says the port is busy, and how to pick another, and exits 1', async () => {
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const { port } = blocker.address();
  try {
    const result = await runServe(String(port));
    assert.equal(result.status, 1);
    assert.equal(result.stderr, `error: port ${port} is already in use. Stop whatever is using it, or pick another port: PORT=5174 pnpm serve\n`);
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});

test('serve.mjs starts on a free port and says where', async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  const started = await new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVE], { cwd: ROOT, env: { ...process.env, PORT: String(port) } });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes('\n')) {
        child.kill();
        resolve(stdout);
      }
    });
  });
  assert.equal(started, `Open http://127.0.0.1:${port}\n`);
});
