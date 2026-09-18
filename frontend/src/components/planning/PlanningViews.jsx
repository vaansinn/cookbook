import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { dayCount, formatDate, formatQuantity, today, visibleDays } from './planningModel.mjs';
import { groupPlanningOwners, watchLocalDay } from './planningCalendar.mjs';

export function PlanningActions({ label, children }) {
  return <details className="pp-actions"><summary aria-label={label}>{label.split(':')[0]}</summary><div className="pp-action-list">{children}</div></details>;
}

export function PlanningList({ area, snapshot, t, language, canEdit, edit }) {
  const plans = area === 'plans';
  const [day, setDay] = useState(() => today());
  useEffect(() => watchLocalDay(setDay), []);
  const records = snapshot[area];
  const groups = groupPlanningOwners(records, day);
  const cards = (rows, repeat = false) => <div className="pp-owner-list">{rows.map((record) => <article className="pp-owner" key={record.id}>
    <Link to={`/planning/${area}/${record.id}`}><h4>{record.name}</h4><p>{formatDate(record.start_date || record.date, language)}{plans ? ` – ${formatDate(record.end_date, language)}` : record.time ? ` · ${record.time}` : ''}</p>{!plans && <p>{record.guests} {t.guestsCount}</p>}</Link>
    {repeat && <button type="button" className="pp-text-button pp-repeat-owner" disabled={!canEdit} onClick={() => edit(plans ? 'plan.copy' : 'event.copy', record)}>{t[plans ? 'plan.copy' : 'event.copy']}</button>}
  </article>)}</div>;
  return <>
    <header className="pp-section-heading"><h2>{t[area]}</h2><button className="pp-primary" disabled={!canEdit} onClick={() => edit(plans ? 'plan.create' : 'event.create')}>{t[plans ? 'plan.create' : 'event.create']}</button></header>
    {!records.length ? <div className="pp-empty"><h3>{t[plans ? 'emptyPlans' : 'emptyEvents']}</h3><p>{t[plans ? 'emptyPlansBody' : 'emptyEventsBody']}</p></div>
      : <>
        {['current', 'upcoming'].map((group) => groups[group].length > 0 && <section className="pp-owner-group" key={group} aria-labelledby={`planning-${group}`}>
          <h3 id={`planning-${group}`}>{t[`period_${group}`]}</h3>{cards(groups[group])}
        </section>)}
        {groups.past.length > 0 && <details className="pp-past-owners" open={!groups.current.length && !groups.upcoming.length}>
          <summary>{t.period_past} <span>({groups.past.length})</span></summary>{cards(groups.past, true)}
        </details>}
      </>}
  </>;
}

function LinkedEvent({ link, t, language, canEdit, remove, showDate = false }) {
  return <article className="pp-meal pp-linked-event">
    <p className="pp-caption">{t.linkedEvent}{link.event.time ? ` · ${link.event.time}` : ''}</p>
    <Link to={`/planning/events/${link.event.id}`}><h3>{link.event.name}</h3></Link>
    {showDate && <p>{formatDate(link.event.date, language)}</p>}
    <p className="pp-caption">{link.event.guests} {t.guestsCount}</p>
    <button type="button" className="pp-text-button" disabled={!canEdit} onClick={() => remove('event.unlink', { link_id: link.id })}>{t['event.unlink']}</button>
  </article>;
}

