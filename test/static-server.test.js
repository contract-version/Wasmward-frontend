import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createStaticServer } from '../static-server.mjs';

// A throwaway project: the two things the server may serve, a pile of things it must not, and a secret file
// next to the project (outside it) that a path trick would reach.
let dir;
let server;
let port;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'static-server-'));
  const root = join(dir, 'project');
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'dist', 'nested'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'dist-test'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>demo</title>');
  writeFileSync(join(root, 'dist', 'app.js'), 'console.log(1)');
  writeFileSync(join(root, 'dist', 'app.js.map'), '{"version":3}');
  writeFileSync(join(root, 'dist', 'style.css'), 'body{}');
  writeFileSync(join(root, 'dist', 'blob.bin'), 'bytes');
  writeFileSync(join(root, 'dist', 'nested', 'deep.js'), 'deep');
  writeFileSync(join(root, 'package.json'), '{"name":"secret-project"}');
  writeFileSync(join(root, 'README.md'), 'readme');
  writeFileSync(join(root, '.env'), 'TOKEN=hunter2');
  writeFileSync(join(root, 'src', 'main.js'), 'source');
  writeFileSync(join(root, 'dist-test', 'x.mjs'), 'test build');
  writeFileSync(join(dir, 'secret.txt'), 'OUTSIDE THE PROJECT');
  server = createStaticServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

/** One request with the path exactly as given (fetch would tidy `..` away before sending it). */
function get(path, { method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves index.html at / and at /index.html', async () => {
  for (const path of ['/', '/index.html']) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(res.body, '<!doctype html><title>demo</title>');
  }
});

test('serves the build output with the right content types', async () => {
  const expected = {
    '/dist/app.js': ['text/javascript; charset=utf-8', 'console.log(1)'],
    '/dist/app.js.map': ['application/json; charset=utf-8', '{"version":3}'],
    '/dist/style.css': ['text/css; charset=utf-8', 'body{}'],
    '/dist/blob.bin': ['application/octet-stream', 'bytes'],
    '/dist/nested/deep.js': ['text/javascript; charset=utf-8', 'deep'],
  };
  for (const [path, [type, body]] of Object.entries(expected)) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers['content-type'], type, path);
    assert.equal(res.body, body, path);
  }
});

test('ignores a query string or fragment-like suffix', async () => {
  assert.equal((await get('/index.html?x=1')).status, 200);
  assert.equal((await get('/dist/app.js?v=2')).body, 'console.log(1)');
});

test('does not serve the rest of the project: source, config, secrets, tests', async () => {
  for (const path of ['/package.json', '/README.md', '/.env', '/src/main.js', '/dist-test/x.mjs', '/nothing-here', '/dist/missing.js']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.body, 'Not found', path);
    assert.doesNotMatch(res.body, /secret-project|hunter2|readme/);
  }
});

test('does not list or serve directories', async () => {
  for (const path of ['/dist', '/dist/', '/dist/nested', '/dist/nested/', '/src', '/src/']) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('path tricks cannot reach the secret file outside the project', async () => {
  const tricks = [
    '/../secret.txt',
    '/dist/../../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2E%2E/secret.txt',
    '/dist/%2e%2e/%2e%2e/secret.txt',
    '/dist/..%2f..%2fsecret.txt',
    '/..%2fsecret.txt',
    '/dist%5C..%5C..%5Csecret.txt',
    '/dist/..\\..\\secret.txt',
    '/dist/./../../secret.txt',
    '/dist/%2e%2e%2f%2e%2e%2fsecret.txt',
  ];
  for (const path of tricks) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.ok(!res.body.includes('OUTSIDE THE PROJECT'), `${path} reached the secret`);
  }
});

test('path tricks cannot reach other project files either', async () => {
  for (const path of ['/dist/../package.json', '/dist/../.env', '/dist/nested/../../README.md', '/dist/%2e%2e/src/main.js']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(res.body, /secret-project|hunter2|source|readme/);
  }
});

test('a null byte in the path is refused, not passed to the file system', async () => {
  for (const path of ['/index.html%00.js', '/dist/app.js%00', '/%00']) {
    const res = await get(path);
    assert.ok(res.status === 404 || res.status === 400, `${path} gave ${res.status}`);
  }
});

test('a path that only starts like dist is not dist', async () => {
  assert.equal((await get('/dist-test/x.mjs')).status, 404);
  assert.equal((await get('/distant/app.js')).status, 404);
});
