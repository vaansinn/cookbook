import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { boundItemReady, commandFromForm, destructiveOperations, formatDate, formatQuantity, itemUnits, previewGroups, previewRecordLabel, previewTargetTitle, previewUsable, today } from './planningModel.mjs';
import { errorText } from './planningStrings.mjs';

export function PlanningDialog({ title, t, children, onClose }) {
  const dialog = useRef(null);
  const heading = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const node = dialog.current;
    const origin = document.activeElement;
    node.showModal();
    node.querySelector('input:not([disabled]), select:not([disabled])')?.focus();
    return () => {
      if (node.open) node.close();
      if (origin?.isConnected) origin.focus();
      else document.querySelector('.private-planning h1')?.focus();
    };
  }, []);
  return <dialog ref={dialog} className="pp-dialog" aria-labelledby={heading}
    onCancel={(event) => { event.preventDefault(); close.current(); }}>
    <header className="pp-dialog-heading"><h2 id={heading}>{title}</h2><button type="button" onClick={onClose}>{t.close}</button></header>
    {children}
  </dialog>;
}

function Field({ name, label, value, type = 'text', children, controlled = false, ...props }) {
  const id = useId();
  return <label className="pp-field" htmlFor={id}><span>{label}</span>
    {children ? <select id={id} name={name} {...(controlled ? { value: value ?? '' } : { defaultValue: value ?? '' })} {...props}>{children}</select>
      : <input id={id} name={name} type={type} {...(controlled ? { value: value ?? '' } : { defaultValue: value ?? '' })} maxLength={type === 'text' ? 160 : undefined} {...props} />}
  </label>;
}

export function PlanningEditor({ editor, snapshot, t, busy, blocked, recovery, review, canReview, onReviewLatest, onReload, error, onSubmit, onClose, read }) {
  const [localError, setLocalError] = useState(null);
  const [target, setTarget] = useState(editor.record?.plan_id || '');
  const itemController = usePlanningItemController(editor, snapshot, read);
  const itemReady = itemController.ready;
  const alertRef = useRef(null);
  const op = editor.operation, row = editor.record || {};
  const creating = op.endsWith('.create');
  const repeating = op === 'plan.copy' || op === 'event.copy';
  const transfer = op === 'meal.move' || op === 'meal.copy';
  const linking = op === 'event.link';
  const isPlan = op.startsWith('plan.');
  const isMeal = op.startsWith('meal.');
  const isEvent = op.startsWith('event.') && !linking;
  const isTask = op.startsWith('task.');
  const isItem = op.startsWith('item.');
  const destination = snapshot.plans.find((plan) => plan.id === (transfer ? target : row.plan_id));
  const invalidTargets = linking ? !snapshot.plans.length || !snapshot.events.length : transfer && !snapshot.plans.length;
  const message = localError ? errorText(localError, t) : error ? errorText(error, t) : null;
  useEffect(() => { if (message) alertRef.current?.focus(); }, [message]);
  return <PlanningDialog title={t[op]} t={t} onClose={onClose}>
    <p className="pp-caption">{t.localFields}</p>
    {repeating && <p className="pp-caption">{op === 'plan.copy' ? t.planAgainNote : t.eventAgainNote}</p>}
    {recovery}
    {review?.changed && <section className="pp-form-review" aria-label={t.reviewLatest}>
      <p role="status">{t.formChanged}</p>
      {review.record && <details><summary>{t.latestValues}</summary><PreviewRecords records={[review.record]} t={t} language={editor.language} /></details>}
      {!review.available && <p>{t.notFound}</p>}
      <button type="button" disabled={!canReview || !review.available} onClick={onReviewLatest}>{t.reviewLatest}</button>
    </section>}
    {blocked && !busy && <button type="button" onClick={onReload}>{t.reload}</button>}
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy || blocked || (isItem && !itemReady)) return;
      setLocalError(null);
      try { await onSubmit(commandFromForm(editor, Object.fromEntries(new FormData(event.currentTarget)))); }
      catch (err) { setLocalError(err); }
    }}>
      {message && <p className="pp-error" role="alert" tabIndex={-1} ref={alertRef}>{message}</p>}
      {['account_deleted', 'account_deletion_pending'].includes(error?.code) && <Link className="pp-back" to="/settings">{t.reviewAccountSettings}</Link>}
      <fieldset disabled={busy || blocked} className="pp-fields">
        {isItem && <PlanningItemFields editor={editor} snapshot={snapshot} t={t} controller={itemController} />}
        {((isPlan && op !== 'plan.resize') || (isMeal && !transfer) || isEvent) && <Field name="name" label={isMeal ? t.optionalName : t.name} value={row.name} required={!isMeal} />}
        {isPlan && op !== 'plan.rename' && <><Field name="start_date" label={t.start_date} type="date" value={repeating ? today() : row.start_date || today()} required />{!repeating && <Field name="end_date" label={t.end_date} type="date" value={row.end_date || today()} required />}</>}
        {(transfer || linking) && <Field name="plan_id" label={t.plan_id} value={row.plan_id || ''} required onChange={(event) => setTarget(event.target.value)}>
          <option value="">{t.choose}</option>{snapshot.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.start_date} – {plan.end_date})</option>)}
        </Field>}
        {linking && <Field name="event_id" label={t.event_id} value={row.event_id || ''} required><option value="">{t.choose}</option>{snapshot.events.map((event) => <option key={event.id} value={event.id}>{event.name} ({event.date})</option>)}</Field>}
        {(isEvent || transfer || (isMeal && creating)) && <Field key={transfer ? target : 'date'} name="date" label={t.date} type="date"
          value={repeating ? today() : transfer ? destination?.start_date || row.date : row.date || today()} min={isMeal ? destination?.start_date : undefined} max={isMeal ? destination?.end_date : undefined} required />}
        {((isMeal && !transfer) || (isEvent && !repeating)) && <Field name="time" label={t.time} value={row.time} type="time" />}
        {isEvent && !repeating && <Field name="guests" label={t.guests} value={row.guests ?? 2} type="number" min="1" max="1000" step="1" required />}
        {isTask && <><Field name="text" label={t.text} value={row.text} required /><Field name="bucket" label={t.bucket} value={row.bucket || 'earlier'} required>
          {['earlier', 'day', 'serving'].map((bucket) => <option key={bucket} value={bucket}>{t[bucket]}</option>)}
        </Field>{!creating && <label className="pp-check"><input type="checkbox" name="done" defaultChecked={row.done} /><span>{t.done}</span></label>}</>}
      </fieldset>
      {invalidTargets && <p>{linking ? t.noTargets : t.noPlans}</p>}
      <footer className="pp-dialog-actions"><button type="submit" className="pp-primary" disabled={busy || blocked || invalidTargets || (isItem && !itemReady)}>{busy ? t.saving : destructiveOperations.has(op) ? t.review : t.save}</button><button type="button" onClick={onClose}>{t.cancel}</button></footer>
    </form>
  </PlanningDialog>;
}

