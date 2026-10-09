import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createStaticServer, formatRequest } from '../static-server.mjs';

let dir;
let server;
let port;
const logged = [];

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'static-log-'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'index.html'), '<title>x</title>');
  writeFileSync(join(dir, 'dist', 'app.js'), 'console.log(1)');
  server = createStaticServer({ root: dir, log: (entry) => logged.push(entry) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Makes a request and returns what was logged for it, waiting for the log line, which comes when the response ends. */
async function logFor(path, method = 'GET') {
  const before = logged.length;
  await get(path, method);
  for (let i = 0; i < 50 && logged.length === before; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(logged.length, before + 1, `expected exactly one log entry for ${method} ${path}`);
  return logged.at(-1);
}

test('each request is logged once, with its method, path and status', async () => {
  assert.deepEqual({ ...(await logFor('/')), ms: undefined }, { method: 'GET', path: '/', status: 200, ms: undefined });
  assert.deepEqual({ ...(await logFor('/dist/app.js')), ms: undefined }, { method: 'GET', path: '/dist/app.js', status: 200, ms: undefined });
});

test('a miss, a refusal and a bad request are logged with their own status', async () => {
  assert.equal((await logFor('/package.json')).status, 404);
  assert.equal((await logFor('/', 'POST')).status, 405);
  assert.equal((await logFor('/%E0%A4%A')).status, 400);
});

test('HEAD requests are logged as HEAD', async () => {
  const entry = await logFor('/index.html', 'HEAD');
  assert.equal(entry.method, 'HEAD');
  assert.equal(entry.status, 200);
});

test('the query string is left out of the log: it can carry things that should not be written down', async () => {
  const entry = await logFor('/index.html?token=secret&x=1#frag');
  assert.equal(entry.path, '/index.html');
  assert.ok(!JSON.stringify(entry).includes('secret'));
});

test('a malformed path is logged as it was sent, since there is nothing better to say about it', async () => {
  assert.equal((await logFor('/%E0%A4%A')).path, '/%E0%A4%A');
});

test('the time taken is a whole number of milliseconds, not negative', async () => {
  const { ms } = await logFor('/');
  assert.ok(Number.isInteger(ms) && ms >= 0 && ms < 5000, String(ms));
});

test('a server made without a log works and logs nothing', async () => {
  const quiet = createStaticServer({ root: dir });
  await new Promise((resolve) => quiet.listen(0, '127.0.0.1', resolve));
  const status = await new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port: quiet.address().port, path: '/', method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject).end();
  });
  quiet.closeAllConnections();
  await new Promise((resolve) => quiet.close(resolve));
  assert.equal(status, 200);
});

test('formatRequest writes one readable line', () => {
  assert.equal(formatRequest({ method: 'GET', path: '/dist/app.js', status: 200, ms: 3 }), 'GET /dist/app.js 200 3ms');
  assert.equal(formatRequest({ method: 'POST', path: '/', status: 405, ms: 0 }), 'POST / 405 0ms');
});

test('formatRequest does not let a path with a newline in it forge a second log line', () => {
  const line = formatRequest({ method: 'GET', path: '/x\nGET /index.html 200 0ms', status: 404, ms: 1 });
  assert.ok(!line.includes('\n'));
  assert.equal(line, 'GET /x\\nGET /index.html 200 0ms 404 1ms');
});
