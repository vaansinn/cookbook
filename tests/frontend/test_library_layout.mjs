// Source/layout contracts; mounted interactions are checked through the CUA browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../../frontend/src/' + path, import.meta.url), 'utf8');
test('compact library retains guarded real reads and independent favorite targets', () => {
  const home = read('pages/Home.jsx');
  assert.match(home, /startDiscoveryRead/);
  assert.match(home, /fetchDishes\(params, signal\)/);
  assert.match(home, /fetchFilters\(language, signal\)/);
  assert.match(home, /<article key=\{d.slug\}/);
  assert.match(home, /<\/Link>\s*<button/);
  assert.match(home, /user \? toggleFavorite\(d.slug\) : navigate\("\/login"\)/);
  assert.match(home, /<label className="library-filter"/);
  assert.match(home, /aria-pressed=\{favoritesOnly\}/);
  assert.doesNotMatch(home, /DISH_EMOJI|TIER_DOT_CLASS|overflow-x-auto/);
  assert.doesNotMatch(home, /localStorage|welcoming-kitchen|creatorCooked/);
});
test('library reflows cards and exposes keyboard focus without fixed text heights', () => {
  const css = read('styles/library.css');
  assert.match(css, /repeat\(auto-fit, minmax\(min\(100%, 235px\), 1fr\)\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.doesNotMatch(css, /line-clamp|text-overflow|animation:/);
  assert.match(read('components/BottomNav.jsx'), /aria-current=\{active \? "page" : undefined\}/);
});
test('library normal text pairs meet 4.5:1 in both themes', () => {
  const lum = (hex) => {
    const c = hex.match(/[a-f0-9]{2}/gi).map((x) => parseInt(x, 16) / 255)
      .map((x) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const css = read('styles/library.css');
  for (const selector of ['.library-page', '.dark .library-page']) {
    const start = css.indexOf(selector + ' {'), block = css.slice(start, css.indexOf('}', start));
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+): (#[a-f0-9]{6})/g)].map((m) => [m[1], m[2]]));
    for (const ink of ['ink', 'muted']) for (const paper of ['bg', 'card', 'library-oat']) {
      const values = [lum(tokens[ink]), lum(tokens[paper])].sort((a, b) => b - a);
      assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `${selector} ${ink}/${paper}`);
    }
  }
});
