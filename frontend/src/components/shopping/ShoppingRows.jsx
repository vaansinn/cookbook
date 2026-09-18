import { useEffect, useId, useRef } from 'react';
import { formatDate } from '../planning/planningModel.mjs';
import { coverage, decimal, displayAmount, nextCheckStatus } from './shoppingModel.mjs';

function ShoppingCheck({ checked, mixed, label, disabled, onChange, children }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed; }, [mixed]);
  return <label className="ps-check"><input ref={ref} type="checkbox" checked={checked} aria-checked={mixed ? 'mixed' : checked}
    aria-label={label} disabled={disabled} onChange={onChange} />{children}</label>;
}
function Quantity({ row, value, language, t }) {
  return row.personal_id && value === null ? <>{t.unquantified}</> : <>{displayAmount(value, row.unit, language, t)}</>;
}
export default function ShoppingRows({ groups, layout, scopeId, canEdit, t, language, cover, edit, remove, notice, dismiss, undo, undoAvailable }) {
  return <div className="ps-groups">{groups.map((group) => <section className="ps-group" key={group.key}>
    <h2>{group.title}</h2>
    {layout === 'dish' && <div className="ps-column-head" aria-hidden="true"><span /><span>{t.dish}</span><span>{t.total}</span><span /></div>}
    <ul className="ps-list">{group.rows.map((reference) => <ShoppingRow key={reference.key} {...{ reference, layout, scopeId, canEdit, t, language, cover, edit, remove, notice, dismiss, undo, undoAvailable }} />)}</ul>
  </section>)}</div>;
}
function ShoppingRow({ reference, layout, scopeId, canEdit, t, language, cover, edit, remove, notice, dismiss, undo, undoAvailable }) {
  const { row, sources, includeExtra, dish } = reference;
  const state = coverage(row, sources, includeExtra);
  const id = useId();
  const cupboard = row.purchase_mode === 'check_cupboard';
  const checkStatus = nextCheckStatus(row, state);
  const currentNotice = notice?.referenceKey === reference.key && notice.scopeId === scopeId;
  const visibleStatus = state.state === 'unchecked' ? t.cupboardHint : state.state === 'needed' ? '' : t[state.state];
  const remaining = !dish && state.state === 'partial' && row.remaining != null && row.total !== null
    ? t.remaining.replace('{remaining}', displayAmount(row.remaining, row.unit, language, t)).replace('{total}', displayAmount(row.total, row.unit, language, t)) : null;
  return <li className={`ps-row ${layout === 'dish' ? 'ps-dish-row' : ''}`} data-row-key={row.key}>
    <ShoppingCheck checked={state.checked} mixed={state.mixed} label={`${state.checked ? t.undoStatus : t[checkStatus]}: ${row.label}${dish ? ` · ${sources[0]?.dish_title}` : ''}`} disabled={!canEdit || state.empty}
      onChange={() => cover(reference, checkStatus)}>
      <span><span className="ps-item-name">{row.label}</span>{(remaining || visibleStatus) && <small className={state.state === 'review' ? 'ps-review-text' : ''}>{remaining || visibleStatus}</small>}</span>
    </ShoppingCheck>
    <span className="ps-quantity" aria-label={`${dish ? t.dish : t.amount}: ${row.label}`}>
      {cupboard ? '—' : dish ? sources.map((source) => <span key={source.id}><Quantity row={row} value={source.amount} {...{ t, language }} /></span>) : <Quantity row={row} value={row.total} {...{ t, language }} />}
    </span>
    {layout === 'dish' && <span className="ps-total" aria-label={`${t.total}: ${row.label}`}>{cupboard ? '—' : <Quantity row={row} value={row.total} {...{ t, language }} />}</span>}
    <details className="ps-disclosure">
      <summary aria-label={`${t.details}: ${row.label}`} aria-controls={`${id}-details`}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 5 7 7-7 7" /></svg></summary>
      <div id={`${id}-details`} className="ps-details">
        {!!row.sources.length && <ul className="ps-sources" aria-label={t.sources}>{row.sources.map((source) => <li key={source.id}>
          <span>{dish && !sources.some((local) => local.id === source.id) && <small>{t.alsoIn} </small>}{source.dish_title}{source.meal_title ? ` · ${source.meal_title}` : ''}{source.date ? ` · ${formatDate(source.date, language)}` : ''}
            {(source.review || source.state !== 'needed') && <small>{source.review ? t.review : t[source.state]}</small>}</span>
          <span>{displayAmount(source.amount, source.unit, language, t)}</span>
        </li>)}</ul>}
        {decimal(row.extra) > 0n && !row.personal_id && <ShoppingCheck label={`${t.checkExtra}: ${row.label}`} checked={!row.extra_review && ['have', 'bought'].includes(row.extra_state)} mixed={row.extra_review} disabled={!canEdit}
          onChange={() => cover({ ...reference, sources: [], includeExtra: true }, !row.extra_review && ['have', 'bought'].includes(row.extra_state) ? 'needed' : 'bought', false)}>
          <span>{t.extra} <Quantity row={row} value={row.extra} {...{ t, language }} />{row.extra_review && <small>{t.review}</small>}</span>
        </ShoppingCheck>}
        <div className="ps-row-actions">
          <button type="button" className="pp-text-button" disabled={!canEdit || state.empty} onClick={() => cover(reference, state.checked ? 'needed' : 'have', false)}>{state.checked ? t.undoStatus : t.have}</button>
          {cupboard && state.state !== 'needed' && <button type="button" className="pp-text-button" disabled={!canEdit} onClick={() => cover(reference, 'needed', false)}>{t.needed}</button>}
          {row.personal_id ? <><button type="button" className="pp-text-button" disabled={!canEdit} onClick={() => edit('personal', reference)}>{t.editPersonal}</button><button type="button" className="pp-text-button pp-danger" disabled={!canEdit} onClick={() => remove(row)}>{t.removePersonal}</button></>
            : row.required !== null && <button type="button" className="pp-text-button" disabled={!canEdit} onClick={() => edit('amount', reference)}>{t.changeAmount}</button>}
        </div>
      </div>
    </details>
    {currentNotice && <div className="ps-check-notice"><span role="status">{notice.all ? t.checkedAll : t.checkedDish}</span>
      {!notice.all && <button type="button" className="pp-text-button" disabled={!canEdit} aria-label={`${t.checkAllLabel}: ${row.label}`} onClick={() => cover({ ...reference, sources: row.sources, includeExtra: true }, notice.status || 'bought', true, true)}>{t.checkAll}{row.total !== null && !cupboard ? ` ${displayAmount(row.total, row.unit, language, t)}` : ''}</button>}
      {undoAvailable && <button type="button" className="pp-text-button" disabled={!canEdit} onClick={undo}>{t.undo}</button>}
      <button type="button" className="pp-text-button" onClick={dismiss}>{t.dismiss}</button>
    </div>}
  </li>;
}
