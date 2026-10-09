// A tiny static file server for trying the example locally. No dependencies.
import { createStaticServer } from './static-server.mjs';

const port = Number(process.env.PORT ?? 5173);

createStaticServer({ root: '.' }).listen(port, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${port}`);
});
