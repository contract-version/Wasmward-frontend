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

/** An http.Server (not yet listening) that serves `root`/index.html and `root`/dist/. */
export function createStaticServer({ root }) {
  const base = resolve(root);
  return createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
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
