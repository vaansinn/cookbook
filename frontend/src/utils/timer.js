// Ported from the original static cookbook — parses a duration out of an
// instruction step's text ("simmer 20-25 min") so Cook Mode can offer a timer.

export function parseSeconds(text) {
  const h = text.match(/(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*(?:h\b|hours?\b)/i);
  const m = text.match(/(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*(?:min\b|minutes?\b)/i);
  let s = 0;
  if (h) s += parseFloat(h[1].replace(",", ".")) * 3600;
  if (m) s += parseFloat(m[1].replace(",", ".")) * 60;
  return s > 0 ? Math.round(s) : null;
}

export function fmtSecs(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    // AudioContext unavailable (e.g. no user gesture yet) — silent no-op
  }
}