export function PlanningBoard({ plan, snapshot, t, language, canEdit, edit, remove, previewItem, templateAction, offset = 0, setOffset }) {
  const days = visibleDays(plan, offset);
  const outside = snapshot.links.filter((link) => !link.in_range);
  const count = dayCount(plan.start_date, plan.end_date);
  // Clamp the paging position after resizing, including after undo.
  const visibleOffset = dayCount(plan.start_date, days[0]) - 1;
  return <>
    <Link className="pp-back" to="/planning/plans">{t.backPlans}</Link>
    <header className="pp-section-heading"><div><h2>{plan.name}</h2><p>{formatDate(plan.start_date, language)} – {formatDate(plan.end_date, language)}</p></div>
      <PlanningActions label={`${t.actions}: ${plan.name}`}>
        {['plan.rename', 'plan.resize', 'plan.copy'].map((op) => <button key={op} disabled={!canEdit} onClick={() => edit(op, plan)}>{t[op]}</button>)}
        <button disabled={!canEdit} onClick={() => edit('event.link', { plan_id: plan.id })}>{t['event.link']}</button>
        <button disabled={!canEdit} className="pp-danger" onClick={() => remove('plan.delete', { plan_id: plan.id })}>{t['plan.delete']}</button>
      </PlanningActions>
    </header>
    {count > 3 && <nav className="pp-date-navigation" aria-label={t.dateNavigation}>
      <button disabled={visibleOffset === 0} onClick={() => setOffset(Math.max(0, visibleOffset - 3))}>{t.previous}</button>
      <label>{t.jump}<input type="date" aria-label={t.jump} min={plan.start_date} max={plan.end_date} value={days[0]} onChange={(event) => {
        const date = event.target.value;
        if (date >= plan.start_date && date <= plan.end_date) setOffset(Math.floor((dayCount(plan.start_date, date) - 1) / 3) * 3);
      }} /></label>
      <button disabled={visibleOffset + 3 >= count} onClick={() => setOffset(visibleOffset + 3)}>{t.next}</button>
    </nav>}
    <div className="pp-days">{days.map((date) => {
      const meals = snapshot.meals.filter((meal) => meal.date === date);
      const links = snapshot.links.filter((link) => link.in_range && link.event.date === date);
      const dayLabel = formatDate(date, language, { weekday: 'short', year: undefined });
      return <section className="pp-day" key={date}>
        <header><h3><time dateTime={date}>{dayLabel}</time></h3><button className="pp-add" disabled={!canEdit} aria-label={`${t['meal.create']}: ${dayLabel}`} onClick={() => edit('meal.create', { plan_id: plan.id, date })}><span aria-hidden="true">+</span></button></header>
        <div className="pp-day-body" tabIndex={0} role="region" aria-label={dayLabel}>
          {meals.map((meal) => <article className="pp-meal" key={meal.id}>
            <header><div><h4>{meal.name || t.meal}</h4>{meal.time && <p className="pp-caption">{meal.time}</p>}</div>
              <PlanningActions label={`${t.actions}: ${meal.name || t.meal}`}>
                {['meal.update', 'meal.move', 'meal.copy'].map((op) => <button key={op} disabled={!canEdit} onClick={() => edit(op, meal)}>{t[op]}</button>)}
                <button disabled={!canEdit} onClick={() => templateAction('save', 'meal', meal.id)}>{t.templateSave}</button>
                <button disabled={!canEdit} onClick={() => templateAction('apply', 'meal', meal.id)}>{t.templateApply}</button>
                <button className="pp-danger" disabled={!canEdit} onClick={() => remove('meal.delete', { meal_id: meal.id })}>{t['meal.delete']}</button>
              </PlanningActions>
            </header>
            <PlanningItems parentType="meal" parentId={meal.id} {...{ snapshot, t, language, canEdit, edit, remove, previewItem }} />
          </article>)}
          {links.map((link) => <LinkedEvent key={link.id} {...{ link, t, language, canEdit, remove }} />)}
          {!meals.length && !links.length && <p className="pp-open-day">{t.openDay}</p>}
        </div>
      </section>;
    })}</div>
    {outside.length > 0 && <section className="pp-outside"><h3>{t.outside}</h3><div className="pp-owner-list">{outside.map((link) => <LinkedEvent key={link.id} {...{ link, t, language, canEdit, remove }} showDate />)}</div></section>}
  </>;
}

