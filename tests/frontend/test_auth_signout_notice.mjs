// node --test tests/frontend/test_auth_signout_notice.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

for (const transport of ['browser', 'native']) for (const language of ['en', 'de']) {
  test(`${transport}/${language}: partial logout-all reaches Login and survives only guest verification`, () => {
    const result = spawnSync(process.execPath, ['--experimental-loader', './tests/frontend/extensionlessLoader.mjs',
      './tests/frontend/auth_signout_notice_fixture.mjs', transport, language], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}
