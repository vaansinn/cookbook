// Deliberate opt-in: never load personal dotenv or inherited VITE_* values.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

export const localOptions = {
  root: fileURLToPath(new URL('.', import.meta.url)),
  configFile: fileURLToPath(new URL('./vite.local.config.js', import.meta.url)),
  envFile: false,
};

export async function startLocalFrontend() {
  const server = await createServer(localOptions);
  await server.listen();
  server.printUrls();
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startLocalFrontend();
}
