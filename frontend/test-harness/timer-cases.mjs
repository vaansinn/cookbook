// Loaded only after timer-sandbox installs native storage/transport barriers.
const assert = (condition, message) => { if (!condition) throw Error(message); };
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(check, message, timeout = 7000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) { const value = check(); if (value) return value; await pause(); }
  throw Error(`Timed out: ${message}`);
}
const settle = async () => { await pause(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); };
const host = () => document.getElementById('mounted-page');
const actual = () => document.getElementById('actual-cook');
const button = (label) => [...(actual()?.querySelectorAll('button') || [])].find((node) => (node.getAttribute('aria-label') || node.textContent.trim()) === label);
const text = (value) => actual()?.textContent.includes(value);
async function click(find, label) {
  const node = await until(() => { const n = find(); return n?.isConnected && !n.disabled && n.getClientRects().length ? n : null; }, `${label} enabled`);
  node.focus(); assert(document.activeElement === node, `${label} not focusable`); node.click();
}
const clickButton = (label) => click(() => button(label), label);

export async function boot(sandbox) {
  assert(sandbox?.isolated && window.localStorage === sandbox.storage, 'Isolation required before imports');
  const [{ default: React }, { createRoot }, router, { default: CookMode }, { default: auth },
    { default: settings }, { default: api }, sessions, timers] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-router-dom'), import('../src/pages/CookMode.jsx'),
    import('../src/store/useAuthStore.js'), import('../src/store/useSettingsStore.js'), import('../src/api/client.js'),
    import('../src/store/cookSession.js'), import('../src/utils/cookTimer.mjs'), import('../src/index.css'),
  ]);
  const h = React.createElement;
  let root, fixture, epoch = 0, reloadPage;
  const releases = [];
  const recordKey = () => `cook_session:${fixture.ns}:${fixture.owner}:${fixture.a}`;
  const stored = () => JSON.parse(sandbox.values.get(recordKey()) || 'null');
  const timer = () => stored()?.timer;
  function rotate() {
    auth.setState({ token: `synthetic-timer-rotated-${++epoch}`, requestGeneration: auth.getState().requestGeneration + 1 });
  }
  // Keep the real Axios services and interceptors, replace only their transport.
  api.defaults.adapter = async (config) => {
    const method = (config.method || 'get').toUpperCase(), path = config.url;
    const authorization = config.headers?.Authorization;
    assert(!authorization || authorization.startsWith('Bearer synthetic-timer-'), 'Non-synthetic credential');
    fixture.calls.push({ method, path });
    let data;
    const snapshot = (id) => ({ snapshot_id: id, next_practice: null, content: { schema_version: 2, title: 'Synthetic timer recipe',
      steps: [{ id: id === 11 ? 'winning-step' : 'step-1', text: id === 11 ? 'Winning snapshot: wait 1 min.' : id === 20 ? 'Captured snapshot: wait 1 min.' : 'Wait 1 min.' }, { id: 'step-2', text: 'Serve the synthetic dish.' }], lessons: {} } });
    if (method === 'GET' && ['/recipe-snapshot/10', '/recipe-snapshot/11', '/recipe-snapshot/20'].includes(path)) {
      data = snapshot(Number(path.split('/').at(-1)));
      if (fixture.winnerDenied && data.snapshot_id === 11) throw Object.assign(Error('Synthetic winner authorization denial'), { config, response: { status: 403, data: {} } });
      if (fixture.snapshotError) throw Object.assign(Error('Synthetic snapshot failure'), { config, response: { status: 503, data: {} } });
      if (fixture.snapshotGate) { const gate = fixture.snapshotGate; fixture.snapshotGate = null; gate.entered = true; await gate.promise; }
    } else if (method === 'POST' && path === '/recipe-snapshot' && fixture.fresh) {
      data = snapshot(20);
      if (fixture.racePin) {
        const winner = await sessions.setSessionSnapshot(fixture.owner, fixture.a, 11, fixture.ns, { requireLock: true });
        assert(winner.ok, 'Synthetic concurrent pin failed');
      }
      if (fixture.pinFailure) sandbox.faults.write = true;
    } else if (method === 'POST' && path === '/cook-log') {
      assert(fixture.ns === 'account' && authorization, 'Guest must not write cook log');
      const payload = JSON.parse(config.data);
      assert(payload.session_id === fixture.a || payload.session_id === fixture.b, 'Wrong synthetic attempt');
      if (fixture.finishError) throw Object.assign(Error('Synthetic Finish rejection'), { config, response: { status: 503, data: {} } });
      data = { cook_log: { id: 12 } };
    } else if (method === 'GET' && path === '/cook-log/12/reflection') {
      assert(fixture.ns === 'account' && authorization, 'Guest must not read reflection');
      data = { revision: 0, focus_skill: null, outcome: null, confidence: null, practiced_skill_confirmed: null };
    } else {
      fixture.protocolErrors.push(`${method} ${path}`); throw Error(`Unexpected synthetic transport ${method} ${path}`);
    }
    return { status: 200, statusText: 'OK', headers: { 'cache-control': 'no-store' }, config, data };
  };
  function Navigation() {
    const navigate = router.useNavigate(), location = router.useLocation();
    const [generation, setGeneration] = React.useState(0);
    reloadPage = () => setGeneration((value) => value + 1);
    const go = (id) => navigate(`/dish/synthetic-timer/cook?level=basic&lang=en&attempt=${id}`);
    return h(React.Fragment, null,
      h('aside', { id: 'timer-fixture-controls', 'aria-label': 'TEST ONLY fixture controls' },
        h('output', { id: 'mounted-route' }, location.pathname + location.search),
        h('button', { type: 'button', 'data-fixture': 'a', onClick: () => go(fixture.a) }, 'TEST ONLY attempt A'),
        h('button', { type: 'button', 'data-fixture': 'b', onClick: () => go(fixture.b) }, 'TEST ONLY attempt B'),
        h('button', { type: 'button', 'data-fixture': 'remount', onClick: reloadPage }, 'TEST ONLY remount'),
        h('button', { type: 'button', 'data-fixture': 'rotate', onClick: rotate }, 'TEST ONLY rotate credentials')),
      h('div', { id: 'actual-cook' }, h(router.Routes, null,
        h(router.Route, { path: '/dish/:slug/cook', element: h(CookMode, { key: generation }) }))));
  }
  async function mount({ guest = false, seedTimer, snapshotError = false, finishError = true, wakeDelayed = false, wait = true,
    fresh = false, racePin = false, winnerDenied = false, pinFailure = false } = {}) {
    root?.unmount(); root = null;
    releases.splice(0).forEach((release) => release()); sandbox.wake.pending.splice(0).forEach((release) => release());
    await settle(); sandbox.faults.read = sandbox.faults.write = false;
    sandbox.storage.clear(); sandbox.writes.length = 0; sandbox.blocked.length = 0;
    sandbox.visibility('visible'); Object.assign(sandbox.wake, { requests: 0, releases: 0, delayed: wakeDelayed, denied: false });
    Object.assign(sandbox.feedback, { audio: 0, vibrations: 0 });
    settings.setState({ language: 'en', darkMode: false });
    fixture = { ns: guest ? 'guest' : 'account', owner: guest ? 'synthetic-timer-guest' : 970001,
      calls: [], protocolErrors: [], snapshotError, finishError, fresh, racePin, winnerDenied, pinFailure };
    auth.setState({ user: guest ? null : { id: fixture.owner }, token: guest ? null : `synthetic-timer-${++epoch}`,
      initialized: true, initializing: false, initError: null, epoch: ++epoch, requestGeneration: epoch });
    if (guest) sandbox.storage.setItem('cookbook_guest_id', fixture.owner);
    const options = { dishSlug: 'synthetic-timer', level: 'basic', lang: 'en', snapshotId: fresh ? undefined : 10, ns: fixture.ns };
    fixture.a = sessions.getOrStartSession(fixture.owner, options);
    fixture.b = sessions.getOrStartSession(fixture.owner, { ...options, forceNew: true });
    if (seedTimer) sandbox.values.set(recordKey(), JSON.stringify({ ...stored(), timer: seedTimer }));
    root = createRoot(host());
    root.render(h(router.MemoryRouter, { initialEntries: [`/dish/synthetic-timer/cook?level=basic&lang=en&attempt=${fixture.a}`] }, h(Navigation)));
    if (wait) await until(() => text(snapshotError ? 'We couldn’t load this cook.' : 'Wait 1 min.'), 'actual cooking content/error');
  }
  const route = async (id) => click(() => host().querySelector(`[data-fixture="${id}"]`), `route ${id}`);
  const holdRecord = () => { const release = sandbox.hold(`cook_timer:${fixture.ns}:${fixture.owner}:${fixture.a}`); releases.push(release); return release; };
  const cases = [
    ['Navigation, Finish rejection and snapshot failure retain the original timer', async () => {
      await mount(); await clickButton('Start timer: 1:00'); await until(() => timer()?.status === 'running', 'saved running timer');
      const deadline = timer().deadline;
      await clickButton('Next →'); await until(() => text('Timer · step 1'), 'original step label');
      assert(timer().deadline === deadline, 'Next restarted the deadline');
      await clickButton('Done cooking'); await until(() => text('Something went wrong.'), 'Finish rejection');
      assert(timer().status === 'running', 'Finish rejection cancelled timer');
      await clickButton('Pause'); await until(() => timer()?.status === 'paused', 'pause saved');
      fixture.snapshotError = true; reloadPage(); await until(() => text('We couldn’t load this cook.'), 'snapshot error');
      await clickButton('Resume'); await until(() => timer()?.status === 'running', 'timer usable without snapshot');
      fixture.snapshotError = false; await clickButton('Try again'); await until(() => text('Serve the synthetic dish.'), 'same saved step restored');
      assert(timer().stepId === 'step-1', 'Snapshot retry changed timer identity');
      await route('b'); await until(() => button('Start timer: 1:00'), 'independent attempt');
      assert(!button('Pause'), 'Attempt B inherited A timer');
    }],
    ['Stale corrupt Reset cannot delete another controller’s repaired timer', async () => {
      const corrupt = timers.newCookTimer('not-in-snapshot', 60, Date.now());
      await mount({ seedTimer: corrupt }); await until(() => text('Saved timer is invalid'), 'content-bound corruption warning');
      let repairedView;
      const other = timers.createCookTimerController({ stepIds: ['step-1'],
        read: () => sessions.getSessionTimer(fixture.owner, fixture.a, fixture.ns),
        write: (value, options) => sessions.setSessionTimer(fixture.owner, fixture.a, value, fixture.ns, options), onChange: (view) => { repairedView = view; } });
      try {
        other.load(); other.reset(); await until(() => !repairedView.blocked, 'other controller reset');
        other.start('step-1', 120); await until(() => timer()?.durationMs === 120000, 'other controller repair');
        const repaired = JSON.stringify(timer()); await clickButton('Reset saved timer');
        await until(() => text('timer changed elsewhere'), 'stale reset rejected');
        assert(JSON.stringify(timer()) === repaired, 'Stale reset clobbered repaired timer');
        sandbox.faults.read = true; await clickButton('Retry timer storage');
        await until(() => text('Saved timer could not be read'), 'read failure disclosed');
        assert(button('Next →') && !button('Start timer: 1:00'), 'Read failure prevents cooking or invents empty timer');
        sandbox.faults.read = false; await clickButton('Retry timer storage'); await until(() => button('Pause'), 'repaired timer reloaded');
      } finally { other.dispose(); }
    }],
    ['Write failure remains explicitly unsaved until retry', async () => {
      await mount(); await clickButton('Start timer: 1:00'); await until(() => timer()?.status === 'running', 'running');
      sandbox.faults.write = true; await clickButton('Pause'); await until(() => text('only on this screen, not saved'), 'unsaved warning');
      assert(timer().status === 'running', 'Failed save changed stored bytes');
      await clickButton('Next →'); assert(text('Paused'), 'Navigation lost the in-memory pause');
      sandbox.faults.write = false; await clickButton('Retry timer storage');
      await until(() => timer()?.status === 'paused' && !text('only on this screen, not saved'), 'explicit retry persisted pause and cleared warning');
    }],
    ['Credential rotation fences queued Finish metadata and the old visible phase', async () => {
      await mount({ finishError: false }); await clickButton('Next →'); const release = holdRecord();
      await clickButton('Done cooking'); await until(() => fixture.calls.some((call) => call.path === '/cook-log'), 'Finish response before metadata lock');
      await settle(); rotate(); await settle(); release();
      await until(() => text('Serve the synthetic dish.') && button('Done cooking'), 'new credential cooking surface');
      assert(!stored().cook_log_id && !text('How did it go?'), 'Old Finish adopted new credentials');
    }],
    ['Wake acquisition is released on hide/unmount and disabled in reflection/done', async () => {
      await mount({ wakeDelayed: true, finishError: false }); await until(() => sandbox.wake.pending.length === 1, 'held wake acquisition');
      await route('b'); await until(() => sandbox.wake.pending.length === 2, 'new attempt wake request');
      sandbox.wake.pending.shift()(); await until(() => sandbox.wake.releases === 1, 'late old acquisition released');
      sandbox.wake.delayed = false; sandbox.wake.pending.shift()(); await until(() => text('Keeping the screen awake'), 'current acquisition active');
      sandbox.visibility('hidden'); await until(() => sandbox.wake.releases === 2, 'hidden release');
      sandbox.visibility('visible'); await until(() => sandbox.wake.requests === 3 && text('Keeping the screen awake'), 'visible reacquisition');
      await clickButton('Next →'); await clickButton('Done cooking'); await until(() => text('How did it go?'), 'reflection');
      await until(() => sandbox.wake.releases === sandbox.wake.requests, 'reflection released wake');
      await clickButton('Continue without further changes'); await until(() => text('Logged! Nice work.'), 'done');
      assert(sandbox.wake.requests === 3, 'Reflection/done requested wake lock');
    }],
    ['Reflection continuation cannot complete under a newer credential scope', async () => {
      await mount({ finishError: false }); await clickButton('Next →'); await clickButton('Done cooking');
      await until(() => text('How did it go?'), 'reflection'); const release = holdRecord();
      await clickButton('Continue without further changes'); await settle(); rotate(); await settle(); release();
      await until(() => text('How did it go?') && button('Continue without further changes'), 'new credential reflection');
      assert(stored()?.cook_log_id === 12 && !text('Logged! Nice work.'), 'Stale completion removed attempt or advanced newer phase');
    }],
    ['Guest expiry is terminal and Finish sends no cook-log/reflection write', async () => {
      await mount({ guest: true, seedTimer: timers.newCookTimer('step-1', 1, Date.now() - 5000) });
      await until(() => text("Time's up!"), 'elapsed timer restored'); assert(!button('Resume'), 'Elapsed timer accidentally resumable');
      await clickButton('Next →'); await clickButton('Done cooking'); await until(() => text('Nice work!'), 'guest done');
      assert(fixture.calls.every((call) => call.method === 'GET' && call.path === '/recipe-snapshot/10'), 'Guest sent private completion traffic');
    }],
    ['Another tab finishes the cook: stale timer stops, cannot write or alarm', async () => {
      const seed = timers.newCookTimer('step-1', 2, Date.now());
      await mount({ seedTimer: seed }); await until(() => button('Pause'), 'active timer');
      await sessions.setSessionCookLog(fixture.owner, fixture.a, 12, fixture.ns);
      const before = JSON.stringify(timer());
      assert(sessions.getSessionTimer(fixture.owner, fixture.a, fixture.ns).error === 'finished', 'Finished timer remained readable');
      const write = await sessions.setSessionTimer(fixture.owner, fixture.a, null, fixture.ns, { reset: true, expectedTimer: seed });
      assert(write.error === 'finished', 'Finished timer accepted another-tab reset');
      await until(() => text('This cook has already been finished.'), 'finished notice, not alarm');
      await until(() => Date.now() > seed.deadline + 300, 'original timer deadline passed');
      assert(!button('Pause') && !button('Resume') && !text("Time's up!"), 'Finished timer still exposed alarm/controls');
      assert(JSON.stringify(timer()) === before && sandbox.feedback.audio === 0 && sandbox.feedback.vibrations === 0, 'Finished timer changed or sounded');
    }],
    ['A competing snapshot pin wins: only its authorized content is rendered', async () => {
      await mount({ fresh: true, racePin: true, wait: false });
      await until(() => text('Winning snapshot: wait 1 min.'), 'authorized winning snapshot');
      assert(stored().snapshot_id === 11 && fixture.calls.some((call) => call.path === '/recipe-snapshot/11'), 'Persisted winner was not read');
      assert(!text('Captured snapshot: wait 1 min.'), 'Losing capture was rendered');
      await clickButton('Start timer: 1:00'); await until(() => timer()?.stepId === 'winning-step', 'timer uses winning step identity');
    }],
    ['Unavailable winning snapshot shows recovery, never the losing capture', async () => {
      await mount({ fresh: true, racePin: true, winnerDenied: true, wait: false });
      await until(() => text('We couldn’t load this cook.'), 'winner-read failure');
      assert(stored().snapshot_id === 11 && !text('Captured snapshot: wait 1 min.') && !button('Start timer: 1:00'), 'Denied winner fell back to losing content');
      fixture.winnerDenied = false; await clickButton('Try again');
      await until(() => text('Winning snapshot: wait 1 min.'), 'same winner recovered');
    }],
    ['Failed snapshot persistence cannot become usable content until explicit retry', async () => {
      await mount({ fresh: true, pinFailure: true, wait: false });
      await until(() => text('We couldn’t load this cook.'), 'pin storage failure');
      assert(stored().snapshot_id === null && !text('Captured snapshot: wait 1 min.') && !button('Start timer: 1:00'), 'Unsaved capture was adopted');
      fixture.pinFailure = false; sandbox.faults.write = false; await clickButton('Try again');
      await until(() => text('Captured snapshot: wait 1 min.'), 'explicit pin retry');
      assert(stored().snapshot_id === 20, 'Retry rendered before pin succeeded');
    }],
  ];
  const run = document.getElementById('run-tests'), show = document.getElementById('show-fixture'), summary = document.getElementById('summary');
  document.getElementById('boot-status').textContent = `Isolation installed — ${cases.length} timer cases; real components/services, synthetic adapters only.`;
  run.disabled = show.disabled = false;
  show.addEventListener('click', async () => {
    run.disabled = show.disabled = true;
    try { await mount(); summary.textContent = 'Manual synthetic cooking fixture; no test pass implied.'; summary.removeAttribute('data-result'); }
    catch (error) { summary.dataset.result = 'FAIL'; summary.textContent = error.message; }
    finally { run.disabled = show.disabled = false; }
  });
  run.addEventListener('click', async () => {
    run.disabled = show.disabled = true; document.getElementById('results').replaceChildren(); let passed = 0;
    for (const [name, execute] of cases) {
      const item = document.createElement('li'); item.textContent = `RUNNING — ${name}`; document.getElementById('results').append(item);
      try {
        await execute(); assert(!sandbox.blocked.length && !fixture.protocolErrors.length, 'Isolation/protocol violation');
        item.dataset.result = 'PASS'; item.textContent = `PASS — ${name}`; passed++;
      } catch (error) { item.dataset.result = 'FAIL'; item.textContent = `FAIL — ${name}\n${error.message}`; }
      finally { releases.splice(0).forEach((release) => release()); sandbox.wake.pending.splice(0).forEach((release) => release()); root?.unmount(); root = null; await settle(); }
      summary.textContent = `${passed}/${cases.length} passed so far.`;
    }
    summary.dataset.result = passed === cases.length ? 'PASS' : 'FAIL';
    summary.textContent = `${passed}/${cases.length} mounted timer cases passed. Synthetic transport/storage only; not device or real cross-tab acceptance.`;
    run.disabled = show.disabled = false;
  });
}
