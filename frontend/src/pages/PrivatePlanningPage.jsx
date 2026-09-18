import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useSettingsStore from '../store/useSettingsStore';
import usePlanningWorkspace from '../components/planning/usePlanningWorkspace';
import { destructiveOperations, editorReview, planningRoute, sessionKey, verifiedSession } from '../components/planning/planningModel.mjs';
import { planningStrings, errorText } from '../components/planning/planningStrings.mjs';
import { PlanningEditor, PlanningItemPreview, PlanningPreview } from '../components/planning/PlanningDialog';
import { PlanningBoard, PlanningEvent, PlanningList } from '../components/planning/PlanningViews';
import PlanningRecovery from '../components/planning/PlanningRecovery';
import PlanningTemplates from '../components/planning/PlanningTemplates';
import LangSwitch from '../components/LangSwitch';
import ThemeSwitch from '../components/ThemeSwitch';
import '../styles/private-planning.css';

function PrivateWorkspace({ route, t, language }) {
  const navigate = useNavigate();
  const [boardPage, setBoardPage] = useState({ id: route.id, offset: 0 });
  const offset = boardPage.id === route.id ? boardPage.offset : 0;
  const workspace = usePlanningWorkspace({ ...route, offset });
  const { snapshot, busy, canEdit } = workspace;
  const [editor, setEditor] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [itemPreview, setItemPreview] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setEditor(null); setProposal(null); setItemPreview(null); setTemplateEditor(null);
  }, [route.area, route.id]);
  useEffect(() => {
    if (!workspace.undo) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [workspace.undo]);

  function edit(operation, record = {}) {
    if (!canEdit) return;
    workspace.clearError();
    setEditor({ operation, record, language, revision: snapshot.revision, snapshot });
  }
  async function remove(operation, payload, revision = snapshot?.revision) {
    const next = await workspace.preview(operation, payload, revision);
    if (next) { setEditor(null); setTemplateEditor(null); setProposal(next); }
  }
  const closeProposal = () => {
    const id = proposal?.id;
    setProposal(null);
    // A command that is already submitted must be reconciled through its outbox.
    if (!busy && !workspace.pending) workspace.cancelPreview(id);
  };
  const shared = { snapshot, t, language, canEdit, edit, remove, command: workspace.run,
    templateAction: (mode, parent_type, parent_id) => { if (canEdit) setTemplateEditor({ mode, parent_type, parent_id, revision: snapshot.revision }); },
    previewItem: (record) => setItemPreview(record), offset, setOffset: (value) => setBoardPage({ id: route.id, offset: value }) };
  const selected = snapshot?.[route.area]?.find((row) => row.id === route.id);
  const review = editor ? editorReview(editor, snapshot) : null;
  function onConfirmed(result, operation) {
    if (!result) return;
    setEditor(null); setProposal(null);
    // A receipt identifies the destination, not its present existence. The route
    // reloads a common-revision snapshot and can legitimately show unavailable.
    if (operation === 'plan.copy' && result.plan?.id) navigate(`/planning/plans/${result.plan.id}`);
    if (operation === 'event.copy' && result.event?.id) navigate(`/planning/events/${result.event.id}`);
  }
  const recovery = <PlanningRecovery key={workspace.pending?.body || 'empty'} pending={workspace.pending} t={t}
    busy={busy || workspace.loading} error={workspace.error} run={workspace.run} onRetried={onConfirmed} />;
  return <>
    <div className="pp-load-bar"><span role="status" aria-live="polite">{workspace.loading ? t.loading : busy ? t.saving : workspace.saved ? t.saved : ''}</span><button type="button" disabled={busy || workspace.loading} onClick={workspace.reload}>{t.reload}</button></div>
    {workspace.error && <div className="pp-error" role="alert"><p>{errorText(workspace.error, t)}</p>{['account_deleted', 'account_deletion_pending'].includes(workspace.error.code) && <Link className="pp-back" to="/settings">{t.reviewAccountSettings}</Link>}</div>}
    {!editor && !proposal && !templateEditor && recovery}
    {snapshot && <div className="pp-template-access"><Link className="pp-back" to="/shopping">{t.shopping}</Link><button type="button" className="pp-text-button" disabled={!canEdit} onClick={() => setTemplateEditor({ mode: 'manage', revision: snapshot.revision })}>{t.templateManage}</button></div>}
    {snapshot && (route.area === 'missing' || (route.id && !selected) ? <p className="pp-empty">{t.notFound}</p>
      : !route.id ? <PlanningList area={route.area} {...shared} />
        : route.area === 'plans' ? <PlanningBoard key={selected.id} plan={selected} {...shared} />
          : <PlanningEvent event={selected} {...shared} />)}
    {workspace.undo && workspace.undo.revision === snapshot?.revision && Date.parse(workspace.undo.expires) > now && <div className="pp-undo">
      <button type="button" disabled={!canEdit} onClick={() => workspace.run('undo.apply', { undo_id: workspace.undo.id }, workspace.undo.revision)}>{t.undo}</button>
      <p>{t.undoNote} {new Date(workspace.undo.expires).toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-GB')}</p>
    </div>}
    {editor && <PlanningEditor key={`${editor.operation}:${editor.record.id || 'new'}`} editor={editor} snapshot={editor.snapshot} t={t}
      busy={busy} blocked={!!workspace.pending || workspace.loading || workspace.stale || review.changed || !review.available || workspace.error?.readOnly}
      recovery={recovery} review={review} canReview={canEdit} onReload={workspace.reload}
      onReviewLatest={() => {
        if (canEdit && review.available) {
          workspace.clearError();
          setEditor((draft) => ({ ...draft, revision: snapshot.revision, snapshot }));
        }
      }}
      error={workspace.error} read={workspace.read}
      onClose={() => setEditor(null)} onSubmit={async ({ operation, payload }) => {
        if (destructiveOperations.has(operation)) await remove(operation, payload, editor.revision);
        else {
          const result = await workspace.run(operation, payload, editor.revision);
          onConfirmed(result, operation);
        }
      }} />}
    {proposal && <PlanningPreview preview={proposal} snapshot={snapshot} language={language} t={t} busy={busy}
      blocked={!!workspace.pending || workspace.loading || workspace.stale || workspace.error?.readOnly} recovery={recovery} error={workspace.error}
      onClose={closeProposal} onConfirm={async () => {
        if (await workspace.run('preview.confirm', { preview_id: proposal.id }, proposal.revision)) setProposal(null);
      }} />}
    {itemPreview && <PlanningItemPreview item={itemPreview} revision={snapshot?.revision} read={workspace.read} t={t} language={language} onClose={() => setItemPreview(null)} />}
    {templateEditor && <PlanningTemplates editor={templateEditor} api={workspace} t={t} onClose={() => setTemplateEditor(null)} onRemove={remove} />}
  </>;
}

export default function PrivatePlanningPage() {
  const location = useLocation();
  const key = useAuthStore(sessionKey);
  const initialized = useAuthStore((state) => state.initialized);
  const session = verifiedSession(useAuthStore.getState());
  const settingLanguage = useSettingsStore((state) => state.language);
  const darkMode = useSettingsStore((state) => state.darkMode);
  const language = settingLanguage === 'de' ? 'de' : 'en';
  const t = planningStrings[language];
  const route = planningRoute(location.pathname);
  return <section className="private-planning" lang={language} aria-labelledby="private-planning-title">
    <nav className="pp-utility" aria-label={t.title}><Link to="/">{t.home}</Link><Link to="/plans">{t.legacy}</Link></nav>
    <div className="pp-title-row"><h1 id="private-planning-title" tabIndex={-1}>{t.title}</h1>
      <div className="pp-preferences"><div role="group" aria-label={`${t.language}: ${language.toUpperCase()}`}><LangSwitch /></div><div role="group" aria-label={`${t.theme}: ${darkMode ? t.dark : t.light}`}><ThemeSwitch /></div></div>
    </div>
    <nav className="pp-tabs" aria-label={t.title}><Link to="/planning/plans" aria-current={route.area === 'plans' ? 'page' : undefined}>{t.plans}</Link><Link to="/planning/events" aria-current={route.area === 'events' ? 'page' : undefined}>{t.events}</Link></nav>
    <details className="pp-foundation"><summary>{t.foundationSummary}</summary><p>{t.foundationBody}</p></details>
    {!initialized ? <p role="status">{t.loading}</p> : session ? <PrivateWorkspace key={key} route={route} t={t} language={language} />
      : <div className="pp-empty"><p>{t.signIn}</p><Link to="/login">{t.signInAction}</Link></div>}
  </section>;
}