// Each read is tied to its exact selector and effect lifetime. Rapid selection,
// dialog closure, auth changes and workspace revalidation cannot paint old data.
function usePlanningRead(read, path, key, revision) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({});
  const identity = JSON.stringify([path, key, revision, attempt]);
  useEffect(() => {
    let active = true;
    if (!path) return () => { active = false; };
    setState({ identity, loading: true });
    read(path, { key, revision }).then((data) => {
      if (active) setState({ identity, data, loading: false });
    }, (error) => { if (active) setState({ identity, error, loading: false }); });
    return () => { active = false; };
  }, [read, path, key, revision, attempt]);
  return { ...(state.identity === identity ? state : { loading: !!path }), reload: () => setAttempt((value) => value + 1) };
}

function ReadFeedback({ resource, t }) {
  return <>{resource.loading && <p role="status" className="pp-caption">{t.loadingItems}</p>}
    {resource.error && <div role="alert" className="pp-error"><p>{errorText(resource.error, t)}</p><button type="button" onClick={resource.reload}>{t.retryRead}</button></div>}</>;
}

// The editor owns the controller, so the footer and submit guard see selector
// changes and their read identity in the same render as the fields themselves.
function usePlanningItemController(editor, snapshot, read) {
  const row = editor.record || {};
  const active = editor.operation.startsWith('item.');
  const creating = editor.operation === 'item.create';
  const transfer = ['item.move', 'item.copy'].includes(editor.operation);
  const [kind, setKind] = useState(row.kind || 'personal');
  const [parentType, setParentType] = useState(row.event_id ? 'event' : 'meal');
  const [parentId, setParentId] = useState('');
  const [planId, setPlanId] = useState(snapshot.meals.find((meal) => meal.id === row.meal_id)?.plan_id || '');
  const [language, setLanguage] = useState(row.language || editor.language || 'en');
  const [choice, setChoice] = useState('');
  const [variantId, setVariantId] = useState(row.options?.variant_id || '');
  const eventParent = creating ? row.parent_type === 'event' : !!row.event_id;
  const event = snapshot.events.find((event) => event.id === (row.event_id || row.parent_id));
  const [follows, setFollows] = useState(creating ? eventParent : !!row.follows_guests);
  const [servings, setServings] = useState(row.servings || event?.guests || 2);
  const effectiveServings = eventParent && follows ? event?.guests ?? row.servings ?? 2 : servings;
  const catalog = usePlanningRead(read, active && !transfer && kind === 'dish' && creating ? `/catalog?language=${language}` : null);
  const entries = catalog.data?.entries || [];
  const selection = entries.find((entry) => `${entry.entry_id}:${entry.revision}` === choice);
  const entryId = creating ? selection?.entry_id : row.entry_id;
  const catalogRevision = creating ? selection?.revision : row.catalog_revision;
  const detail = usePlanningRead(read, active && !transfer && kind === 'dish' && entryId ? `/catalog/${entryId}/${catalogRevision}?language=${language}` : null);
  const variants = detail.data?.variants || [];
  const variant = variants.find((entry) => entry.id === variantId);
  const destinations = usePlanningRead(read, transfer && parentType === 'meal' && planId ? `/plans/${planId}/meals` : null, 'meals', editor.revision);
  const targets = parentType === 'meal' ? destinations.data?.meals || [] : snapshot.events;
  const ready = boundItemReady({ active, transfer, parentType, parentId, targets, destinations, kind, creating, catalog, selection, detail, variant });
  return { ready, row, creating, transfer, kind, setKind, parentType, setParentType, parentId, setParentId, planId, setPlanId,
    language, setLanguage, choice, setChoice, variantId, setVariantId, eventParent, event, follows, setFollows,
    setServings, effectiveServings, catalog, entries, entryId, catalogRevision, detail, variants, variant, destinations, targets };
}

