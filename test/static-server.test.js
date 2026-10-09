import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createStaticServer, requestedPath } from '../static-server.mjs';

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

test('a path that only starts like dist is not dist', async () => {
  assert.equal((await get('/dist-test/x.mjs')).status, 404);
  assert.equal((await get('/distant/app.js')).status, 404);
});

test('a malformed percent-escape is a 400 and the server keeps serving', async () => {
  for (const path of ['/%E0%A4%A', '/%', '/%zz', '/dist/%E0%A4%A/app.js', '/index.html%']) {
    const res = await get(path);
    assert.equal(res.status, 400, path);
    assert.equal(res.body, 'Bad request');
  }
  assert.equal((await get('/')).status, 200, 'the server stopped serving after a bad request');
});

test('a null byte, however it is written, is a 400', async () => {
  for (const path of ['/index.html%00.js', '/dist/app.js%00', '/%00']) {
    assert.equal((await get(path)).status, 400, path);
  }
});

test('a protocol-relative path is a file path, not a host: //x is not the index page', async () => {
  for (const path of ['//secret.txt', '//index.html', '//dist/app.js', '///package.json']) {
    const res = await get(path);
    assert.ok(!res.body.includes('OUTSIDE THE PROJECT') && !res.body.includes('secret-project'), path);
  }
  assert.equal((await get('//secret.txt')).status, 404);
  assert.equal((await get('//package.json')).status, 404);
});

test('a request target that is not a path is a 400', async () => {
  for (const path of ['*', 'http://example.org/index.html', 'index.html']) {
    assert.equal((await get(path)).status, 400, path);
  }
});

test('requestedPath decodes, drops the query and refuses what is malformed', () => {
  assert.equal(requestedPath('/a%20b?x=1#top'), '/a b');
  assert.equal(requestedPath('/'), '/');
  assert.equal(requestedPath('/dist/app.js?v=2'), '/dist/app.js');
  assert.equal(requestedPath('/%E0%A4%A'), undefined);
  assert.equal(requestedPath('/a%00b'), undefined);
  assert.equal(requestedPath('x'), undefined);
  assert.equal(requestedPath(undefined), undefined);
  assert.equal(requestedPath(''), undefined);
});

test('only GET and HEAD are allowed: anything else is a 405 that says what is', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await get('/index.html', { method });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.allow, 'GET, HEAD', method);
    assert.equal(res.body, 'Method not allowed', method);
  }
});

test('HEAD gives the headers of a GET and no body, for a file and for a miss', async () => {
  const get200 = await get('/dist/app.js');
  const head200 = await get('/dist/app.js', { method: 'HEAD' });
  assert.equal(head200.status, 200);
  assert.equal(head200.body, '');
  assert.equal(head200.headers['content-type'], get200.headers['content-type']);
  assert.equal(head200.headers['content-length'], String(Buffer.byteLength('console.log(1)')));
  const head404 = await get('/package.json', { method: 'HEAD' });
  assert.equal(head404.status, 404);
  assert.equal(head404.body, '');
});

test('every successful response says how long it is', async () => {
  for (const [path, body] of [['/', '<!doctype html><title>demo</title>'], ['/dist/app.js', 'console.log(1)'], ['/dist/blob.bin', 'bytes']]) {
    assert.equal((await get(path)).headers['content-length'], String(Buffer.byteLength(body)), path);
  }
});

test('every response, errors included, is marked nosniff, no-referrer and not cacheable', async () => {
  const responses = [await get('/'), await get('/dist/app.js'), await get('/package.json'), await get('/%E0%A4%A'), await get('/', { method: 'POST' })];
  for (const res of responses) {
    assert.equal(res.headers['x-content-type-options'], 'nosniff', String(res.status));
    assert.equal(res.headers['referrer-policy'], 'no-referrer', String(res.status));
    assert.equal(res.headers['cache-control'], 'no-cache', String(res.status));
  }
});
