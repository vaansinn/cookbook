import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useSettingsStore from '../store/useSettingsStore';
import usePlanningWorkspace from '../components/planning/usePlanningWorkspace';
import { formatDate, sessionKey, verifiedSession } from '../components/planning/planningModel.mjs';
import { errorText, planningStrings } from '../components/planning/planningStrings.mjs';
import PlanningRecovery from '../components/planning/PlanningRecovery';
import { PlanningDialog, PlanningPreview } from '../components/planning/PlanningDialog';
import ShoppingRows from '../components/shopping/ShoppingRows';
import { ShoppingAmountDialog, ShoppingPersonalDialog, ShoppingScopeDialog } from '../components/shopping/ShoppingDialogs';
import { coverPayload, currentProjection, scopeFromSearch, shoppingGroups, shoppingLayouts, visibleShoppingNotice } from '../components/shopping/shoppingModel.mjs';
import { shoppingStrings } from '../components/shopping/shoppingStrings.mjs';
import '../styles/private-planning.css';
import '../components/shopping/private-shopping.css';

function ShoppingWorkspace({ scopeId, fallbackLanguage, fallbackDark, handoffUndo, handoffKey }) {
  const api = usePlanningWorkspace({ area: 'shopping', id: scopeId || null, offset: 0 });
  const navigate = useNavigate();
  // Retain a disabled last screen through the shared hook's refresh so row focus
  // and unsaved modal inputs do not disappear between receipt and fresh read.
  const retained = useRef(null);
  if (api.snapshot) retained.current = api.snapshot;
  const snapshot = api.snapshot || retained.current;
  const preferences = snapshot?.preferences;
  const language = ['en', 'de'].includes(preferences?.language) ? preferences.language : fallbackLanguage;
  const dark = preferences?.dark_mode ?? fallbackDark;
  const t = { ...planningStrings[language], ...shoppingStrings[language] };
  const projection = currentProjection(snapshot, scopeId);
  const scope = projection?.scope || snapshot?.selectedScope;
  const layout = shoppingLayouts.includes(preferences?.shopping_layout) ? preferences.shopping_layout : 'category';
  const [editor, setEditor] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [remember, setRemember] = useState(null);
  const editorGeneration = useRef(0);
  const [now, setNow] = useState(Date.now());
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const currentUndo = api.undo || handoffUndo;
  useEffect(() => {
    if (!currentUndo) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [currentUndo]);
  const undoAvailable = !!currentUndo && currentUndo.revision === snapshot?.revision && Date.parse(currentUndo.expires) > now;
  const undo = async () => {
    if (!api.canEdit || !undoAvailable) return;
    const result = await api.run('undo.apply', { undo_id: currentUndo.id }, currentUndo.revision);
    if (alive.current && result) setNotice(null);
  };
  function closeEditor() { editorGeneration.current += 1; setEditor(null); }
  function openScope() {
    api.clearError();
    setEditor({ kind: 'scope', generation: ++editorGeneration.current });
  }
  async function onSaved(result, operation, expectedGeneration = editorGeneration.current, recovered = false) {
    if (!alive.current || !result || expectedGeneration !== editorGeneration.current) return;
    if (operation === 'preview.confirm' && (proposal?.operation === 'shopping.scope.delete'
      || scopeId && retained.current?.scopes && !retained.current.scopes.some((record) => record.id === scopeId))) {
      setEditor(null); setProposal(null); setRemember(null); setNotice(null);
      // Preserve the bounded server inverse across this route's keyed remount.
      // It remains account/session-bound, revision-fenced and time-limited.
      navigate('/shopping', { replace: true, state: {
        shoppingOwnerKey: handoffKey,
        shoppingUndo: result.undo_id ? { id: result.undo_id, expires: result.undo_expires_at, revision: result.revision } : null,
      } });
      return;
    }
    if (operation === 'shopping.scope' && result.scope_id) {
      // Keep the submission's preference revision, never adopt a newer one in
      // this automatic continuation. A recovered scope receipt has no durable
      // preference baseline, so remembering it requires an explicit action.
      const pauseRemember = (error = null) => {
        if (!alive.current || expectedGeneration !== editorGeneration.current) return;
        setEditor(null); setRemember({ scopeId: result.scope_id, error });
      };
      if (recovered) { pauseRemember(); return; }
      let fresh;
      try { fresh = await api.read('/preferences', { revision: result.revision }); }
      catch (error) { pauseRemember(error); return; }
      if (!alive.current || expectedGeneration !== editorGeneration.current) return;
      if (fresh.preference_revision !== snapshot.preference_revision) { pauseRemember(); return; }
      const saved = await api.run('preferences.update', { expected_revision: snapshot.preference_revision, changes: { shopping_scope_id: result.scope_id } }, result.revision);
      if (!alive.current || !saved || expectedGeneration !== editorGeneration.current) return;
      setEditor(null); setProposal(null);
      navigate(`/shopping?scope=${encodeURIComponent(result.scope_id)}`);
      return;
    }
    // A refresh can leave just the second (preference) command unresolved.
    let remembered;
    try { remembered = operation === 'preferences.update' && JSON.parse(api.pending?.body || 'null')?.payload?.changes?.shopping_scope_id; } catch { /* malformed outbox stays owned by the adapter */ }
    setEditor(null); setProposal(null); setRemember(null);
    if (remembered) navigate(`/shopping?scope=${encodeURIComponent(remembered)}`);
  }
  async function cover(reference, status, showNotice = true, all = false) {
    if (!api.canEdit || !scope) return;
    const result = await api.run('shopping.cover', coverPayload(scope.id, reference.row, reference.sources, status, reference.includeExtra), snapshot.revision);
    if (!alive.current || !result) return;
    setNotice(showNotice && (reference.dish || all) && ['bought', 'have'].includes(status)
      ? { scopeId: scope.id, referenceKey: reference.key, rowKey: reference.row.key, revision: result.revision, all, status } : null);
  }
  function edit(kind, reference) {
    if (!api.canEdit || !scope) return;
    api.clearError();
    setEditor({ kind, generation: ++editorGeneration.current, row: reference?.row, referenceKey: reference?.key, scopeId: scope.id, revision: snapshot.revision });
  }
  async function remove(row) {
    if (!api.canEdit || !scope) return;
    const result = await api.preview('shopping.personal.delete', { scope_id: scope.id, item_id: row.personal_id }, snapshot.revision);
    if (alive.current && result) setProposal(result);
  }
  async function removeSelection() {
    if (!api.canEdit || !scope) return;
    api.clearError();
    const generation = editorGeneration.current;
    const result = await api.preview('shopping.scope.delete', { scope_id: scope.id }, snapshot.revision);
    if (alive.current && generation === editorGeneration.current && result) setProposal(result);
  }
  const closeProposal = () => {
    const id = proposal?.id; setProposal(null);
    if (!api.busy && !api.pending) api.cancelPreview(id);
  };
  const recovery = <PlanningRecovery key={api.pending?.body || 'empty'} pending={api.pending} t={t} busy={api.busy || api.loading} error={api.error} run={api.run}
    onRetried={(result, operation) => onSaved(result, operation, editorGeneration.current, true)} />;
  const editorSaved = (result, operation) => onSaved(result, operation, editor?.generation);
  // Dialogs keep their own original revision, while reading only current owned
  // collections. During refresh the retained snapshot is presentation only.
  const dialogApi = { ...api, snapshot, canEdit: !!api.snapshot && api.canEdit };
  const owner = scope && snapshot[scope.owner_type === 'plan' ? 'plans' : 'events'].find((row) => row.id === scope.owner_id);
  const label = scope?.mode === 'dates' ? scope.start_date === scope.end_date ? formatDate(scope.start_date, language) : `${formatDate(scope.start_date, language)} – ${formatDate(scope.end_date, language)}`
    : scope?.mode === 'meals' ? scope.selection.length ? t.selected : t.emptySelection : t.all;
  const groups = projection ? shoppingGroups(projection.rows, layout, language, t) : [];
  const visibleNotice = visibleShoppingNotice(notice, projection, groups);
  const changePreference = (changes) => {
    if (api.canEdit) api.run('preferences.update', { expected_revision: snapshot.preference_revision, changes }, snapshot.revision);
  };
  return <section className="private-planning private-shopping" data-dark={dark ? 'true' : 'false'} lang={language} aria-labelledby="private-shopping-title">
    <nav className="pp-utility" aria-label={t.title}><Link to="/planning">{planningStrings[language].title}</Link><Link to="/groceries">{t.legacyGroceries}</Link></nav>
    <header className="pp-title-row"><h1 id="private-shopping-title" tabIndex={-1}>{t.title}</h1>
      <div className="pp-preferences ps-preferences">
        <select aria-label={t.language} value={language} disabled={!api.canEdit} onChange={(event) => changePreference({ language: event.target.value })}><option value="en">EN</option><option value="de">DE</option></select>
        <button type="button" aria-label={t.theme} aria-pressed={dark} disabled={!api.canEdit} onClick={() => changePreference({ dark_mode: !dark })}>{t[dark ? 'dark' : 'light']}</button>
      </div>
    </header>
    <div className="pp-load-bar"><span role="status">{api.busy ? t.saving : api.loading ? t.loading : api.saved ? t.saved : ''}</span><button type="button" className="pp-text-button" disabled={api.busy || api.loading} onClick={() => api.reload()}>{t.reload}</button></div>
    {api.error && !editor && !proposal && !remember && <div className="pp-error" role="alert"><p>{errorText(api.error, t)}</p>{['account_deleted', 'account_deletion_pending'].includes(api.error.code) && <Link to="/settings">{t.reviewAccountSettings}</Link>}</div>}
    {!editor && !proposal && !remember && recovery}
    {snapshot && <>
      <div className="ps-toolbar">
        <button type="button" className="ps-owner" aria-haspopup="dialog" disabled={!api.canEdit} onClick={openScope}>{owner?.name || t.chooseList}</button>
        {scope && <><span className="ps-scope-label">{label}</span><button type="button" className="pp-text-button" aria-haspopup="dialog" disabled={!api.canEdit} onClick={openScope}>{t.changeSelection}</button></>}
        {scope && <details className="pp-actions"><summary aria-label={t.selectionActions}>{t.actions}</summary><div className="pp-action-list">
          <button type="button" className="pp-text-button pp-danger" disabled={!api.canEdit} onClick={removeSelection}>{t.removeSelection}</button>
        </div></details>}
        <label className="ps-layout">{t.view}<select value={layout} disabled={!api.canEdit} onChange={(event) => changePreference({ shopping_layout: event.target.value })}>{shoppingLayouts.map((value) => <option key={value} value={value}>{t[value]}</option>)}</select></label>
      </div>
      {!projection ? <div className="pp-empty"><p role={snapshot.shoppingError ? 'alert' : undefined}>{snapshot.shoppingError ? t.unavailableContent : scopeId ? t.unavailableList : snapshot.plans.length || snapshot.events.length ? t.noList : t.noOwners}</p>{(snapshot.shoppingError || !snapshot.plans.length && !snapshot.events.length) && <Link to="/planning">{t.plans}</Link>}</div>
        : <>
          {!projection.rows.length ? <p className="pp-empty">{t.emptyList}</p> : <ShoppingRows {...{ groups, layout, t, language, cover, edit, remove, undo, undoAvailable }} scopeId={scope.id} canEdit={api.canEdit}
            notice={visibleNotice} dismiss={() => setNotice(null)} />}
          <button type="button" className="pp-text-button ps-add" disabled={!api.canEdit} onClick={() => edit('personal')}>{t.addPersonal}</button>
        </>}
    </>}
    {undoAvailable && !visibleNotice && <div className="pp-undo"><button type="button" disabled={!api.canEdit} onClick={undo}>{t.undo}</button></div>}
    {editor?.kind === 'scope' && <ShoppingScopeDialog api={dialogApi} initialScope={scope} {...{ t, language, recovery }} onClose={closeEditor} onSaved={editorSaved} />}
    {editor?.kind === 'amount' && <ShoppingAmountDialog api={dialogApi} {...{ editor, projection, t, language, recovery }} onClose={closeEditor} onSaved={editorSaved} />}
    {editor?.kind === 'personal' && <ShoppingPersonalDialog api={dialogApi} {...{ editor, projection, t, recovery }} onClose={closeEditor} onSaved={editorSaved} />}
    {remember && <PlanningDialog title={t.rememberSelection} t={t} onClose={() => { editorGeneration.current += 1; setRemember(null); }}>
      {recovery}<p>{t.rememberReview}</p>
      {(remember.error || api.error) && <p className="pp-error" role="alert">{errorText(api.error || remember.error, t)}</p>}
      <p>{snapshot?.[snapshot.scopes?.find((row) => row.id === remember.scopeId)?.owner_type === 'plan' ? 'plans' : 'events']?.find((owner) => owner.id === snapshot.scopes?.find((row) => row.id === remember.scopeId)?.owner_id)?.name}</p>
      <footer className="pp-dialog-actions"><button type="button" className="pp-primary" disabled={!api.canEdit || !snapshot?.scopes?.some((row) => row.id === remember.scopeId)} onClick={async () => {
        if (!api.canEdit) return;
        const generation = editorGeneration.current, target = remember.scopeId;
        const result = await api.run('preferences.update', { expected_revision: snapshot.preference_revision, changes: { shopping_scope_id: target } }, snapshot.revision);
        if (alive.current && result && generation === editorGeneration.current) { setRemember(null); navigate(`/shopping?scope=${encodeURIComponent(target)}`); }
      }}>{t.rememberSelection}</button><button type="button" disabled={api.busy || api.loading} onClick={() => api.reload()}>{t.reload}</button><button type="button" onClick={() => { editorGeneration.current += 1; setRemember(null); }}>{t.cancel}</button></footer>
    </PlanningDialog>}
    {proposal && <PlanningPreview preview={proposal} snapshot={snapshot} {...{ t, language, recovery }} busy={api.busy} blocked={!api.canEdit} error={api.error} onClose={closeProposal}
      onConfirm={async () => { const result = await api.run('preview.confirm', { preview_id: proposal.id }, proposal.revision); onSaved(result, 'preview.confirm'); }} />}
  </section>;
}

export default function PrivateShoppingPage() {
  const location = useLocation();
  // This nonce lives only for this page instance. Never serialize sessionKey:
  // it contains the access token and is suitable only for in-memory fencing.
  const [handoffNonce] = useState(() => crypto.randomUUID());
  const key = useAuthStore(sessionKey);
  const initialized = useAuthStore((state) => state.initialized);
  const session = verifiedSession(useAuthStore.getState());
  const settingLanguage = useSettingsStore((state) => state.language);
  const dark = useSettingsStore((state) => state.darkMode);
  const language = settingLanguage === 'de' ? 'de' : 'en';
  const t = { ...planningStrings[language], ...shoppingStrings[language] };
  const scopeId = scopeFromSearch(location.search);
  if (scopeId === 'invalid') return <section className="private-planning"><h1>{t.title}</h1><p role="alert">{t.invalidSelection}</p><Link to="/shopping">{t.chooseList}</Link></section>;
  if (!initialized || !session) return <section className="private-planning"><h1>{t.title}</h1>{!initialized ? <p role="status">{t.loading}</p> : <><p>{t.signIn}</p><Link to="/login">{t.signInAction}</Link></>}</section>;
  const handoffKey = JSON.stringify([session.accountId, session.epoch, session.requestGeneration, handoffNonce]);
  const handoffUndo = location.state?.shoppingOwnerKey === handoffKey ? location.state.shoppingUndo : null;
  return <ShoppingWorkspace key={`${key}:${scopeId || 'preferred'}`} scopeId={scopeId} fallbackLanguage={language} fallbackDark={dark} handoffUndo={handoffUndo} handoffKey={handoffKey} />;
}
