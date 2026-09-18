import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, resolveConfig } from '../../frontend/node_modules/vite/dist/node/index.js';
import { localOptions } from '../../frontend/local-dev.mjs';

test('local stylesheet transformation retains dark tokens and application utilities from repository-root launches', async () => {
  // Middleware mode transforms the real import graph without a listening port,
  // account/API requests, output files or changing the process working directory.
  const server = await createServer({ ...localOptions, server: { middlewareMode: true, hmr: false, watch: null } });
  try {
    const result = await server.transformRequest('/src/index.css');
    assert.ok(result?.code.includes('html.dark'), 'dark theme must survive Tailwind content scanning');
    assert.ok(result.code.includes('#1D2121'), 'compiled CSS must include the actual dark background');
    assert.ok(result.code.includes('.min-h-screen'), 'application utilities must not be purged by a different launch directory');
  } finally {
    await server.close();
  }
});

test('local Vite isolates dotenv and inherited client env, retaining fixed loopback proxies', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'cookbook-vite-isolation-'));
  const old = process.env.VITE_LOCAL_INHERITED_CANARY;
  try {
    await writeFile(join(fixture, '.env'), 'VITE_LOCAL_FILE_CANARY=synthetic-file-only\n');
    await writeFile(join(fixture, '.env.local'), 'VITE_LOCAL_PRIVATE_CANARY=synthetic-local-only\n');
    process.env.VITE_LOCAL_INHERITED_CANARY = 'synthetic-parent-only';
    const resolved = await resolveConfig({ ...localOptions, envDir: fixture }, 'serve');
    for (const key of ['VITE_LOCAL_INHERITED_CANARY', 'VITE_LOCAL_FILE_CANARY', 'VITE_LOCAL_PRIVATE_CANARY']) {
      assert.equal(resolved.env[key], undefined);
    }
    assert.equal(resolved.server.host, '127.0.0.1');
    assert.equal(resolved.server.port, 5173);
    assert.equal(resolved.server.strictPort, true);
    assert.equal(resolved.server.proxy['/api'].target, 'http://127.0.0.1:5100');
    assert.equal(resolved.server.proxy['/health'].target, 'http://127.0.0.1:5100');
  } finally {
    if (old === undefined) delete process.env.VITE_LOCAL_INHERITED_CANARY;
    else process.env.VITE_LOCAL_INHERITED_CANARY = old;
    await rm(fixture, { recursive: true }); // exact test-created directory only
  }
});