function PlanningItemFields({ editor, snapshot, t, controller }) {
  const { row, creating, transfer, kind, setKind, parentType, setParentType, parentId, setParentId, planId, setPlanId,
    language, setLanguage, choice, setChoice, variantId, setVariantId, eventParent, event, follows, setFollows,
    setServings, effectiveServings, catalog, entries, entryId, catalogRevision, detail, variants, variant, destinations, targets } = controller;

  if (transfer) return <>
    <p className="pp-caption">{t.itemTransferNote}</p>
    <Field controlled name="parent_type" label={t.destinationType} value={parentType} onChange={(event) => { setParentType(event.target.value); setParentId(''); }}>
      <option value="meal">{t.meal}</option><option value="event">{t.events}</option>
    </Field>
    {parentType === 'meal' && <><Field controlled name="destination_plan" label={t.plan_id} value={planId} required onChange={(event) => { setPlanId(event.target.value); setParentId(''); }}>
      <option value="">{t.choose}</option>{snapshot.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
    </Field><ReadFeedback resource={destinations} t={t} /></>}
    <Field controlled name="parent_id" label={t.itemDestination} value={parentId} required onChange={(event) => setParentId(event.target.value)}>
      <option value="">{t.choose}</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.name || t.meal} · {target.date}{target.time ? ` · ${target.time}` : ''}</option>)}
      {parentId && !targets.some((target) => target.id === parentId) && <option value={parentId} disabled>{destinations.loading ? t.loadingItems : t.notFound}</option>}
    </Field>
    {!targets.length && !destinations.loading && <p className="pp-caption">{t.noItemTargets}</p>}
  </>;

  return <>
    {creating && <Field controlled name="kind" label={t.itemKind} value={kind} onChange={(event) => setKind(event.target.value)}>
      {['personal', 'note', 'dish'].map((value) => <option key={value} value={value}>{t[`kind_${value}`]}</option>)}
    </Field>}
    {kind !== 'dish' ? <>
      <Field name="title" label={kind === 'note' ? t.kind_note : t.name} value={row.title} required />
      {kind === 'personal' && <div className="pp-field-pair"><Field name="quantity" label={t.optionalQuantity} type="number" min="0.001" max="1000000" step="0.001" value={row.quantity} />
        <Field name="unit" label={t.unit} value={row.unit}><option value="">{t.choose}</option>{itemUnits.map((unit) => <option key={unit} value={unit}>{t[`unit_${unit}`] || unit}</option>)}</Field></div>}
    </> : <>
      {creating ? <>
        <Field controlled name="language" label={t.language} value={language} onChange={(event) => { setLanguage(event.target.value); setChoice(''); setVariantId(''); }}><option value="en">English</option><option value="de">Deutsch</option></Field>
        <ReadFeedback resource={catalog} t={t} />
        {catalog.data && !entries.length && <p className="pp-caption" role="status">{t.catalogEmpty}</p>}
        <Field controlled key={language} name="catalog_selection" label={t.publishedDish} value={choice} required onChange={(event) => { setChoice(event.target.value); setVariantId(''); }}>
          <option value="">{t.choose}</option>{entries.map((entry) => <option key={`${entry.entry_id}:${entry.revision}`} value={`${entry.entry_id}:${entry.revision}`}>{entry.variants.map((variant) => variant.title).join(' / ')}</option>)}
        </Field><input type="hidden" name="entry_id" value={entryId || ''} /><input type="hidden" name="catalog_revision" value={catalogRevision || ''} />
      </> : <p className="pp-caption">{row.entry_id} · {t.language}: {row.language.toUpperCase()}</p>}
      <ReadFeedback resource={detail} t={t} />
      <Field controlled key={`${entryId}:${catalogRevision}:${language}`} name="variant_id" label={t.dishOption} value={variantId} required onChange={(event) => setVariantId(event.target.value)}>
        <option value="">{t.choose}</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.title}</option>)}
      </Field>
      {eventParent && <label className="pp-check"><input name="follows_guests" type="checkbox" checked={follows} onChange={(change) => {
        if (!change.target.checked) setServings(effectiveServings);
        setFollows(change.target.checked);
      }} /><span>{t.followsGuests}{event ? ` (${event.guests})` : ''}</span></label>}
      <Field controlled name="servings" label={t.servings} type="number" min="1" max="1000" step="1" value={effectiveServings} onChange={(change) => setServings(change.target.value)} disabled={eventParent && follows} required />
      {variant && <details className="pp-catalog-preview"><summary>{t.authoredPreview}</summary><CatalogContent content={{ ...detail.data, ...variant }} t={t} language={editor.language} authored /></details>}
    </>}
    <Field name="group" label={t.optionalGroup} value={row.group} />
    <Field name="contribution" label={t.contribution} value={row.contribution} />
    <p className="pp-caption">{t.contributionHelp}</p>
  </>;
}

