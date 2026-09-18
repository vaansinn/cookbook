import { useEffect, useId, useRef, useState } from 'react';
import { PlanningDialog } from '../planning/PlanningDialog';
import { errorText } from '../planning/planningStrings.mjs';
import { formatDate } from '../planning/planningModel.mjs';
import { amountEdit, displayAmount, initialDates, personalCommand, personalUnits, scopeCommand, twoDayRange } from './shoppingModel.mjs';

function ReviewState({ api, revision, setRevision, available = true, t, children }) {
  const changed = api.snapshot && api.snapshot.revision !== revision;
  return <>
    {children}
    {api.error && <p className="pp-error" role="alert">{errorText(api.error, t)}</p>}
    {!available && <p className="pp-error" role="alert">{t.missingRow}</p>}
    {changed && <div className="ps-review"><p>{t.changedDraft}</p><button type="button" disabled={!api.canEdit || !available} onClick={() => { api.clearError(); setRevision(api.snapshot.revision); }}>{t.reviewLatest}</button></div>}
  </>;
}
function useFormError() {
  const [error, setError] = useState(null);
  const ref = useRef(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  return { error, setError, ref };
}
export function ShoppingScopeDialog({ api, initialScope, t, language, recovery, onClose, onSaved }) {
  const [ownerValue, setOwnerValue] = useState(initialScope ? `${initialScope.owner_type}:${initialScope.owner_id}` : '');
  const [form, setForm] = useState({ mode: initialScope?.mode || 'all', selection: initialScope?.selection || [], start_date: initialScope?.start_date || '', end_date: initialScope?.end_date || '' });
  const [revision, setRevision] = useState(() => api.snapshot?.revision ?? null);
  const [loaded, setLoaded] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const failure = useFormError();
  const [ownerType, ownerId] = ownerValue.split(':');
  const owner = api.snapshot?.[ownerType === 'plan' ? 'plans' : 'events']?.find((row) => row.id === ownerId);
  const loadKey = `${ownerValue}:${revision}:${attempt}`;
  useEffect(() => {
    if (ownerType !== 'plan' || !ownerId) return;
    let active = true;
    Promise.all([
      api.read(`/plans/${ownerId}/meals`, { key: 'meals', revision }),
      api.read(`/plans/${ownerId}/events`, { key: 'links', revision }),
    ]).then(([meals, links]) => {
      if (!active) return;
      const choices = [
        ...meals.meals.map((row) => ({ key: `meal:${row.id}`, title: row.name || t.meal, date: row.date })),
        ...links.links.map((link) => ({ key: `event:${link.event.id}`, title: link.event.name, date: link.event.date, outside: !link.in_range })),
      ];
      const unique = [...new Map(choices.map((choice) => [choice.key, choice])).values()];
      setLoaded({ key: loadKey, choices: unique.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key)) });
    }, (error) => { if (active) setLoaded({ key: loadKey, error }); });
    return () => { active = false; };
  }, [ownerType, ownerId, revision, attempt, api.read, t.meal, loadKey]);
  const current = loaded?.key === loadKey ? loaded : null;
  const blocked = !api.canEdit || revision !== api.snapshot?.revision || !owner || (form.mode === 'meals' && (!current || current.error));
  function changeOwner(value) {
    setOwnerValue(value); failure.setError(null);
    const [kind, id] = value.split(':');
    const record = api.snapshot?.[kind === 'plan' ? 'plans' : 'events']?.find((row) => row.id === id);
    setForm({ mode: 'all', selection: [], ...(kind === 'plan' && record ? initialDates(record) : { start_date: '', end_date: '' }) });
  }
  const id = useId();
  return <PlanningDialog title={t.chooseList} t={t} onClose={onClose}>
    <ReviewState {...{ api, revision, setRevision, t }} available={!ownerValue || !!owner}>{recovery}</ReviewState>
    <form className="ps-form" noValidate onSubmit={async (event) => {
      event.preventDefault(); if (blocked) return;
      try {
        const payload = scopeCommand(ownerType, owner, form, current?.choices);
        failure.setError(null);
        const result = await api.run('shopping.scope', payload, revision);
        if (result) onSaved(result, 'shopping.scope');
      } catch (error) { failure.setError(error.message); }
    }}>
      <label>{t.chooseList}<select value={ownerValue} onChange={(event) => changeOwner(event.target.value)} disabled={api.busy}>
        <option value="">{t.chooseOwner}</option>
        {['plan', 'event'].map((kind) => <optgroup key={kind} label={t[kind === 'plan' ? 'plans' : 'events']}>
          {(api.snapshot?.[kind === 'plan' ? 'plans' : 'events'] || []).map((row) => <option key={row.id} value={`${kind}:${row.id}`}>{row.name}</option>)}
        </optgroup>)}
      </select></label>
      {ownerType === 'plan' && owner && <>
        <fieldset className="ps-choice-list"><legend>{t.changeSelection}</legend>{['all', 'dates', 'meals'].map((mode) => <label key={mode}>
          <input type="radio" name={`${id}-mode`} value={mode} checked={form.mode === mode} disabled={api.busy} onChange={() => setForm((value) => ({ ...value, mode, ...(!value.start_date ? initialDates(owner) : {}) }))} />{t[mode]}
        </label>)}</fieldset>
        {form.mode === 'dates' && <>
          <div className="ps-dates">{[['start_date', 'from'], ['end_date', 'to']].map(([key, label]) => <label key={key}>{t[label]}<input type="date" value={form[key]} min={owner.start_date} max={owner.end_date} required disabled={api.busy} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value }))} /></label>)}</div>
          <button type="button" className="pp-text-button" disabled={api.busy} onClick={() => {
            try { setForm((value) => ({ ...value, ...twoDayRange(owner, value.start_date) })); failure.setError(null); }
            catch (error) { failure.setError(error.message); }
          }}>{t.twoDays}</button><p className="pp-caption">{t.selectionPreview}</p>
        </>}
        {form.mode === 'meals' && <fieldset className="ps-choice-list"><legend>{t.meals}</legend>
          {!current && <p role="status">{t.loading}</p>}
          {current?.error && <div role="alert"><p>{errorText(current.error, t)}</p><button type="button" disabled={api.busy} onClick={() => setAttempt((value) => value + 1)}>{t.retryRead}</button></div>}
          {current?.choices?.map((choice) => <label key={choice.key}><input type="checkbox" checked={form.selection.includes(choice.key)} disabled={api.busy}
            onChange={(event) => setForm((value) => ({ ...value, selection: event.target.checked ? [...value.selection, choice.key] : value.selection.filter((key) => key !== choice.key) }))} />
            <span>{choice.title}<small>{formatDate(choice.date, language)}{choice.outside ? ` · ${t.outsideSelection}` : ''}</small></span></label>)}
          {current?.choices?.length === 0 && <p>{t.noChoices}</p>}
          {!form.selection.length && <p className="pp-caption">{t.emptySelection}</p>}
        </fieldset>}
      </>}
      <p className="pp-caption">{t.selectionHelp}</p>
      {failure.error && <p className="pp-error" role="alert" tabIndex={-1} ref={failure.ref}>{t[failure.error] || t.invalidSelection}</p>}
      <footer className="pp-dialog-actions"><button className="pp-primary" disabled={blocked} type="submit">{api.busy ? t.saving : t.applySelection}</button><button type="button" onClick={onClose}>{t.cancel}</button></footer>
    </form>
  </PlanningDialog>;
}

