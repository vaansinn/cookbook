// LP22: milliseconds throughout. Callbacks render a deadline; they never count time.
export const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
export const CLOCK_TOLERANCE_MS = 2000;
const timestamp = (value) => Number.isSafeInteger(value) && value >= 0;
const duration = (value) => Number.isSafeInteger(value) && value > 0 && value <= MAX_TIMER_MS;

// Memory-only identity. Never write this key to history, storage or diagnostics.
export const cookAuthKey = (state) => JSON.stringify([state.initialized, state.user?.id,
  state.epoch, state.requestGeneration, state.token]);
export function createCookAuthScope(store, extraCurrent = () => true) {
  const origin = cookAuthKey(store.getState()), controller = new AbortController();
  // The subscription makes A -> null -> A irrevocably stale, even if React
  // batches those changes into one render with the same final identity.
  const unsubscribe = store.subscribe((next) => { if (cookAuthKey(next) !== origin) controller.abort(); });
  return {
    signal: controller.signal,
    current: () => !controller.signal.aborted && cookAuthKey(store.getState()) === origin && extraCurrent(),
    cancel: () => { controller.abort(); unsubscribe(); },
  };
}

export function validCookTimer(timer, stepIds) {
  if (!timer || typeof timer !== 'object' || Array.isArray(timer) || timer.schema !== 1
    || typeof timer.stepId !== 'string' || !timer.stepId.length || timer.stepId.length > 128
    || (stepIds && !stepIds.includes(timer.stepId)) || !duration(timer.durationMs)
    || !timestamp(timer.updatedAt) || typeof timer.clockNotice !== 'boolean') return false;
  if (timer.status === 'running') return timestamp(timer.deadline) && timer.pausedRemaining === null
    && timer.deadline > timer.updatedAt && timer.deadline - timer.updatedAt <= timer.durationMs;
  if (timer.status === 'paused') return timer.deadline === null && duration(timer.pausedRemaining)
    && timer.pausedRemaining <= timer.durationMs;
  return timer.status === 'elapsed' && timer.deadline === null && timer.pausedRemaining === 0;
}

export function remainingMs(timer, wall) {
  return !timer ? 0 : timer.status === 'running'
    ? Math.max(0, Math.min(timer.durationMs, timer.deadline - wall)) : timer.pausedRemaining;
}

export function newCookTimer(stepId, seconds, wall) {
  const timer = { schema: 1, stepId, status: 'running', durationMs: seconds * 1000,
    deadline: wall + seconds * 1000, pausedRemaining: null, updatedAt: wall, clockNotice: false };
  if (!validCookTimer(timer)) throw new Error('invalid_timer');
  return timer;
}

export function pauseCookTimer(timer, left, wall, clockNotice = false) {
  return { ...timer, status: left > 0 ? 'paused' : 'elapsed', deadline: null,
    pausedRemaining: left, updatedAt: wall, clockNotice };
}

export function restoreCookTimer(value, wall, stepIds) {
  if (value == null) return { timer: null, error: null };
  if (!validCookTimer(value, stepIds)) return { timer: null, error: 'corrupt' };
  if (value.status !== 'elapsed' && wall < value.updatedAt) return { timer: pauseCookTimer(value,
    value.status === 'running' ? value.deadline - value.updatedAt : value.pausedRemaining, wall, true), error: null };
  if (value.status !== 'running') return { timer: value, error: null };
  if (wall >= value.deadline) return { timer: pauseCookTimer(value, 0, wall), error: null };
  return { timer: value, error: null };
}

export function reconcileCookTimer(timer, previous, wall, mono) {
  if (!timer || timer.status !== 'running') return timer;
  if (previous && (mono < previous.mono || Math.abs((wall - previous.wall) - (mono - previous.mono)) > CLOCK_TOLERANCE_MS)) {
    return pauseCookTimer(timer, previous.remaining, wall, true);
  }
  return wall >= timer.deadline ? pauseCookTimer(timer, 0, wall) : timer;
}

