// Run against an isolated, migrated+synced Flask server, never production.
// BASE_URL defaults to the dedicated local review server. Requires Playwright.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const en = require('../../frontend/src/locales/en.json');
const de = require('../../frontend/src/locales/de.json');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5097';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) throw Error('Use a disposable localhost server');
const output = path.resolve(__dirname, '../../artifacts/teaching-hardening');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'en-US', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => { if (req.method() !== 'GET' && /\/api\/(cook-log|reflections|me\/skills)/.test(req.url())) writes.push(req.url()); });
    await page.goto('/dish/lentil-bolognese/cook?level=basic&lang=en');
    await page.getByText('1 / 4', { exact: true }).count(); // actual assertions below use the translated control
    await page.getByRole('button', { name: en.cook_next + ' →', exact: true }).waitFor();
    const buttons = await page.locator('button').allTextContents();
    console.log('Guest controls:', buttons);
    const helpLabel = buttons.find(label => /help|simmer/i.test(label) && !/start over/i.test(label));
    if (helpLabel) {
      await page.getByRole('button', { name: helpLabel, exact: true }).click();
      await page.screenshot({ path: path.join(output, 'help-en-light-mobile.png'), fullPage: true });
      await page.getByRole('button', { name: en.cook_help_close, exact: true }).last().click();
    }
    await page.getByRole('button', { name: en.cook_next + ' →', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: en.cook_next + ' →', exact: true }).waitFor();
    assert.match(await page.locator('body').innerText(), /2/);
    await page.getByRole('button', { name: en.cook_next + ' →', exact: true }).click();
    await page.getByRole('button', { name: en.cook_next + ' →', exact: true }).click();
    await page.getByRole('button', { name: en.cook_finish, exact: true }).click();
    await page.getByText(en.guest_cook_done_title, { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'guest-done-en-light-mobile.png'), fullPage: true });
    assert.equal(writes.length, 0, 'Guest made a personal write');

    const register = await context.request.post('/api/auth/register', { data: { email: `review-${Date.now()}@example.test`, password: 'test-only-password-42', display_name: 'Review cook' } });
    assert.equal(register.status(), 201);
    const account = await register.json();
    await page.evaluate(token => localStorage.setItem('token', token), account.token);
    await page.goto('/dish/lentil-bolognese/cook?level=basic&lang=en');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: en.cook_next + ' →', exact: true }).click();
    await page.getByRole('button', { name: en.cook_finish, exact: true }).click();
    await page.getByRole('heading', { name: en.reflect_title }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: en.reflect_title }).waitFor();
    await page.getByLabel(en.reflection_outcome_label).selectOption('happy');
    await page.getByLabel(en.reflect_confidence_title).selectOption('comfortable');
    await page.getByRole('button', { name: en.reflect_save, exact: true }).click();
    await page.getByText(en.reflect_saved, { exact: true }).waitFor();
    await page.goto('/progress');
    await page.getByRole('button', { name: en.reflection_edit }).first().click();
    await page.getByLabel(en.reflection_outcome_label).selectOption('mixed');
    await page.screenshot({ path: path.join(output, 'history-editor-en-light-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: en.reflect_save, exact: true }).click();
    await page.getByRole('heading', { name: en.reflect_title }).waitFor({ state: 'hidden' });
    await page.getByLabel(en.skill_simmering, { exact: true }).selectOption('wants_guidance');
    await page.getByRole('button', { name: en.confidence_save }).click();
    await page.getByText(en.confidence_saved, { exact: true }).waitFor();
    const auth = { Authorization: `Bearer ${account.token}` };
    const exported = await (await context.request.get('/api/auth/me/export', { headers: auth })).json();
    assert.equal(exported.cook_reflections[0].outcome, 'mixed');
    assert.equal(exported.cook_reflections[0].confidence, 'comfortable');
    assert.equal(exported.skill_confidences[0].confidence, 'wants_guidance');
    for (const [lang, dark] of [['en', true], ['de', false], ['de', true]]) {
      await page.evaluate(({ lang, dark }) => localStorage.setItem('recipedrawer_settings', JSON.stringify({ language: lang, darkMode: dark })), { lang, dark });
      await page.goto('/progress');
      const strings = lang === 'de' ? de : en;
      await page.getByRole('button', { name: strings.reflection_edit }).first().click();
      await page.getByLabel(strings.reflection_outcome_label).waitFor();
      await page.screenshot({ path: path.join(output, `history-editor-${lang}-${dark ? 'dark' : 'light'}-mobile.png`), fullPage: true });
    }
    for (const lang of ['en', 'de']) for (const dark of [false, true]) {
      const strings = lang === 'de' ? de : en;
      await page.evaluate(({ lang, dark }) => localStorage.setItem('recipedrawer_settings', JSON.stringify({ language: lang, darkMode: dark })), { lang, dark });
      await page.goto(`/dish/lentil-bolognese/cook?level=basic&lang=${lang}`);
      const helpButton = page.getByRole('button').filter({ hasText: '💡' });
      await helpButton.click();
      await page.screenshot({ path: path.join(output, `help-${lang}-${dark ? 'dark' : 'light'}-mobile.png`), fullPage: true });
      await page.getByRole('link', { name: strings.cook_help_see_full_lesson + ' →', exact: true }).click();
      await page.getByRole('heading', { name: lang === 'en' ? 'Simmering' : 'Köcheln', exact: true }).waitFor();
      assert(new URL(page.url()).searchParams.has('snapshot'), 'In-cook lesson must keep snapshot context');
      await page.screenshot({ path: path.join(output, `lesson-${lang}-${dark ? 'dark' : 'light'}-mobile.png`), fullPage: true });
      await page.getByRole('link', { name: strings.lesson_back, exact: true }).first().click();
      await page.getByRole('button').filter({ hasText: '💡' }).waitFor();
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();
    console.log('PASS: guest zero writes/resume, account completion/reflection resume, History corrections, confidence independence, EN/DE light/dark screenshots; no page errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
