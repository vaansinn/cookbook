import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../frontend/${path}`, import.meta.url), 'utf8');
test('account copy describes current saved records without scores or unapproved privacy promises', () => {
  for (const lang of ['en','de']) {
    const copy=JSON.parse(read(`src/locales/${lang}.json`));
    const text=[copy.settings_export_desc,copy.privacy_body_1,copy.privacy_body_2].join(' ');
    assert.doesNotMatch(text,/\bXP\b|streak|badges|Abzeichen|nothing is sold|nichts wird verkauft/i);
    assert.match(copy.privacy_draft,/Local development|lokale Entwicklung/);
    assert.match(copy.settings_delete_desc,/Shared legacy|Geteilte bisherige/);
    assert.match(copy.settings_export_desc,/templates|Vorlagen/);
  }
  assert.match(read('src/pages/PrivacyPage.jsx'),/t\("privacy_draft"\)/);
  assert.doesNotMatch(read('public/manifest.json'),/level up|shared grocery/);
});

test('install metadata preserves route scope, permits either orientation and supplies real icon dimensions', () => {
  const manifest=JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.scope,'/'); assert.equal(manifest.start_url,'/');
  assert.equal(manifest.orientation,'any'); assert.equal(manifest.display,'standalone');
  for (const icon of manifest.icons) {
    const bytes=readFileSync(new URL(`../../frontend/public${icon.src}`,import.meta.url));
    assert.equal(bytes.subarray(1,4).toString(),'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
  }
});
