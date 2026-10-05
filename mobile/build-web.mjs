import { build } from '../frontend/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
import base from '../frontend/vite.config.js';

const mobileRoot = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = fileURLToPath(new URL('../frontend/', import.meta.url));
const entry = fileURLToPath(new URL('./src/main.mjs', import.meta.url)).replaceAll('\\', '/');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--sessions') || args.length > 1) throw new Error('Supported build option: --sessions');
// Never ingest personal dotenv or inherited VITE_* variables into a distributable.
await build({
  ...base, root: frontendRoot, configFile: false, envFile: false, envPrefix: [],
  mode: 'production',
  define: { __COOKBOOK_SESSION_AUTH__: JSON.stringify(args.includes('--sessions')) },
  plugins: [...base.plugins, {
    name: 'bundled-android-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes('src="/src/main.jsx"')) throw new Error('Frontend entry changed; review the mobile build');
        return html.replace('src="/src/main.jsx"', `src="/@fs/${entry}"`);
      },
    },
  }],
  build: { outDir: mobileRoot + 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
