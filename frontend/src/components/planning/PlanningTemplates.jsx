import { useEffect, useState } from 'react';
import { PlanningDialog } from './PlanningDialog';
import PlanningRecovery from './PlanningRecovery';
import { errorText } from './planningStrings.mjs';

// The modal owns only its unsaved fields. Account/session fencing, persistence
// and exact request recovery remain in the shared planning workspace adapter.
export default function PlanningTemplates({ editor, api, t, onClose, onRemove }) {
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState('');
  const [revision, setRevision] = useState(editor.revision);
  const [resource, setResource] = useState({ loading: true, rows: [], error: null });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const baseline = api.snapshot?.revision;
    setResource((value) => ({ ...value, loading: true, error: null }));
    api.read('/templates', { key: 'templates', revision: baseline }).then((value) => {
      if (active) setResource({ loading: false, rows: value.templates, error: null });
    }).catch((error) => { if (active) setResource((value) => ({ ...value, loading: false, error })); });
    return () => { active = false; };
  }, [api.read, api.snapshot?.revision, refresh]);
  const changed = revision !== api.snapshot?.revision;
  const rows = resource.rows.filter((row) => editor.mode === 'manage' || row.kind === (editor.parent_type === 'event' ? 'menu' : 'meal'));
  const blocked = !api.canEdit || changed || (editor.mode !== 'save' && (resource.loading || resource.error));
  async function submit(event) {
    event.preventDefault();
    if (blocked) return;
    const operation = editor.mode === 'save' ? 'template.save' : editor.mode === 'apply' ? 'template.apply' : 'template.rename';
    const payload = editor.mode === 'save' ? { parent_type: editor.parent_type, parent_id: editor.parent_id, name }
      : editor.mode === 'apply' ? { parent_type: editor.parent_type, parent_id: editor.parent_id, template_id: chosen }
        : { template_id: chosen, name };
    if (await api.run(operation, payload, revision)) onClose();
  }
  return <PlanningDialog title={t[editor.mode === 'save' ? 'templateSave' : editor.mode === 'apply' ? 'templateApply' : 'templateManage']} t={t} onClose={onClose}>
    <PlanningRecovery key={api.pending?.body || 'empty'} pending={api.pending} t={t} busy={api.busy || api.loading} error={api.error} run={api.run} onRetried={(result, op) => { if (op.startsWith('template.')) onClose(); }} />
    {api.error && <p className="pp-error" role="alert">{errorText(api.error, t)}</p>}
    {resource.error && <div role="alert"><p>{errorText(resource.error, t)}</p><button type="button" disabled={api.busy} onClick={() => setRefresh((value) => value + 1)}>{t.retryRead}</button></div>}
    {changed && <div className="pp-error"><p>{t.formChanged}</p><button type="button" disabled={!api.canEdit || resource.loading} onClick={() => setRevision(api.snapshot.revision)}>{t.reviewLatest}</button></div>}
    <form onSubmit={submit}>
      {editor.mode !== 'save' && <label className="pp-field"><span>{t.templateChoose}</span><select value={chosen} required onChange={(event) => {
        setChosen(event.target.value); if (editor.mode === 'manage') setName(rows.find((row) => row.id === event.target.value)?.name || '');
      }}><option value="">{resource.loading ? t.loading : t.choose}</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      {editor.mode !== 'save' && !resource.loading && !resource.error && !rows.length && <p>{t.templateEmpty}</p>}
      {editor.mode !== 'apply' && <label className="pp-field"><span>{t.templateName}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></label>}
      {editor.mode === 'apply' && <p className="pp-caption">{t.templateIndependent}</p>}
      <footer className="pp-dialog-actions"><button className="pp-primary" disabled={blocked || (editor.mode !== 'save' && !rows.some((row) => row.id === chosen))}>{t[editor.mode === 'apply' ? 'templateApply' : 'save']}</button>
        {editor.mode === 'manage' && <button type="button" className="pp-danger" disabled={blocked || !rows.some((row) => row.id === chosen)} onClick={() => onRemove('template.delete', { template_id: chosen }, revision)}>{t['template.delete']}</button>}
        <button type="button" onClick={onClose}>{t.cancel}</button></footer>
    </form>
  </PlanningDialog>;
}
