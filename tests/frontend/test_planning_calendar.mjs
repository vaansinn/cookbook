import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPlanningOwners, watchLocalDay } from '../../frontend/src/components/planning/planningCalendar.mjs';
import { today } from '../../frontend/src/components/planning/planningModel.mjs';
import { errorText, planningStrings } from '../../frontend/src/components/planning/planningStrings.mjs';

test('calendar grouping includes plan end dates and whole event days, with recent past first', () => {
  const rows = [
    { id:'a', name:'Plan ending today', start_date:'2026-09-10', end_date:'2026-09-13' },
    { id:'b', name:'Tonight', date:'2026-09-13', time:'01:00' },
    { id:'c', name:'Tomorrow', date:'2026-09-14' },
    { id:'d', name:'Older', start_date:'2026-09-01', end_date:'2026-09-02' },
    { id:'e', name:'Recent', date:'2026-09-12' },
  ];
  const before = structuredClone(rows), grouped = groupPlanningOwners(rows, '2026-09-13');
  assert.deepEqual(grouped.current.map(r=>r.id), ['a','b']);
  assert.deepEqual(grouped.upcoming.map(r=>r.id), ['c']);
  assert.deepEqual(grouped.past.map(r=>r.id), ['e','d']);
  assert.deepEqual(rows, before);
  assert.deepEqual(groupPlanningOwners(rows, '2026-09-14').current.map(r=>r.id), ['c']);
  assert.deepEqual(groupPlanningOwners([], '2026-09-13'), {current:[],upcoming:[],past:[]});
});

test('midnight, foreground and clock changes refresh local day and cleanup stops callbacks', () => {
  let now = new Date(2026,8,13,23,59,59,900), scheduled, delay;
  const listeners = new Map(), values = [];
  const surface = {addEventListener:(name,fn)=>listeners.set(name,fn), removeEventListener:(name)=>listeners.delete(name)};
  const stop = watchLocalDay(value=>values.push(value), {clock:()=>now,host:surface,page:surface,
    setTimer:(fn,ms)=>{scheduled=fn;delay=ms;return 7;},clearTimer:()=>{}});
  assert.equal(values.at(-1),'2026-09-13'); assert.equal(delay,125);
  now = new Date(2026,8,14,0,0,0,50); scheduled();
  assert.equal(values.at(-1),'2026-09-14'); assert.equal(delay,60000);
  now = new Date(2026,8,12,10); listeners.get('focus')();
  assert.equal(values.at(-1),'2026-09-12');
  now = new Date(2026,8,15,10); listeners.get('visibilitychange')();
  assert.equal(values.at(-1),'2026-09-15');
  const count=values.length; stop(); scheduled(); assert.equal(values.length,count);assert.equal(listeners.size,0);
});

test('calendar does not use UTC-day slices and budget errors are not mistaken for expired login', () => {
  const clock = {getFullYear:()=>2026,getMonth:()=>8,getDate:()=>13,toISOString:()=>{throw Error('UTC conversion forbidden');}};
  assert.equal(today(clock),'2026-09-13');
  for (const language of ['en','de']) {
    const t=planningStrings[language];
    assert.equal(errorText({status:422,data:{code:'shopping_capacity_exceeded'}},t),t.shoppingCapacity);
    assert.notEqual(t.shoppingCapacity,t.sessionError);
  }
});