function CatalogContent({ content, t, language, authored = false }) {
  return <section className="pp-catalog-content" lang={content.language}>
    <h3>{content.title}</h3>
    <p className="pp-caption">{authored ? t.authoredFor : t.resolvedFor}: {formatQuantity(authored ? content.base_servings : content.servings, language)} {t.servingsCount}</p>
    {content.kind === 'planning_example' && <p className="pp-caption">{t.planningExample}</p>}
    <h4>{t.ingredients}</h4><ul>{(content.ingredients || []).map((ingredient) => <li key={`${ingredient.ingredient_id}:${ingredient.form}:${ingredient.unit}`}>
      <span>{ingredient.label || `${ingredient.ingredient_id} · ${ingredient.form}`}</span><span>{formatQuantity(ingredient.amount, language)} {t[`unit_${ingredient.unit}`] || ingredient.unit}</span>
    </li>)}</ul>
    {content.kind === 'recipe' && <>
      <p className="pp-caption">{content.time_min} {t.minutes}</p>
      {!!content.equipment?.length && <><h4>{t.equipment}</h4><ul>{content.equipment.map((entry, i) => <li key={i}>{entry}</li>)}</ul></>}
      {!!content.method?.length && <details><summary>{t.method}</summary><ol>{content.method.map((entry, i) => <li key={i}>{entry}</li>)}</ol></details>}
    </>}
    <p className="pp-caption">{t.previewOnly}</p>
  </section>;
}

export function PlanningItemPreview({ item, revision, read, t, language, onClose }) {
  const resource = usePlanningRead(read, revision === undefined ? null : `/items/${item.id}/preview`, undefined, revision);
  return <PlanningDialog title={resource.data?.preview?.title || t.itemPreview} t={t} onClose={onClose}>
    <ReadFeedback resource={resource} t={t} />
    {resource.data?.preview && <CatalogContent content={resource.data.preview} t={t} language={language} />}
    {!resource.loading && <button type="button" onClick={resource.reload}>{t.retryRead}</button>}
  </PlanningDialog>;
}