// No storage or network globals: the caller supplies the exact attempt boundary.
// Failed writes keep a usable in-memory timer and an explicit unsaved state.
export function createCookTimerController({ read, write, stepIds, onChange, onElapsed = () => {},
  current = () => true, wallNow = Date.now, monoNow = () => performance.now() }) {
  let timer = null, persisted = null, error = null, blocked = true, sample = null, stopped = false, pending = false;
  const knownSteps = () => typeof stepIds === 'function' ? stepIds() : stepIds;
  const active = () => !stopped && current();
  const publish = () => { if (active()) onChange({ timer, error, blocked: blocked || pending, saving: pending, remaining: remainingMs(timer, wallNow()) }); };
  const anchor = () => { sample = { wall: wallNow(), mono: monoNow(), remaining: remainingMs(timer, wallNow()) }; };
  function lifecycle() {
    const result = read();
    if (result.ok) return true;
    error = result.error; blocked = true;
    if (error !== 'storage') timer = null;
    publish(); return false;
  }
  function save(reset = false, alert = false) {
    if (!active() || pending) return;
    const submitted = timer;
    const settled = (result) => {
      pending = false;
      if (!active()) return;
      if (result.ok) { persisted = submitted; error = null; blocked = false; }
      else { error = result.error; blocked = result.error !== 'storage'; if (blocked) timer = error === 'finished' ? null : validCookTimer(persisted, knownSteps()) ? persisted : null; }
      publish();
    };
    try {
      const result = write(submitted, { expectedTimer: persisted, reset, current: active,
        // The real session writer invokes this only after an accepted expiry,
        // while retaining its lifecycle lock. No post-unlock alarm race.
        onElapsed: alert ? () => { if (active() && lifecycle()) onElapsed(); } : undefined });
      if (result?.then) { pending = true; result.then(settled, () => settled({ ok: false, error: 'storage' })); }
      else settled(result);
    } catch { settled({ ok: false, error: 'storage' }); }
  }
  function load() {
    if (!active() || pending) return;
    const result = read();
    if (!result.ok) { timer = null; error = result.error; blocked = true; publish(); return; }
    persisted = result.timer;
    const restored = restoreCookTimer(result.timer, wallNow(), knownSteps());
    timer = restored.timer; error = restored.error; blocked = !!error;
    if (!error && timer !== persisted) save();
    anchor(); publish();
  }
  function tick(checkpoint = false, allowCheckpoint = true) {
    if (!active() || error === 'finished') return;
    if (!lifecycle() || blocked) return;
    if (pending) { publish(); return; }
    if (timer && !validCookTimer(timer, knownSteps())) { error = 'corrupt'; blocked = true; publish(); return; }
    if (timer?.status !== 'running') return;
    const before = timer;
    timer = reconcileCookTimer(timer, sample, wallNow(), monoNow());
    if (timer !== before) save(false, before?.status === 'running' && timer?.status === 'elapsed');
    else if (allowCheckpoint && timer?.status === 'running' && !error && (checkpoint || wallNow() - timer.updatedAt >= 30000)) {
      timer = { ...timer, updatedAt: wallNow() }; save();
    }
    anchor(); publish();
  }
  return {
    load, tick,
    start(stepId, seconds) {
      if (!active() || pending || blocked || !knownSteps()?.includes(stepId) || (timer && timer.status !== 'elapsed')) return;
      timer = newCookTimer(stepId, seconds, wallNow());
      save(); anchor(); publish();
    },
    pause() {
      if (!active() || pending || blocked) return;
      tick(false, false); // A checkpoint must not consume this explicit pause action.
      if (pending || blocked || timer?.status !== 'running') return;
      timer = pauseCookTimer(timer, remainingMs(timer, wallNow()), wallNow()); save(); anchor(); publish();
    },
    resume() {
      if (!active() || pending || blocked || timer?.status !== 'paused') return;
      timer = { ...timer, status: 'running', deadline: wallNow() + timer.pausedRemaining,
        pausedRemaining: null, updatedAt: wallNow(), clockNotice: false };
      save(); anchor(); publish();
    },
    cancel() { if (active() && !pending && !blocked) { timer = null; save(); anchor(); publish(); } },
    reset() { if (active() && !pending) { timer = null; save(true); anchor(); publish(); } },
    retry() { if (active() && !pending) { if (blocked) load(); else { tick(false, false); save(); publish(); } } },
    dispose() { stopped = true; },
  };
}

// Own every acquired sentinel, including promises that resolve after hiding or
// disposal. Visibility changes create new generations, not overlapping owners.
export function manageCookWakeLock({ device = navigator, page = document, onStatus, current = () => true }) {
  let disposed = false, generation = 0, lock = null, pending = null;
  const status = (value) => { if (!disposed && current()) onStatus(value); };
  const release = (sentinel) => { try { Promise.resolve(sentinel?.release()).catch(() => {}); } catch { /* non-fatal */ } };
  async function visible() {
    if (!disposed && current() && page.visibilityState === 'visible' && (lock || pending !== null)) return;
    const ticket = ++generation;
    const old = lock; lock = null; release(old);
    if (disposed || !current() || page.visibilityState !== 'visible') { status('inactive'); return; }
    if (!device.wakeLock?.request) { status('unavailable'); return; }
    status('requesting');
    pending = ticket;
    try {
      const sentinel = await device.wakeLock.request('screen');
      if (disposed || !current() || ticket !== generation || page.visibilityState !== 'visible') { release(sentinel); return; }
      lock = sentinel; status('active');
      sentinel.addEventListener?.('release', () => { if (lock === sentinel) { lock = null; status('released'); } });
    } catch { if (ticket === generation) status('denied'); }
    finally {
      if (pending === ticket) pending = null;
      if (!disposed && current() && ticket !== generation && page.visibilityState === 'visible') visible();
    }
  }
  page.addEventListener('visibilitychange', visible);
  visible();
  return () => { disposed = true; generation++; page.removeEventListener('visibilitychange', visible); const old = lock; lock = null; release(old); };
}

// Best-effort foreground feedback. Every owned AudioContext is closed, even if
// autoplay is denied, playback never ends, or the attempt unmounts mid-sound.
export function playCookTimerAlarm(Audio = globalThis.AudioContext || globalThis.webkitAudioContext) {
  let context, timeout, closed = false;
  const close = () => {
    if (closed) return;
    closed = true; clearTimeout(timeout);
    try { Promise.resolve(context?.close()).catch(() => {}); } catch { /* optional feedback */ }
  };
  try {
    context = new Audio();
    let pending = 3;
    for (const offset of [0, 0.35, 0.7]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + offset + 0.3);
      oscillator.onended = () => { if (--pending === 0) close(); };
      oscillator.start(context.currentTime + offset); oscillator.stop(context.currentTime + offset + 0.3);
    }
    timeout = setTimeout(close, 2000);
  } catch { close(); }
  return close;
}
