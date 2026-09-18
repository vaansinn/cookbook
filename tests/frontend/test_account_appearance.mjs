import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadPlanningSnapshot } from '../../frontend/src/components/planning/planningModel.mjs';

let sequence = 0;
async function settings(saved = '{}', throws = false) {
  const values = new Map([['recipedrawer_settings', saved]]);
  const writes = [];
  globalThis.localStorage = { getItem: (key) => { if (throws) throw Error('blocked'); return values.get(key) || null; },
    setItem: (key, value) => { if (throws) throw Error('blocked'); writes.push([key, value]); values.set(key, value); } };
  const { default: store } = await import(`../../frontend/src/store/useSettingsStore.js?appearance=${++sequence}`);
  return { store, values, writes };
}

test('account SQL appearance never overwrites guest preferences and guests never inherit it', async () => {
  const { store, writes } = await settings('{"language":"de","darkMode":true}');
  store.getState().activateAppearanceOwner('A');
  assert.equal(store.getState().language, 'en');
  store.getState().acceptAccountAppearance('A', 2, { language: 'en', dark_mode: false });
  store.getState().setLanguage('de'); // Legacy direct device setter cannot mutate an account.
  assert.equal(store.getState().language, 'en');
  assert.equal(writes.length, 0);
  store.getState().activateAppearanceOwner(null);
  assert.equal(store.getState().language, 'de');
  assert.equal(store.getState().darkMode, true);
});

test('stale owners, older revisions and malformed SQL preference values are ignored', async () => {
  const { store } = await settings();
  store.getState().activateAppearanceOwner('A');
  store.getState().acceptAccountAppearance('A', 5, { language: 'de', dark_mode: true });
  store.getState().acceptAccountAppearance('A', 4, { language: 'en', dark_mode: false });
  assert.equal(store.getState().language, 'de');
  store.getState().activateAppearanceOwner('B');
  store.getState().acceptAccountAppearance('A', 6, { language: 'de', dark_mode: true });
  store.getState().acceptAccountAppearance('B', 1, { language: 'fr', dark_mode: true });
  assert.equal(store.getState().language, 'en');
  assert.equal(store.getState().appearanceRevision, -1);
  store.getState().acceptAccountAppearance('B', 0, { language: 'de', dark_mode: false });
  assert.equal(store.getState().language, 'de');
});

test('guest storage is validated, bounded to known fields and failures do not crash controls', async () => {
  let fixture = await settings('{"language":"fr","darkMode":"yes","appearanceOwner":"forged"}');
  assert.equal(fixture.store.getState().appearanceOwner, null);
  assert.equal(fixture.store.getState().darkMode, false);
  fixture.store.getState().setLanguage('de');
  assert.deepEqual(JSON.parse(fixture.writes[0][1]), { darkMode: false, language: 'de' });
  fixture = await settings('', true);
  assert.doesNotThrow(() => fixture.store.getState().setDarkMode(true));
  assert.equal(fixture.store.getState().storageError, true);
});

test('appearance-only loading reads no plans, dishes, shopping, browser state or personal imports', async () => {
  const calls = [];
  const expected = { revision: 3, preference_revision: 2, preferences: { language: 'de', dark_mode: true } };
  const snapshot = await loadPlanningSnapshot({ read: async (path) => { calls.push(path); return expected; },
    loadCollection: () => { throw Error('unneeded personal collection'); } }, { area: 'preferences' });
  assert.deepEqual(calls, ['/preferences']); assert.deepEqual(snapshot, expected);
});

test('shared controls route signed-in changes through guarded account adapter, with no automatic retry', () => {
  const read = (file) => readFileSync(new URL(`../../frontend/src/${file}`, import.meta.url), 'utf8');
  const provider = read('components/AccountAppearanceProvider.jsx');
  assert.match(provider, /useAuthStore.subscribe/);
  assert.match(provider, /sessionKey\(useAuthStore.getState\(\)\) === owner/);
  assert.match(provider, /api.run\('preferences.update'/);
  assert.match(provider, /expected_revision: api.snapshot.preference_revision/);
  assert.match(provider, /if \(!api.canEdit\)/);
  assert.doesNotMatch(provider, /localStorage|setInterval|\.retry\(/);
  for (const file of ['components/LangSwitch.jsx', 'components/ThemeSwitch.jsx']) assert.match(read(file), /account.change/);
});
