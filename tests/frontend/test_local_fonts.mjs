import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../frontend/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const fonts = {
  'bricolage-grotesque-variable.ttf': '413e7357809ddd12fd80a96a8a396de0e401638d4acd3cb3e37532f0472ac682',
  'plus-jakarta-sans-italic-variable.ttf': '9529eb888668b6a3c6dd75b6341a2fc5263fb6c9e788822e6117c29dd9e8b115',
  'plus-jakarta-sans-variable.ttf': '89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8',
};
test('bundled fonts match reviewed upstream binaries with retained family licenses', () => {
  for (const [file, hash] of Object.entries(fonts)) {
    const bytes = read(`public/fonts/${file}`);
    assert.equal(bytes.readUInt32BE(0), 0x00010000, 'TrueType signature');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  }
  for (const family of ['Bricolage-Grotesque', 'Plus-Jakarta-Sans']) {
    const license = read(`public/fonts/OFL-${family}.txt`).toString();
    assert.match(license, /Copyright/); assert.match(license, /SIL OPEN FONT LICENSE Version 1.1/);
  }
});
test('production typography loads same-origin assets, with swap and platform fallbacks', () => {
  assert.doesNotMatch(read('index.html').toString(), /fonts\.googleapis|fonts\.gstatic|preconnect/);
  const css = read('src/index.css').toString();
  for (const file of Object.keys(fonts)) assert.ok(css.includes(`/fonts/${file}`));
  assert.equal((css.match(/font-display: swap/g) || []).length, 3);
  assert.match(read('tailwind.config.js').toString(), /display: \["Bricolage Grotesque", "system-ui"/);
});
