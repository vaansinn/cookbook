// Dynamically imported only after worker-page installs isolation barriers.
export async function mountCook(sandbox) {
  if (!sandbox?.isolated) throw Error('Worker fixture isolation required');
  const [React, dom, router, cook, authModule, settingsModule, apiModule, sessions] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-router-dom'), import('../src/pages/CookMode.jsx'),
    import('../src/store/useAuthStore.js'), import('../src/store/useSettingsStore.js'), import('../src/api/client.js'),
    import('../src/store/cookSession.js'),
  ]);
  const auth = authModule.default, owner = 980001, api = apiModule.default;
  auth.setState({ user: { id: owner }, token: 'synthetic-worker-account', initialized: true,
    initializing: false, initError: null, epoch: 1, requestGeneration: 1 });
  settingsModule.default.setState({ language: 'en', darkMode: false });
  api.defaults.adapter = async (config) => {
    const method = (config.method || 'get').toUpperCase();
    if (method === 'GET' && config.url === '/recipe-snapshot/10') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: { snapshot_id: 10,
        next_practice: null, content: { schema_version: 2, title: 'Synthetic worker cooking fixture', lessons: {},
          steps: [{ id: 'step-1', text: 'Wait 10 min. Synthetic test only.' }, { id: 'step-2', text: 'Synthetic second step.' }] } } };
    }
    // No real writes, including Finish, auth, reflections or catalog requests.
    throw Object.assign(Error('Synthetic transport refuses this operation'), { config, response: { status: 503, data: {} } });
  };
  const attempt = sessions.getOrStartSession(owner, { dishSlug: 'synthetic-worker', level: 'basic', lang: 'en', snapshotId: 10 });
  const root = dom.createRoot(document.getElementById('actual-cook'));
  root.render(React.createElement(router.MemoryRouter, { initialEntries: [`/dish/synthetic-worker/cook?level=basic&lang=en&attempt=${attempt}`] },
    React.createElement(router.Routes, null, React.createElement(router.Route, { path: '/dish/:slug/cook', element: React.createElement(cook.default) }),
      React.createElement(router.Route, { path: '*', element: React.createElement('p', null, 'Synthetic route exited; reload this harness to resume.') }))));
  return { snapshot: () => ({ attempt, record: sessions.getSessionRecord(owner, attempt) }), dispose: () => root.unmount() };
}