export function ShoppingAmountDialog({ api, editor, projection, t, language, recovery, onClose, onSaved }) {
  const [value, setValue] = useState(editor.row.total);
  const [revision, setRevision] = useState(editor.revision);
  const [announcement, setAnnouncement] = useState('');
  const failure = useFormError();
  const id = useId();
  const current = projection?.scope.id === editor.scopeId && projection.rows.find((row) => row.key === editor.row.key);
  const row = current || editor.row;
  const blocked = !api.canEdit || !current || revision !== api.snapshot?.revision;
  function validate(correct) {
    const result = amountEdit(value, row, correct);
    setValue(result.value); failure.setError(result.error);
    if (result.corrected) setAnnouncement(`${t.resetMinimum} ${displayAmount(row.required, row.unit, language, t)}`);
    return result;
  }
  return <PlanningDialog title={`${t.changeAmount}: ${row.label}`} t={t} onClose={onClose}>
    <ReviewState {...{ api, revision, setRevision, t }} available={!!current}>{recovery}</ReviewState>
    <form className="ps-form" noValidate onSubmit={async (event) => {
      event.preventDefault(); if (blocked) return;
      const result = validate(true); if (result.error) return;
      const saved = await api.run('shopping.extra', { scope_id: editor.scopeId, row_key: row.key, amount: result.extra }, revision);
      if (saved) onSaved(saved, 'shopping.extra');
    }}>
      <label htmlFor={`${id}-amount`}>{t.amountLabel}<input id={`${id}-amount`} type="text" inputMode="decimal" value={value} aria-invalid={!!failure.error} aria-describedby={`${id}-hint ${id}-error`} disabled={api.busy}
        onChange={(event) => { setValue(event.target.value); setAnnouncement(''); }} onBlur={() => { if (!blocked) validate(true); }} /></label>
      <p id={`${id}-hint`} className="pp-caption">{t.minimum}: {displayAmount(row.required, row.unit, language, t)}</p>
      <p role="status">{announcement}</p><p id={`${id}-error`} className="pp-error" role="alert" tabIndex={-1} ref={failure.ref}>{failure.error ? t[failure.error] : ''}</p>
      <footer className="pp-dialog-actions"><button type="submit" className="pp-primary" disabled={blocked}>{api.busy ? t.saving : t.save}</button><button type="button" onClick={onClose}>{t.cancel}</button>
        {row.extra !== '0.000' && row.extra !== '0' && <button type="button" className="pp-text-button" disabled={blocked} onClick={async () => {
          const result = await api.run('shopping.extra', { scope_id: editor.scopeId, row_key: row.key, amount: '0.000' }, revision);
          if (result) onSaved(result, 'shopping.extra');
        }}>{t.removeExtra}</button>}
      </footer>
    </form>
  </PlanningDialog>;
}