export function PlanningEvent({ event, snapshot, t, language, canEdit, edit, remove, command, previewItem, templateAction }) {
  return <>
    <Link className="pp-back" to="/planning/events">{t.backEvents}</Link>
    <header className="pp-section-heading"><div><h2>{event.name}</h2><p>{formatDate(event.date, language)}{event.time ? ` · ${event.time}` : ''} · {event.guests} {t.guestsCount}</p></div>
      <PlanningActions label={`${t.actions}: ${event.name}`}>
        <button disabled={!canEdit} onClick={() => edit('event.update', event)}>{t['event.update']}</button>
        <button disabled={!canEdit} onClick={() => edit('event.copy', event)}>{t['event.copy']}</button>
        <button disabled={!canEdit} onClick={() => edit('event.link', { event_id: event.id })}>{t['event.link']}</button>
        <button disabled={!canEdit} onClick={() => templateAction('save', 'event', event.id)}>{t.templateSave}</button>
        <button disabled={!canEdit} onClick={() => templateAction('apply', 'event', event.id)}>{t.templateApply}</button>
        <button className="pp-danger" disabled={!canEdit} onClick={() => remove('event.delete', { event_id: event.id })}>{t['event.delete']}</button>
      </PlanningActions>
    </header>
    <p className="pp-caption">{t.eventIdentity}</p>
    <section className="pp-event-menu"><h3>{t.menu}</h3><PlanningItems parentType="event" parentId={event.id} {...{ snapshot, t, language, canEdit, edit, remove, previewItem }} /></section>
    <header className="pp-section-heading"><div><h3>{t.preparation}</h3><p>{t.preparationNote}</p></div></header>
    <div className="pp-preparation">{['earlier', 'day', 'serving'].map((bucket) => {
      const tasks = snapshot.tasks.filter((task) => task.bucket === bucket).sort((a, b) => a.position - b.position);
      return <section key={bucket}><h4>{t[bucket]}</h4>
        {!tasks.length && <p className="pp-caption">{t.noTasks}</p>}
        {tasks.map((task) => <div className="pp-task" key={task.id}>
          <label className="pp-check"><input type="checkbox" checked={task.done} disabled={!canEdit} onChange={() => command('task.update', { task_id: task.id, done: !task.done })} /><span>{task.text}</span></label>
          <PlanningActions label={`${t.actions}: ${task.text}`}><button disabled={!canEdit} onClick={() => edit('task.update', task)}>{t['task.update']}</button><button className="pp-danger" disabled={!canEdit} onClick={() => remove('task.delete', { task_id: task.id })}>{t['task.delete']}</button></PlanningActions>
        </div>)}
        <button className="pp-text-button" disabled={!canEdit} onClick={() => edit('task.create', { event_id: event.id, bucket })}>{t['task.create']}</button>
      </section>;
    })}</div>
  </>;
}

function PlanningItems({ parentType, parentId, snapshot, t, language, canEdit, edit, remove, previewItem }) {
  const items = (snapshot.items || []).filter((item) => item[`${parentType}_id`] === parentId).sort((a, b) => a.position - b.position);
  return <div className="pp-items">
    {items.map((item) => <article className="pp-item" key={item.id}>
      <div className="pp-item-heading"><div>
        {item.kind === 'dish' ? <button type="button" className="pp-item-title" onClick={() => previewItem(item)} aria-label={`${t.itemPreview}: ${item.entry_id}`}>{item.title || item.entry_id}</button> : <p className="pp-item-title">{item.title}</p>}
        {item.kind === 'note' && <span className="pp-caption">{t.kind_note}</span>}
        {item.group && <p className="pp-caption">{item.group}</p>}
        {item.quantity && <p className="pp-caption">{formatQuantity(item.quantity, language)} {t[`unit_${item.unit}`] || item.unit}</p>}
        {item.kind === 'dish' && <p className="pp-caption">{formatQuantity(item.servings, language)} {t.servingsCount}{item.options?.variant_id ? ` · ${item.options.variant_id}` : ''}{item.follows_guests ? ` · ${t.followsGuests}` : ''}</p>}
      </div><PlanningActions label={`${t.actions}: ${item.title || item.entry_id}`}>
        {['item.update', 'item.move', 'item.copy'].map((op) => <button key={op} disabled={!canEdit} onClick={() => edit(op, item)}>{t[op]}</button>)}
        <button className="pp-danger" disabled={!canEdit} onClick={() => remove('item.delete', { item_id: item.id })}>{t['item.delete']}</button>
      </PlanningActions></div>
      {item.contribution && <p className="pp-contribution">{item.contribution} · {t.contributionExcluded}</p>}
    </article>)}
    <button type="button" className="pp-text-button" disabled={!canEdit} onClick={() => edit('item.create', { parent_type: parentType, parent_id: parentId })}>{t['item.create']}</button>
  </div>;
}
