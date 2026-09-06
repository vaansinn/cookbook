const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const en = require('../../frontend/src/locales/en.json');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5097';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) throw Error('Use a disposable localhost server');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ baseURL, serviceWorkers: 'block', locale: 'en-US' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const arrived = deferred(), release = deferred(), finished = deferred();
    await page.route('**/api/recipe-snapshot', async route => {
      if (route.request().postDataJSON().dish_slug !== 'lentil-bolognese') return route.continue();
      const response = await route.fetch();
      arrived.resolve(); await release.promise;
      try { await route.fulfill({ response }); } catch { /* the old read was aborted */ }
      finished.resolve();
    });
    await page.goto('/dish/lentil-bolognese/cook?level=basic&lang=en');
    await arrived.promise;
    await page.evaluate(() => { history.pushState({}, '', '/dish/banana-bread/cook?level=basic&lang=en'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('button', { name: en.cook_next + ' →' }).waitFor().catch(async e => { console.log('After dish switch:', page.url(), await page.locator('body').innerText()); throw e; });
    const before = await page.locator('body').innerText();
    release.resolve(); await finished.promise;
    assert.equal(await page.locator('body').innerText(), before, 'Old recipe response clobbered the new attempt');
    await page.unroute('**/api/recipe-snapshot');

    const password = 'test-only-password-42';
    const create = async suffix => {
      const email = `isolation-${suffix}-${Date.now()}@example.test`;
      const account = await (await context.request.post('/api/auth/register', { data: { email, password } })).json();
      return { ...account, email };
    };
    const a = await create('a'), b = await create('b');
    await page.evaluate(token => localStorage.setItem('token', token), a.token);
    await page.goto('/dish/lentil-bolognese/cook?level=basic&lang=en');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: en.cook_next + ' →' }).click();
    await page.getByRole('button', { name: en.cook_finish, exact: true }).click();
    await page.getByLabel(en.reflection_outcome_label).selectOption('happy');
    const saved = deferred(), releaseSave = deferred(), saveFinished = deferred();
    await page.route('**/api/reflections', async route => {
      const response = await route.fetch();
      saved.resolve(); await releaseSave.promise;
      try { await route.fulfill({ response }); } catch { /* obsolete caller */ }
      saveFinished.resolve();
    });
    await page.getByRole('button', { name: en.reflect_save, exact: true }).click();
    await saved.promise;
    // Real SPA login changes the auth-store epoch, not just localStorage.
    await page.evaluate(() => { history.pushState({}, '', '/login'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByPlaceholder(en.auth_email).fill(b.email);
    await page.getByPlaceholder(en.auth_password).fill(password);
    await page.getByRole('button', { name: en.auth_login_button, exact: true }).click();
    await page.waitForURL(baseURL + '/');
    await page.evaluate(() => { history.pushState({}, '', '/dish/lentil-bolognese/cook?level=basic&lang=en'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('button', { name: en.cook_next + ' →' }).waitFor();
    const bAttempt = new URL(page.url()).searchParams.get('attempt');
    releaseSave.resolve(); await saveFinished.promise;
    await page.unroute('**/api/reflections');
    assert.equal(new URL(page.url()).searchParams.get('attempt'), bAttempt);
    await page.getByRole('button', { name: en.cook_next + ' →' }).waitFor();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert.equal(keys.some(k => k.startsWith(`cook_session:account:${a.user.id}:`)), false);
    const exportB = await (await context.request.get('/api/auth/me/export', { headers: { Authorization: `Bearer ${b.token}` } })).json();
    assert.equal(exportB.cook_logs.length, 0);
    assert.equal(exportB.cook_reflections.length, 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: delayed recipe response after SPA dish switch; delayed reflection success after real account switch cannot clear/change the new attempt');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