export function ShoppingPersonalDialog({ api, editor, projection, t, recovery, onClose, onSaved }) {
  const [form, setForm] = useState({ title: editor.row?.label || '', amount: editor.row?.total || '', unit: editor.row?.unit || '' });
  const [revision, setRevision] = useState(editor.revision);
  const failure = useFormError();
  const available = projection?.scope.id === editor.scopeId && (!editor.row || projection.rows.some((row) => row.personal_id === editor.row.personal_id));
  const blocked = !api.canEdit || !available || revision !== api.snapshot?.revision;
  const id = useId();
  return <PlanningDialog title={editor.row ? t.editPersonal : t.addPersonal} t={t} onClose={onClose}>
    <ReviewState {...{ api, revision, setRevision, t }} available={available}>{recovery}</ReviewState>
    <form className="ps-form" noValidate onSubmit={async (event) => {
      event.preventDefault(); if (blocked) return;
      try {
        const { operation, payload } = personalCommand(editor.scopeId, editor.row, form);
        failure.setError(null); const result = await api.run(operation, payload, revision);
        if (result) onSaved(result, operation);
      } catch (error) { failure.setError(error.message); }
    }}>
      <label>{t.itemName}<input value={form.title} maxLength={160} required disabled={api.busy} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} aria-describedby={`${id}-error`} /></label>
      <div className="ps-dates"><label>{t.optionalAmount}<input type="text" inputMode="decimal" value={form.amount} disabled={api.busy} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} aria-describedby={`${id}-error`} /></label>
        <label>{t.unit}<select value={form.unit} disabled={api.busy} onChange={(event) => setForm((value) => ({ ...value, unit: event.target.value }))}><option value="">{t.noUnit}</option>{personalUnits.map((unit) => <option key={unit} value={unit}>{t[`unit_${unit}`]}</option>)}</select></label></div>
      <p id={`${id}-error`} className="pp-error" role="alert" ref={failure.ref} tabIndex={-1}>{failure.error ? t[failure.error] || t.invalidPersonalAmount : ''}</p>
      <footer className="pp-dialog-actions"><button className="pp-primary" disabled={blocked} type="submit">{api.busy ? t.saving : t.save}</button><button type="button" onClick={onClose}>{t.cancel}</button></footer>
    </form>
  </PlanningDialog>;
}
