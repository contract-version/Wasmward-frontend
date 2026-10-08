// A tiny static file server for trying the example locally. No dependencies.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('.');
const port = Number(process.env.PORT ?? 5173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = resolve(join(root, normalize(path === '/' ? 'index.html' : path)));
  // Serve only index.html and the build output, never the rest of the project.
  const allowed = file === join(root, 'index.html') || file.startsWith(join(root, 'dist') + sep);
  if (!allowed || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${port}`);
});
