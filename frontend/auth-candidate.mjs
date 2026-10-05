// Explicit auth acceptance preview. Open http://localhost:5180 (not 127.0.0.1):
// cookies ignore ports, so this hostname isolates the working 127.0.0.1 app.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './vite.config.js';

const server = await createServer({
  ...base, root: fileURLToPath(new URL('.', import.meta.url)),
  configFile: false, envFile: false, envPrefix: [],
  define: { __COOKBOOK_SESSION_AUTH__: 'true' },
  server: { host: '127.0.0.1', port: 5180, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:5101', changeOrigin: true } } },
});
await server.listen();
console.log('Authentication candidate: http://localhost:5180 (disposable test data only)');
