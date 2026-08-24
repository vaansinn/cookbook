// Ported from the original static cookbook (menu.zeni-design.com) — scales the
// leading quantity in an ingredient's display text by a servings factor.
// Nutrition math uses the separate, authoritative qty_g field (see models.py);
// this only rewrites what's shown on screen.

const UNICODE_FRAC = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125 };

function fmtNum(n) {
  if (Math.abs(n - Math.round(n)) < 0.02) return String(Math.round(n));
  for (const [gl, v] of Object.entries(UNICODE_FRAC)) {
    if (Math.abs((n % 1) - v) < 0.03) return (Math.floor(n) || "") + gl;
  }
  return (Math.round(n * 10) / 10).toString();
}

export function scaleIngredientText(text, factor) {
  const m = text.match(/^([\d]+(?:[.,]\d+)?|[½⅓⅔¼¾⅛]|\d+[½⅓⅔¼¾⅛])(\s*)(.*)$/);
  if (!m) return text;
  let numStr = m[1], val = 0;
  if (UNICODE_FRAC[numStr] !== undefined) val = UNICODE_FRAC[numStr];
  else if (/[½⅓⅔¼¾⅛]$/.test(numStr)) val = parseInt(numStr, 10) + UNICODE_FRAC[numStr.slice(-1)];
  else val = parseFloat(numStr.replace(",", "."));
  return `${fmtNum(val * factor)}${m[2]}${m[3]}`;
}