export function PreviewRecords({ records, t, language, labelContext }) {
  return <ul className="pp-records">{records.map((record) => <li key={record.id}>
    <strong>{previewRecordLabel(record, labelContext)}</strong>
    {(record.date || record.start_date) && <span> · {record.date || `${record.start_date} – ${record.end_date}`}{record.time ? ` · ${record.time}` : ''}</span>}
    {record.kind && <p className="pp-caption">{t[`kind_${record.kind}`] || record.kind}{record.group ? ` · ${record.group}` : ''}{record.quantity && record.unit ? ` · ${formatQuantity(record.quantity, language)} ${t[`unit_${record.unit}`] || record.unit}` : ''}{record.servings ? ` · ${formatQuantity(record.servings, language)} ${t.servingsCount}` : ''}</p>}
    <details><summary>{t.recordDetails}</summary><dl>{Object.entries(record).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}</dd></div>)}</dl></details>
  </li>)}</ul>;
}

export function PlanningPreview({ preview, snapshot, language, t, busy, blocked, recovery, error, onConfirm, onClose }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const valid = previewUsable(preview, snapshot?.revision, now);
  const groups = previewGroups(preview).filter(({ kind, count }) => count > 0 && kind !== 'shopping_scopes');
  const removedSelections = preview.effects.removed_shopping_selections || [];
  const targetTitle = previewTargetTitle(preview);
  return <PlanningDialog title={`${t[preview.operation]}${targetTitle ? `: ${targetTitle}` : ''}`} t={t} onClose={onClose}>
    {recovery}
    <p>{t.reviewBody}</p><p className="pp-caption">{preview.operation === 'plan.resize' ? t.resizeEffect : preview.operation === 'meal.move' ? t.moveEffect : preview.operation === 'shopping.personal.delete' ? t.personalDeleteEffect : preview.operation === 'shopping.scope.delete' ? t.scopeDeleteEffect : t.deleteEffect}</p>
    {preview.operation === 'plan.resize' && <p>{formatDate(preview.payload.start_date, language)} – {formatDate(preview.payload.end_date, language)}</p>}
    <div className="pp-effects">{groups.map(({ kind, records, count }) => <section key={kind}>
      <h3>{t[`effects${kind[0].toUpperCase()}${kind.slice(1)}`] || kind} <span>({count})</span></h3>
      <PreviewRecords records={records} t={t} language={language} labelContext={{ kind, snapshot, revision: preview.revision, affected: preview.effects.affected }} />
    </section>)}</div>
    {removedSelections.length > 0 && <section className="pp-error"><h3>{t.shoppingSelectionsRemoved}</h3>
      <p>{t.shoppingSelectionLoss}</p><ul>{removedSelections.map((selection) => <li key={selection.id}>
        <strong>{selection.name}</strong>{selection.start_date && <span> · {selection.start_date} – {selection.end_date}</span>}
        <p>{t.shoppingSelectionCounts.replace('{checks}', selection.coverage_count).replace('{extras}', selection.extra_count).replace('{personal}', selection.personal_count)}</p>
      </li>)}</ul></section>}
    {preview.effects.events_preserved && <p>{t.preserved}</p>}
    {preview.effects.linked_events_outside_range?.length > 0 && <section><h3>{t.outsidePreview} ({preview.effects.linked_events_outside_range.length})</h3><PreviewRecords records={preview.effects.linked_events_outside_range} t={t} language={language} /></section>}
    <p className="pp-caption">{t.expires}: {new Date(preview.expires_at).toLocaleString(language === 'de' ? 'de-DE' : 'en-GB')}</p>
    {!valid && <p role="alert" className="pp-error">{t.stalePreview}</p>}
    {error && <p role="alert" className="pp-error">{errorText(error, t)}</p>}
    {['account_deleted', 'account_deletion_pending'].includes(error?.code) && <Link className="pp-back" to="/settings">{t.reviewAccountSettings}</Link>}
    <footer className="pp-dialog-actions"><button type="button" className="pp-primary" disabled={!valid || busy || blocked} onClick={onConfirm}>{busy ? t.saving : t.confirm}</button><button type="button" onClick={onClose}>{t.cancel}</button></footer>
  </PlanningDialog>;
}
