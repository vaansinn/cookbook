const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const en = require('../../frontend/src/locales/en.json');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5097';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) throw Error('Use a disposable localhost server');

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ baseURL, serviceWorkers: 'block', locale: 'en-US' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let failed = false;
    await page.route('**/api/recipe-snapshot', async route => {
      if (!failed) { failed = true; await route.abort(); } else await route.continue();
    });
    await page.goto('/dish/lentil-bolognese/cook?level=basic&lang=en');
    await page.getByText(en.snapshot_load_error).waitFor();
    const attempt = new URL(page.url()).searchParams.get('attempt');
    await page.getByRole('button', { name: en.error_retry }).click();
    await page.getByRole('button', { name: en.cook_next + ' →' }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('attempt'), attempt);
    await page.unroute('**/api/recipe-snapshot');
    const helpLabel = (await page.locator('button').allTextContents()).find(s => /Need help/.test(s));
    await page.getByRole('button', { name: helpLabel, exact: true }).click();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.getByRole('button', { name: helpLabel, exact: true }).evaluate(e => document.activeElement === e), true);
    await page.getByRole('button', { name: en.cook_start_over }).click();
    await page.getByRole('button', { name: en.cook_next + ' →' }).waitFor();
    assert.notEqual(new URL(page.url()).searchParams.get('attempt'), attempt);

    const account = await (await context.request.post('/api/auth/register', { data: { email: `recovery-${Date.now()}@example.test`, password: 'test-only-password-42' } })).json();
    await page.evaluate(token => localStorage.setItem('token', token), account.token);
    await page.goto('/dish/lentil-bolognese/cook?level=basic&lang=en');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: en.cook_next + ' →' }).click();
    await page.getByRole('button', { name: en.cook_finish, exact: true }).click();
    await page.getByLabel(en.reflection_outcome_label).selectOption('happy');
    await page.getByLabel(en.reflect_confidence_title).selectOption('comfortable');
    let firstPayload;
    let resolveLost;
    const lostResponse = new Promise(resolve => { resolveLost = resolve; });
    await page.route('**/api/reflections', async route => {
      firstPayload = route.request().postDataJSON();
      await route.fetch(); // commit succeeds, response is lost
      await route.abort();
      resolveLost();
    });
    await page.getByRole('button', { name: en.reflect_save, exact: true }).click();
    await lostResponse;
    await page.getByRole('button', { name: en.error_retry, exact: true }).waitFor();
    await page.unroute('**/api/reflections');
    await page.reload();
    await page.getByRole('button', { name: en.error_retry, exact: true }).waitFor();
    const sent = page.waitForRequest(req => req.url().endsWith('/api/reflections') && req.method() === 'POST');
    await page.getByRole('button', { name: en.error_retry, exact: true }).click();
    assert.deepEqual((await sent).postDataJSON(), firstPayload);
    await page.getByText(en.reflect_saved, { exact: true }).waitFor();
    const auth = { Authorization: `Bearer ${account.token}` };
    const exported = await (await context.request.get('/api/auth/me/export', { headers: auth })).json();
    assert.equal(exported.cook_reflections.length, 1);
    assert.equal(exported.cook_logs.length, 1);

    // A legacy browser record must be adopted, not captured using today's recipe.
    const legacyId = 'legacy-' + Date.now();
    await page.evaluate(({ userId, legacyId }) => {
      localStorage.setItem(`cook_session:account:${userId}`, JSON.stringify({ session_id: legacyId, dish_slug: 'lentil-bolognese', level: 'basic', lang: 'en', snapshot_id: null }));
    }, { userId: account.user.id, legacyId });
    await page.goto('/dish/lentil-bolognese/cook?level=basic&lang=en');
    await page.getByText(en.source_unknown).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('attempt'), legacyId);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: snapshot retry identity, modal keyboard/focus, Start over, ambiguous reflection refresh+retry, legacy unknown-source adoption');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
