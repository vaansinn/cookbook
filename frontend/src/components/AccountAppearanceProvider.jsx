import { createContext, useContext, useEffect, useRef, useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import useSettingsStore from '../store/useSettingsStore';
import usePlanningWorkspace from './planning/usePlanningWorkspace';
import { sessionKey, verifiedSession } from './planning/planningModel.mjs';
import { errorText, planningStrings } from './planning/planningStrings.mjs';
import PlanningRecovery from './planning/PlanningRecovery';
import { PlanningDialog } from './planning/PlanningDialog';
import '../styles/private-planning.css';

const Appearance = createContext(null);
export const useAccountAppearance = () => useContext(Appearance);

export default function AccountAppearanceProvider({ children }) {
  const key = useAuthStore(sessionKey);
  const storageError = useSettingsStore((state) => state.storageError);
  const language = useSettingsStore((state) => state.language);
  const session = verifiedSession(useAuthStore.getState());
  return session ? <SignedInAppearance key={key} owner={key}>{children}</SignedInAppearance>
    : <Appearance.Provider value={null}>{children}{storageError && <aside className="private-planning" role="status">
      {language === 'de' ? 'Die Geräteeinstellungen konnten nicht gespeichert werden.' : 'Device preferences could not be saved.'}
    </aside>}</Appearance.Provider>;
}

function SignedInAppearance({ owner, children }) {
  const api = usePlanningWorkspace({ area: 'preferences', id: null, offset: 0 });
  const [showRecovery, setShowRecovery] = useState(false);
  const [requested, setRequested] = useState(false);
  const alive = useRef(true);
  const language = useSettingsStore((s) => s.language);
  const t = planningStrings[language === 'de' ? 'de' : 'en'];
  let preferencePending = false;
  try { preferencePending = JSON.parse(api.pending?.body || 'null')?.operation === 'preferences.update'; } catch { /* Adapter owns corrupt outbox handling. */ }

  useEffect(() => {
    alive.current = true;
    useSettingsStore.getState().activateAppearanceOwner(owner);
    // Clear identity on every transition, even A -> null -> A between renders.
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (sessionKey(next) !== sessionKey(previous)) {
        useSettingsStore.getState().activateAppearanceOwner(verifiedSession(next) ? sessionKey(next) : null);
      }
    });
    return () => {
      alive.current = false; unsubscribe();
      if (useSettingsStore.getState().appearanceOwner === owner) useSettingsStore.getState().activateAppearanceOwner(null);
    };
  }, [owner]);
  useEffect(() => {
    if (api.snapshot && sessionKey(useAuthStore.getState()) === owner) {
      useSettingsStore.getState().acceptAccountAppearance(owner, api.snapshot.preference_revision, api.snapshot.preferences);
    }
  }, [owner, api.snapshot]);

  async function change(changes) {
    if (!api.canEdit) { setShowRecovery(true); return; }
    setRequested(true);
    const result = await api.run('preferences.update', {
      expected_revision: api.snapshot.preference_revision, changes,
    }, api.snapshot.revision);
    if (alive.current) { setRequested(false); if (!result) setShowRecovery(true); }
  }
  return <Appearance.Provider value={{ signedIn: true, busy: api.busy || api.loading || requested, change }}>
    {children}
    {(api.error || preferencePending) && !showRecovery && <aside className="private-planning pp-appearance-notice" role="status">
      <button type="button" className="pp-text-button" onClick={() => setShowRecovery(true)}>{t.appearanceReview}</button>
    </aside>}
    {showRecovery && <div className="private-planning"><PlanningDialog title={t.appearanceTitle} t={t} onClose={() => setShowRecovery(false)}>
      <p>{t.appearanceAccount}</p>
      {api.error && <p className="pp-error" role="alert">{errorText(api.error, t)}</p>}
      {api.pending ? preferencePending ? <PlanningRecovery key={api.pending.body} pending={api.pending} t={t} busy={api.busy || api.loading} error={api.error} run={api.run}
        onRetried={() => setShowRecovery(false)} /> : <p role="status">{t.appearanceOtherSave}</p> : <p>{t.appearanceRetryChange}</p>}
      <button type="button" disabled={api.busy || api.loading} onClick={() => api.reload()}>{t.retryRead}</button>
      <button type="button" onClick={() => setShowRecovery(false)}>{t.close}</button>
    </PlanningDialog></div>}
  </Appearance.Provider>;
}
