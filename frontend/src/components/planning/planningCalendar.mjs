import { today } from './planningModel.mjs';

// Dates describe the user's local calendar, not a UTC instant or food safety.
export function groupPlanningOwners(records, day) {
  const groups = { current: [], upcoming: [], past: [] };
  for (const record of records) {
    const first = record.start_date || record.date;
    const last = record.end_date || record.date;
    groups[last < day ? 'past' : first > day ? 'upcoming' : 'current'].push(record);
  }
  for (const [group, rows] of Object.entries(groups)) rows.sort((a, b) => {
    const aDate = group === 'past' ? (a.end_date || a.date) : (a.start_date || a.date);
    const bDate = group === 'past' ? (b.end_date || b.date) : (b.start_date || b.date);
    return (group === 'past' ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate))
      || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return groups;
}

export function watchLocalDay(onDay, { clock = () => new Date(), host = window, page = document,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer, stopped = false;
  function refresh() {
    if (stopped) return;
    clearTimer(timer);
    const now = clock();
    onDay(today(now));
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    // Recheck within a minute for wall-clock/timezone changes; foreground and
    // midnight refresh immediately. Never assume every local day is 24 hours.
    timer = setTimer(refresh, Math.max(25, Math.min(60000, midnight - now + 25)));
  }
  host.addEventListener('focus', refresh);
  page.addEventListener('visibilitychange', refresh);
  refresh();
  return () => { stopped = true; clearTimer(timer); host.removeEventListener('focus', refresh); page.removeEventListener('visibilitychange', refresh); };
}
