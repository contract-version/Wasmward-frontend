// The request handling of the local static file server, apart from listening on a port, so it can be tested.
// No dependencies. It serves index.html and the build output in dist/, and nothing else.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/**
 * The path a request asks for, decoded, or undefined when the request is malformed: not a path starting with
 * "/", a percent-escape that is not valid, or a null byte. (Decoding throws on a bad escape, and a throw inside
 * a request handler stops the whole server, so one odd URL must not get that far.) The query string is dropped.
 * The target is split by hand: `new URL('//x', base)` would read "x" as a host and "/" as the path.
 */
export function requestedPath(target) {
  if (typeof target !== 'string' || !target.startsWith('/')) return undefined;
  let path;
  try {
    path = decodeURIComponent(target.split(/[?#]/)[0]);
  } catch {
    return undefined;
  }
  return path.includes('\0') ? undefined : path;
}

export const DEFAULT_PORT = 5173;

/** The port to listen on from the text of PORT (undefined means "not set"). Throws an Error that says what is allowed. */
export function parsePort(text) {
  if (text === undefined) return DEFAULT_PORT;
  const port = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(port >= 1 && port <= 65_535)) throw new Error(`PORT must be a whole number from 1 to 65535, not '${text}'`);
  return port;
}

/**
 * Headers on every response, errors included. nosniff stops a browser from guessing a type other than the one
 * sent; no-referrer keeps the address of this page out of requests it makes; no-cache means a rebuilt bundle is
 * what the next reload shows (this is a development server).
 */
const COMMON_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-cache',
};

/** Sends a short plain-text answer. A HEAD request gets the headers and no body. */
function sendText(req, res, status, text, extra = {}) {
  const body = Buffer.from(text);
  res.writeHead(status, {
    ...COMMON_HEADERS,
    ...extra,
    'content-type': 'text/plain; charset=utf-8',
    'content-length': body.length,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/** An http.Server (not yet listening) that serves `root`/index.html and `root`/dist/. */
export function createStaticServer({ root }) {
  const base = resolve(root);
  return createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(req, res, 405, 'Method not allowed', { allow: 'GET, HEAD' });
      return;
    }
    const path = requestedPath(req.url);
    if (path === undefined) {
      sendText(req, res, 400, 'Bad request');
      return;
    }
    const file = resolve(join(base, normalize(path === '/' ? 'index.html' : path)));
    // Serve only index.html and the build output, never the rest of the project.
    const allowed = file === join(base, 'index.html') || file.startsWith(join(base, 'dist') + sep);
    if (!allowed || !existsSync(file) || !statSync(file).isFile()) {
      sendText(req, res, 404, 'Not found');
      return;
    }
    res.writeHead(200, {
      ...COMMON_HEADERS,
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'content-length': statSync(file).size,
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
}
