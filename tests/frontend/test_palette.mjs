import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const css = read('frontend/src/index.css');
const declarations = (block) => Object.fromEntries(
  [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()])
);
const light = declarations(css.match(/:root\s*\{([^}]+)\}/)[1]);
const dark = { ...light, ...declarations(css.match(/html\.dark\s*\{([^}]+)\}/)[1]) };
const resolve = (theme, key) => {
  const value = theme[key];
  assert.ok(value, `Missing token ${key}`);
  return value.startsWith('var(') ? resolve(theme, value.slice(6, -1)) : value;
};
const luminance = (hex) => {
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
let checks = 0;
for (const [name, theme] of Object.entries({ light, dark })) {
  const pairs = [
    ['ink', 'bg'], ['ink', 'card'], ['muted', 'bg'], ['muted', 'card'],
    ['brand', 'card'], ['brand-dk', 'brand-soft'], ['ink', 'brand-soft'],
    ['brand-ink', 'brand'], ['success-ink', 'success'], ['danger-ink', 'danger'],
    ['danger', 'bg'], ['danger', 'card'], ['danger-dk', 'danger-soft'],
    ['ink', 'danger-soft'], ['attention-ink', 'attention'], ['locked', 'card'],
  ];
  for (const [fg, bg] of pairs) {
    const values = [fg, bg].map((key) => luminance(resolve(theme, key))).sort((a, b) => b - a);
    const ratio = (values[0] + 0.05) / (values[1] + 0.05);
    assert.ok(ratio >= 4.5, `${name}: ${fg}/${bg} contrast ${ratio.toFixed(2)} < 4.5`);
    checks++;
  }
  for (const tier of ['basic', 'inter', 'hot']) {
    for (const suffix of ['', '-dk', '-soft']) {
      assert.equal(resolve(theme, tier + suffix), resolve(theme, 'brand' + suffix));
    }
  }
  assert.notEqual(resolve(theme, 'brand'), resolve(theme, 'danger'));
  assert.notEqual(resolve(theme, 'brand'), resolve(theme, 'success'));
}
assert.equal(light.brand, '#284C65');
const manifest = JSON.parse(read('frontend/public/manifest.json'));
assert.equal(manifest.theme_color, light.brand);
assert.equal(manifest.background_color, light.bg);
assert.ok(read('frontend/index.html').includes(`name="theme-color" content="${light.brand}"`));
for (const directory of ['pages', 'components']) {
  for (const filename of readdirSync(fileURLToPath(new URL(`frontend/src/${directory}/`, root)))) {
    if (!filename.endsWith('.jsx')) continue;
    for (const line of read(`frontend/src/${directory}/${filename}`).split('\n')) {
      if (line.includes('var(--hot')) assert.ok(line.startsWith('const TIER_'), `${filename}: danger must not use a tier token`);
    }
  }
}
console.log(`Palette checks passed: ${checks} AA text/fill pairs, tier aliases, semantic separation and PWA colors.`);
