import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url);
const C=require('./welcoming-planning-core.js');
const storage=(initial={})=>{
  const values=new Map(Object.entries(initial));
  return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
};
const saved=data=>JSON.stringify({version:2,revision:1,data});
const amount=(data,ingredient,unit='g',kind='plan',id='weekend')=>C.shopping(data,kind,id).find(r=>r.ingredient===ingredient&&r.unit===unit)?.amount;

test('seed has multiple meals, an independent linked event, and an empty day',()=>{
  const d=C.seed();assert.equal(C.validate(d),true);
  assert.equal(d.plans[0].meals.length,2);assert.equal(d.plans[0].meals[0].date,d.plans[0].meals[1].date);
  assert.deepEqual(d.plans[0].eventIds,['saturday']);assert.equal(d.events[0].items.length,4);
  assert.ok(!d.plans[0].meals.some(m=>m.date==='2026-09-13'));
  assert.equal(C.catalog.soup.status,'planningExample');assert.equal(C.catalog.salad.status,'planningExample');
  for(const id of ['soup','salad']){assert.equal(C.catalog[id].image,undefined);assert.equal(C.catalog[id].instructions,undefined);}
});
test('one-day, ten-day, leap-day and bounded long ranges are not fixed weeks',()=>{
  assert.equal(C.days('2026-09-11','2026-09-11').length,1);
  assert.equal(C.days('2026-09-11','2026-09-20').length,10);
  assert.deepEqual(C.days('2028-02-28','2028-03-01'),['2028-02-28','2028-02-29','2028-03-01']);
  assert.deepEqual(C.days('2026-09-11','9999-12-31',3,3),['2026-09-14','2026-09-15','2026-09-16']);
  assert.throws(()=>C.days('2026-02-29','2026-03-01'));assert.throws(()=>C.days('2026-03-02','2026-03-01'));
});
test('shopping derives quantities, sources and linked event demand exactly once',()=>{
  const d=C.seed();assert.equal(amount(d,'pasta'),820);assert.equal(amount(d,'sauce'),1500);assert.equal(amount(d,'lentils'),150);
  const pasta=C.shopping(d,'plan','weekend').find(r=>r.ingredient==='pasta');assert.equal(pasta.sources.length,2);
  d.plans[0].eventIds.push('saturday');assert.equal(amount(d,'pasta'),820);
  d.events[0].date='2026-09-14';assert.equal(amount(d,'pasta'),220);
  assert.equal(amount(d,'pasta','g','event','saturday'),600);
  d.events[0].items.find(i=>i.contribution).ingredients=[['bread',100,'count']];
  assert.equal(amount(d,'bread','count','event','saturday'),2);
  assert.throws(()=>C.shopping(d,'invalid','weekend'));
});
test('servings and component options are isolated; quantities are recomputed, not accumulated',()=>{
  const d=C.seed(),original=C.clone(d);d.events[0].items[0].options.sauce='tomatoes';
  assert.equal(amount(d,'sauce'),450);assert.equal(amount(d,'tomatoes'),1200);
  assert.equal(original.events[0].items[0].options.sauce,'jar');
  assert.equal(d.plans[0].meals[1].items[0].options.sauce,'jar');
  d.events[0].items[0].servings=2;assert.equal(amount(d,'tomatoes'),400);
  assert.deepEqual(C.shopping(d,'plan','weekend'),C.shopping(d,'plan','weekend'));
  assert.equal(C.shopping(d,'plan','weekend').filter(r=>r.ingredient==='salt').length,2);
});
test('schema rejects broken references, bad dates, wrong units and prototype-property IDs',()=>{
  for(const mutate of [d=>d.plans[0].eventIds.push('missing'),d=>d.plans[0].end='bad',
    d=>d.events[0].time='25:00',d=>d.events[0].guests=0,d=>d.plans[0].id='saturday',
    d=>d.events[0].items[0].recipeId='constructor',d=>d.events[0].items[0].options.sauce='toString',
    d=>d.events[0].items[0].language='xx',d=>d.events[0].items[0].servings=-2,
    d=>d.events[0].items[1].ingredients=[['lentils',null,'g']],
    d=>d.events[0].items[1].ingredients=[['constructor',2,'g']],
    d=>d.events[0].items[1].ingredients=[['lentils',200,'cup']],
    d=>d.plans[0].name='x'.repeat(201),d=>d.batches.push({})]){
    const d=C.seed();mutate(d);assert.throws(()=>C.validate(d));
  }
});
test('local save reload and reset only affect the planning key',()=>{
  const s=storage({'cook-attempt':'keep me','unrelated':'untouched'}),a=C.store(s);
  assert.equal(s.values.has(C.KEY),false);a.change(d=>d.plans[0].name='A saved plan');
  assert.equal(C.store(s).data.plans[0].name,'A saved plan');assert.equal(JSON.parse(s.getItem(C.KEY)).revision,1);
  a.change(d=>d.events[0].tasks[0].done=true);assert.equal(C.store(s).data.events[0].tasks[0].done,true);
  a.reset();assert.deepEqual(a.data,C.seed());assert.equal(s.getItem('cook-attempt'),'keep me');assert.equal(s.getItem('unrelated'),'untouched');
});
test('malformed and future records are recoverable, never silently overwritten',()=>{
  for(const raw of ['{broken',JSON.stringify({version:5,revision:1,data:C.seed()}),saved({...C.seed(),plans:null})]){
    const s=storage({[C.KEY]:raw}),a=C.store(s);assert.equal(a.mode,'invalid');assert.equal(a.raw,raw);
    assert.equal(a.change(d=>d.plans[0].name='Overwrite?'),false);assert.equal(s.getItem(C.KEY),raw);
  }
});
test('storage write failure retains session data and can retry safely',()=>{
  const s=storage(),write=s.setItem;s.setItem=()=>{throw Error('Quota');};
  const a=C.store(s);assert.equal(a.change(d=>d.plans[0].name='In memory'),true);assert.equal(a.mode,'unavailable');assert.equal(a.data.plans[0].name,'In memory');
  s.setItem=write;a.change(()=>{});assert.equal(a.mode,'ready');assert.equal(C.store(s).data.plans[0].name,'In memory');
});
test('unreadable storage never becomes an overwrite even if writes would succeed',()=>{
  const s=storage({[C.KEY]:'unknown existing draft'}),read=s.getItem;s.getItem=()=>{throw Error('Denied');};
  const a=C.store(s);a.change(d=>d.plans[0].name='In memory');assert.equal(a.mode,'unavailable');
  assert.equal(s.values.get(C.KEY),'unknown existing draft');assert.equal(a.data.plans[0].name,'In memory');
  s.getItem=read;assert.equal(a.change(()=>{}),false);assert.equal(a.mode,'conflict');
});
test('cross-tab changes, missed events and deletions block edits until reload',()=>{
  const s=storage(),a=C.store(s);a.change(()=>{});const b=C.store(s);
  a.change(d=>d.plans[0].name='Newer');assert.equal(b.change(d=>d.plans[0].name='Stale'),false);assert.equal(b.mode,'conflict');
  b.reload();assert.equal(b.data.plans[0].name,'Newer');b.change(d=>d.plans[0].name='Reviewed');
  a.external(s.getItem(C.KEY));assert.equal(a.mode,'conflict');a.reload();assert.equal(a.data.plans[0].name,'Reviewed');
  s.removeItem(C.KEY);a.external(null);assert.equal(a.mode,'conflict');assert.equal(a.change(()=>{}),false);
  a.reload();assert.equal(a.mode,'ready');assert.deepEqual(a.data,C.seed());
});
test('invalid local actions roll back without a save or revision increase',()=>{
  const s=storage(),a=C.store(s);a.change(()=>{});const before=s.getItem(C.KEY);
  assert.throws(()=>a.change(d=>d.plans[0].end='broken'));assert.equal(s.getItem(C.KEY),before);assert.deepEqual(a.data,C.seed());
});
const ui=fs.readFileSync(new URL('./welcoming-planning.js',import.meta.url),'utf8');
const shoppingUI=fs.readFileSync(new URL('./welcoming-shopping.js',import.meta.url),'utf8');
function context(){
  const ctx=vm.createContext({PlanningCore:C,state:{lang:'en'},location:{hash:'#plan'},app:{innerHTML:''},
    escapeHTML:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),aiLink:()=>'<button>AI image</button>'});
  vm.runInContext(ui,ctx);vm.runInContext(shoppingUI,ctx);vm.runInContext('planningStore={data:PlanningCore.seed(),mode:"ready"}',ctx);return ctx;
}
test('all planning views render in EN/DE with strict routes and example labels',()=>{
  const ctx=context();const keys=lang=>vm.runInContext(`Object.keys(planningStrings.${lang}).sort().join('|')`,ctx);assert.equal(keys('en'),keys('de'));
  for(const lang of ['en','de'])for(const hash of ['#plan','#plan/events','#plan/event/saturday','#plan/event/saturday/prep','#plan/shopping/plan/weekend','#plan/shopping/event/saturday']){
    ctx.state.lang=lang;ctx.location.hash=hash;vm.runInContext('renderPlanning()',ctx);
    assert.match(ctx.app.innerHTML,/<main/);assert.ok(!ctx.app.innerHTML.includes('undefined'));assert.ok(!ctx.app.innerHTML.includes('This draft is not here'));
  }
  ctx.state.lang='en';for(const hash of ['#plan/plans/missing','#plan/event/saturday/nope','#plan/plans/weekend/extra','#plan/shopping/xx/weekend']){
    ctx.location.hash=hash;vm.runInContext('renderPlanning()',ctx);assert.match(ctx.app.innerHTML,/This draft is not here/);
  }
  ctx.location.hash='#plan';vm.runInContext('renderPlanning()',ctx);assert.equal((ctx.app.innerHTML.match(/Planning example/g)||[]).length,2);
  assert.ok(!ctx.app.innerHTML.includes('kitchen-assets/soup'));assert.ok(!ctx.app.innerHTML.includes('kitchen-assets/salad'));
});
test('ingredient-specific count units appear in shopping totals and source details in EN/DE',()=>{
  const ctx=context();
  for(const [lang,expected] of [['en',['1 head','2 heads','1 cucumber','2 cucumbers','1 loaf','2 loaves','0.5 loaf']],['de',['1 Kopf','2 Köpfe','1 Gurke','2 Gurken','1 Laib','2 Laibe','0,5 Laib']]]){
    ctx.state.lang=lang;
    const inputs=[[1,'lettuce'],[2,'lettuce'],[1,'cucumber'],[2,'cucumber'],[1,'bread'],[2,'bread'],[0.5,'bread']];
    inputs.forEach(([q,id],i)=>assert.equal(vm.runInContext(`planningQuantity(${q},'count','${id}')`,ctx),expected[i]));
    ctx.location.hash='#plan/shopping/plan/weekend';vm.runInContext('renderPlanning()',ctx);
    for(const label of [expected[0],expected[2],expected[5]]){assert.ok(ctx.app.innerHTML.includes(`>${label===expected[2]?'1':label}</strong>`));assert.ok(ctx.app.innerHTML.includes(`<span>${label}</span>`));}
    assert.equal(vm.runInContext("planningQuantity(820,'g','pasta')",ctx),'820 g');
    assert.equal(vm.runInContext("planningQuantity(100,'g','lettuce')",ctx),'100 g');
    assert.equal(vm.runInContext("planningQuantity(null,'taste','salt')",ctx),lang==='en'?'to taste':'nach Geschmack');
  }
  assert.equal(amount(C.seed(),'bread','count'),2); // No amount or demand changes.
});
test('empty states and corrupt-draft controls render without enabling writes',()=>{
  const ctx=context();vm.runInContext('planningStore.data.plans=[];planningStore.data.events=[];renderPlanning()',ctx);assert.match(ctx.app.innerHTML,/No meal plans yet/);
  ctx.location.hash='#plan/events';vm.runInContext('renderPlanning()',ctx);assert.match(ctx.app.innerHTML,/No events yet/);
  vm.runInContext('planningStore.data=PlanningCore.seed();planningStore.data.events[0].items=[]',ctx);
  ctx.location.hash='#plan/shopping/event/saturday';vm.runInContext('renderPlanning()',ctx);assert.match(ctx.app.innerHTML,/Nothing required by these meals/);
  ctx.location.hash='#plan';vm.runInContext('planningStore.mode="invalid";renderPlanning()',ctx);
  assert.match(ctx.app.innerHTML,/Download saved draft/);assert.match(ctx.app.innerHTML,/aria-label="Edit title" disabled/);
});
test('shopping disclosure uses a decorative chevron, native state and stable amount alignment',()=>{
  const ctx=context();ctx.location.hash='#plan/shopping/plan/weekend';vm.runInContext('renderPlanning()',ctx);
  const summaries=[...ctx.app.innerHTML.matchAll(/<summary aria-label="Details:[^"]*">([\s\S]*?)<\/summary>/g)].map(m=>m[1]);
  assert.equal(summaries.length,C.shoppingTargets(C.seed(),C.scopeDescriptor('plan','weekend')).filter(r=>!C.seasoningIds.includes(r.ingredient)).length+2);
  for(const summary of summaries){
    assert.match(summary,/<svg class="planning-icon"/);assert.ok(!summary.includes("shopping-item-name"));
    assert.match(summary,/aria-hidden="true" focusable="false"/);
    assert.match(summary,/<path d="m9 5 7 7-7 7"\/>/);
  }
  const css=fs.readFileSync(new URL('./welcoming-planning.css',import.meta.url),'utf8');
  assert.match(css,/details\[open\]>summary>\.planning-icon\{transform:rotate\(90deg\)\}/);
  assert.doesNotMatch(css,/summary:after\{content:'[+−]'/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
test('user titles are escaped and planning code does not call accounts/APIs or mutate cooks',()=>{
  const ctx=context();vm.runInContext('planningStore.data.plans[0].name="<img onerror=oops>";renderPlanning()',ctx);
  assert.match(ctx.app.innerHTML,/&lt;img onerror=oops&gt;/);assert.ok(!ctx.app.innerHTML.includes('<img onerror'));
  for(const source of [ui,shoppingUI,fs.readFileSync(new URL('./welcoming-planning-core.js',import.meta.url),'utf8')]){
    assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\/api\/|localStorage\.clear|tomatoAttempt\s*=|state\.servings\s*=/);
  }
});
test('planning and theme changes retain the recipe context and untouched cook state',()=>{
  const source=fs.readFileSync(new URL('./welcoming-kitchen.js',import.meta.url),'utf8');
  const nodes=new Map(),document={documentElement:{dataset:{}},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{setAttribute(){}});return nodes.get(selector);}};
  const state={lang:'en',theme:'light',servings:4,step:2,timerEnd:12345,checked:[1,2]};
  const ctx=vm.createContext({document,state,t:x=>x,pt:x=>x,networkText:x=>x,location:{hash:'#recipe'},app:{},networkObserver:null,
    route:()=>ctx.location.hash==='#plan'||ctx.location.hash.startsWith('#shopping')||ctx.location.hash.startsWith('#plan/shopping/')?'planning':ctx.location.hash.split('/')[0].slice(1),tomatoRoute:()=>ctx.location.hash.endsWith('/tomato'),shoppingRoute:()=>ctx.location.hash.startsWith('#shopping')||ctx.location.hash.startsWith('#plan/shopping/'),
    ...Object.fromEntries(['renderTomatoRecipe','renderTomatoCook','renderTomatoComplete','renderLibrary','renderNetwork','renderPlanning','renderRecipe','renderCook','renderComplete'].map(k=>[k,()=>{}]))});
  vm.runInContext('let recipePreviewContext="tomato";',ctx);
  vm.runInContext(source.slice(source.indexOf('function header()'),source.indexOf('function meta()')),ctx);
  vm.runInContext(source.slice(source.indexOf('function render(focus='),source.indexOf('function syncIngredients()')),ctx);
  const before=C.clone(state);vm.runInContext('render()',ctx);ctx.location.hash='#plan';vm.runInContext('render();header()',ctx);
  assert.equal(vm.runInContext('recipePreviewContext',ctx),'lentil');assert.deepEqual(state,before);
  assert.equal((nodes.get('#navigation').innerHTML.match(/<a /g)||[]).length,4);
  assert.match(nodes.get('#navigation').innerHTML,/href="#shopping"/);assert.doesNotMatch(nodes.get('#navigation').innerHTML,/href="#cook/);
  ctx.location.hash='#recipe/tomato';vm.runInContext('render()',ctx);ctx.location.hash='#plan';vm.runInContext('render();header()',ctx);
  assert.equal(vm.runInContext('recipePreviewContext',ctx),'tomato');assert.deepEqual(state,before);
  for(const hash of ['#shopping','#shopping/event/saturday','#plan/shopping/plan/weekend']){
    ctx.location.hash=hash;vm.runInContext('header()',ctx);
    assert.match(nodes.get('#navigation').innerHTML,/href="#shopping" aria-current="page"/);
    assert.doesNotMatch(nodes.get('#navigation').innerHTML,/href="#plan" aria-current/);
  }
});
