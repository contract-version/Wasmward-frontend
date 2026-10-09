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

/** An http.Server (not yet listening) that serves `root`/index.html and `root`/dist/. */
export function createStaticServer({ root }) {
  const base = resolve(root);
  return createServer((req, res) => {
    const path = requestedPath(req.url);
    if (path === undefined) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Bad request');
      return;
    }
    const file = resolve(join(base, normalize(path === '/' ? 'index.html' : path)));
    // Serve only index.html and the build output, never the rest of the project.
    const allowed = file === join(base, 'index.html') || file.startsWith(join(base, 'dist') + sep);
    if (!allowed || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
}
