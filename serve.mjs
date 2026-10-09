// A tiny static file server for trying the example locally. No dependencies.
import { createStaticServer, formatRequest, parsePort } from './static-server.mjs';

let port;
try {
  port = parsePort(process.env.PORT);
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}

// One line per request, so a 404 or a refused request is visible: "GET /dist/app.js 200 3ms".
const server = createStaticServer({ root: '.', log: (entry) => console.log(formatRequest(entry)) });

server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `error: port ${port} is already in use. Stop whatever is using it, or pick another port: PORT=5174 pnpm serve`
      : `error: ${error.message}`,
  );
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${port}`);
});
