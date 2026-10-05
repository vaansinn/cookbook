import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const ready = existsSync(new URL('dist/index.html', root));
test('built assets contain production entry and no development server dependency', { skip: !ready }, () => {
  const html = readFileSync(new URL('dist/index.html', root), 'utf8');
  assert.match(html, /\/assets\/[^" ]+\.js/);
  assert.doesNotMatch(html, /@vite\/client|\/src\/main\.jsx|\/\@fs\/|5173/);
  const assets = readdirSync(new URL('dist/assets/', root));
  assert.ok(assets.some(name => name.endsWith('.css')));
  assert.ok(assets.some(name => name.endsWith('.js')));
  assert.ok(!assets.some(name => name.endsWith('.map')));
  const code = assets.filter(name => name.endsWith('.js')).map(name => readFileSync(new URL('dist/assets/' + name, root), 'utf8')).join('\n');
  assert.ok(code.includes('http://127.0.0.1:5100'));
  assert.doesNotMatch(code, /http:\/\/127\.0\.0\.1:5173|MOBILE_BUILD_ENV_SENTINEL/);
});
test('Capacitor copied exactly the built shell and disabled server URL', { skip: !ready }, () => {
  const config = JSON.parse(readFileSync(new URL('android/app/src/main/assets/capacitor.config.json', root)));
  assert.equal(config.server.url, undefined);
  assert.equal(config.appId, 'com.cookbook.bundleddev');
  assert.deepEqual(readFileSync(new URL('dist/index.html', root)), readFileSync(new URL('android/app/src/main/assets/public/index.html', root)));
  for (const name of readdirSync(new URL('dist/assets/', root))) {
    assert.deepEqual(readFileSync(new URL('dist/assets/' + name, root)), readFileSync(new URL('android/app/src/main/assets/public/assets/' + name, root)));
  }
});
