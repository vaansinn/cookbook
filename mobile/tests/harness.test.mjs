import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('pinned development-only identity, origin and dependencies', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(config.appId, 'com.cookbook.bundleddev');
  assert.equal(config.appName, 'Cookbook Bundled Dev');
  assert.equal(config.webDir, 'dist');
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.androidScheme, 'https');
  assert.equal(config.server.hostname, 'localhost');
  assert.equal(config.server.cleartext, undefined);
  assert.equal(config.plugins?.CapacitorHttp?.enabled, undefined);
  assert.equal(config.server.allowNavigation, undefined);
  assert.deepEqual(config.includePlugins, []);
  for (const version of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) assert.equal(version, '8.5.2');
});
test('store release variants are disabled', () => {
  assert.match(read('android/app/build.gradle'), /beforeVariants\(selector\(\)\.withBuildType\("release"\)\)[\s\S]*?variant.enable = false/);
});
test('cleartext exception is only device loopback and backups are disabled', () => {
  const network = read('android/app/src/main/res/xml/network_security_config.xml');
  assert.match(network, /base-config cleartextTrafficPermitted="false"/);
  assert.deepEqual([...network.matchAll(/<domain includeSubdomains="false">([^<]+)<\/domain>/g)].map(m => m[1]), ['127.0.0.1']);
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/);
  assert.deepEqual([...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(m => m[1]), ['android.permission.INTERNET']);
});
test('web loopback proxy stays unchanged; native transport starts before app', () => {
  const config = read('../frontend/vite.local.config.js');
  assert.match(config, /host: '127.0.0.1'/);
  assert.match(config, /strictPort: true/);
  assert.match(config, /127.0.0.1:5100/);
  const entry = read('../frontend/src/main.jsx');
  assert.match(entry, /!window.Capacitor\?\.isNativePlatform\?\.\(\)/);
  assert.doesNotMatch(entry, /unregister\(|caches\.delete|localStorage\.clear/);
  const nativeEntry = read('src/main.mjs');
  assert.ok(nativeEntry.indexOf('installNativeApiFetch(nativeFetch)') < nativeEntry.indexOf("await import('../../frontend/src/main.jsx')"));
});
test('mobile build rejects inherited environment and never overwrites Flask assets', () => {
  const build = read('build-web.mjs');
  assert.match(build, /configFile: false, envFile: false, envPrefix: \[\]/);
  assert.match(build, /outDir: mobileRoot \+ 'dist'/);
  assert.match(read('build-local.ps1'), /build-web.mjs[\s\S]*capacitor sync android/);
});
