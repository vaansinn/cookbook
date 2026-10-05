import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { transformSync } = require('esbuild');
const source = readFileSync(new URL('../../frontend/src/main.jsx', import.meta.url), 'utf8');

for (const [label, prod, explicit, nativeReady, expected] of [
  ['normal development preserves legacy', false, undefined, false, 0],
  ['production matches strict backend', true, undefined, false, 1],
  ['candidate explicitly enables sessions', false, true, false, 1],
  ['old mobile build explicitly remains legacy', true, false, false, 0],
  ['native session runtime is never replaced', true, true, true, 0],
]) {
  test(label, () => {
    const calls = [];
    const define = { 'import.meta.env.PROD': JSON.stringify(prod) };
    if (explicit !== undefined) define.__COOKBOOK_SESSION_AUTH__ = JSON.stringify(explicit);
    const { code } = transformSync(source, { loader: 'jsx', format: 'cjs', define });
    const deps = {
      react: { StrictMode: 'strict', createElement: () => null },
      'react-dom/client': { createRoot: () => ({ render() {} }) },
      './App.jsx': { default: () => null }, './index.css': {},
      './api/runtimeFetch.mjs': {
        configureSessionRuntime: (options) => calls.push(options.transport),
        getSessionRuntime: () => nativeReady ? { transport: 'native' } : null,
      },
    };
    vm.runInNewContext(code, { require: (name) => {
      assert.ok(name in deps, `Unexpected entry dependency: ${name}`);
      return deps[name];
    }, document: { getElementById: () => ({}) }, navigator: {}, window: {}, exports: {} });
    assert.deepEqual(calls, expected ? ['browser'] : []);
  });
}
