import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const C=createRequire(import.meta.url)('./welcoming-planning-core.js');
const edit=(d,fn)=>C.previewPlanningEdit(d,fn).next;
const storage=()=>{let raw=null;return {getItem:()=>raw,setItem:(k,v)=>{assert.equal(k,C.KEY);raw=v;},removeItem:()=>raw=null};};
const dish=(recipeId='tomato',servings=2,sauce='jar')=>({kind:'dish',recipeId,servings,language:'en',options:{sauce}});
test('create one-day and ten-day plans, unnamed meals and independent dishes',()=>{
 let d=C.seed(),pid,mid;
 d=edit(d,n=>pid=C.savePlan(n,null,{name:'Ten days',start:'2026-09-01',end:'2026-09-10'}));
 d=edit(d,n=>mid=C.saveMeal(n,pid,null,{name:'',date:'2026-09-02',time:''}));
 d=edit(d,n=>{C.saveMeal(n,pid,null,{name:'Second meal',date:'2026-09-02',time:'19:00'});C.savePlannedItem(n,'meal',mid,null,dish());C.savePlannedItem(n,'meal',mid,null,dish('tomato',4,'tomatoes'));});
 const p=d.plans.find(p=>p.id===pid);assert.equal(C.dayCount(p.start,p.end),10);assert.equal(p.meals.length,2);assert.equal(p.meals[0].items.length,2);
 assert.equal(C.shopping(d,'plan',pid).find(r=>r.ingredient==='tomatoes').amount,800);
 assert.equal(p.meals[0].items[0].options.sauce,'jar');assert.equal(d.events[0].items[0].servings,6);
 assert.equal(C.days(p.start,p.end,0,3).length,3);
 d=edit(d,n=>C.savePlan(n,pid,{name:'One day',start:'2026-09-02',end:'2026-09-02'}));assert.equal(d.plans.find(p=>p.id===pid).meals.length,2);
});
test('date trim preview reports meals and affected shopping scopes without mutating source',()=>{
 const d=C.seed(),original=C.clone(d),scope=C.scopeDescriptor('plan','weekend','meals',['meal:friday-dinner']);
 C.selectScope(d,scope);C.setShoppingTotal(d,scope,'pasta:g',300);C.markShopping(d,scope,'pasta:g','bought');
 const before=JSON.stringify(d),preview=C.previewPlanningEdit(d,n=>C.savePlan(n,'weekend',{name:'Short',start:'2026-09-12',end:'2026-09-13'}));
 assert.equal(JSON.stringify(d),before);assert.equal(preview.removedMeals.length,2);assert.equal(preview.scopes.length,1);assert.equal(preview.next.shopping.scopes.length,0);assert.equal(preview.next.shopping.views.length,0);
 assert.deepEqual(preview.next.plans[0].eventIds,original.plans[0].eventIds);assert.deepEqual(preview.next.events,original.events);
});
test('moving meals and dishes preserves identity; copying creates independent identities',()=>{
 let d=C.seed(),pid;d=edit(d,n=>pid=C.savePlan(n,null,{name:'Other',start:'2026-09-01',end:'2026-09-30'}));
 d=edit(d,n=>C.transferMeal(n,'friday-dinner',pid,'2026-09-20'));
 assert.equal(d.plans[0].meals.length,1);const p=d.plans.find(p=>p.id===pid);assert.equal(p.meals[0].items[0].id,'friday-pasta');
 let copy;d=edit(d,n=>copy=C.transferMeal(n,'friday-dinner',pid,'2026-09-21',true));
 const duplicate=d.plans.find(p=>p.id===pid).meals.find(m=>m.id===copy);assert.notEqual(duplicate.items[0].id,'friday-pasta');
 d=edit(d,n=>C.transferItem(n,'friday-pasta','event','saturday',false,0));assert.equal(d.events[0].items[0].id,'friday-pasta');assert.equal(d.events[0].items[0].servings,2);assert.equal(d.events[0].items[0].followsGuests,false);
 assert.equal(d.plans.find(p=>p.id===pid).meals[0].items.length,0);
 assert.throws(()=>C.previewPlanningEdit(d,n=>C.transferMeal(n,copy,pid,'2027-01-01')));
});
test('Plan again shifts dates, copies linked events once, resets tasks and leaves checks behind',()=>{
 const d=C.seed(),scope=C.scopeDescriptor('plan','weekend');C.markShopping(d,scope,'pasta:g','bought');d.events[0].tasks[0].done=true;
 const original=C.clone(d),preview=C.previewPlanningEdit(d,n=>C.copyPlan(n,'weekend','2026-10-01','Again')),p=preview.next.plans[1],e=preview.next.events[1];
 assert.equal(p.end,'2026-10-03');assert.equal(p.meals[0].date,'2026-10-01');assert.equal(e.date,'2026-10-02');assert.deepEqual(p.eventIds,[e.id]);assert.notEqual(e.id,'saturday');
 assert.ok(e.tasks.every(t=>!t.done));assert.notEqual(e.tasks[0].id,'table');assert.notEqual(p.meals[1].items[0].id,'friday-pasta');
 assert.deepEqual(d,original);assert.equal(C.shoppingTargets(preview.next,C.scopeDescriptor('plan',p.id)).find(r=>r.ingredient==='pasta').status,'needed');
 assert.deepEqual(preview.next.shopping,d.shopping);assert.equal(C.shopping(preview.next,'plan',p.id).find(r=>r.ingredient==='pasta').amount,820);
});
test('event guest changes respect per-dish overrides and contribution exclusions',()=>{
 let d=C.seed(),second;d=edit(d,n=>second=C.savePlannedItem(n,'event','saturday',null,{...dish('tomato',3),followsGuests:false,contribution:true}));
 d=edit(d,n=>C.saveEvent(n,'saturday',{name:'Dinner',date:'2026-09-15',time:'',guests:10}));
 assert.equal(d.events[0].items[0].servings,10);assert.equal(d.events[0].items.find(i=>i.id===second).servings,3);assert.equal(C.shopping(d,'event','saturday').find(r=>r.ingredient==='pasta').amount,1000);
 assert.deepEqual(d.plans[0].eventIds,['saturday']);assert.equal(C.shopping(d,'plan','weekend').find(r=>r.ingredient==='pasta').amount,220);
});
test('legacy duplicate event links produce only one independent occasion on repeat',()=>{
 const d=C.seed();d.plans[0].eventIds.push('saturday');const p=C.previewPlanningEdit(d,n=>C.copyPlan(n,'weekend','2026-10-01','Again'));
 assert.equal(p.next.events.length,2);assert.equal(p.next.plans[1].eventIds.length,1);
});
test('unlink keeps event; deleting event cleans links and affected saved selections',()=>{
 let d=C.seed();const scope=C.scopeDescriptor('plan','weekend','meals',['event:saturday']);C.selectScope(d,scope);
 let p=C.previewPlanningEdit(d,n=>C.linkEvent(n,'weekend','saturday',false));assert.equal(p.next.events.length,1);assert.equal(p.scopes.length,1);
 d=edit(d,n=>C.deletePlanningEntity(n,'event','saturday'));assert.equal(d.events.length,0);assert.deepEqual(d.plans[0].eventIds,[]);assert.equal(d.shopping.scopes.length,0);
});
test('deleting a plan does not delete linked events or unrelated shopping',()=>{
 let d=C.seed();C.selectScope(d,C.scopeDescriptor('plan','weekend'));C.selectScope(d,C.scopeDescriptor('event','saturday'));
 const p=C.previewPlanningEdit(d,n=>C.deletePlanningEntity(n,'plan','weekend'));assert.equal(p.next.events.length,1);assert.equal(p.scopes.length,1);assert.equal(p.next.shopping.scopes[0].kind,'event');
});
test('meal and menu templates apply as independent items and carry no dates or links',()=>{
 let d=C.seed(),template;d=edit(d,n=>template=C.saveTemplate(n,'menu','saturday','Dinner menu'));
 assert.equal(d.templates[0].date,undefined);assert.equal(d.templates[0].tasks,undefined);assert.equal(d.templates[0].eventIds,undefined);
 let event;d=edit(d,n=>event=C.saveEvent(n,null,{name:'New',date:'2026-10-01',time:'',guests:3}));
 d=edit(d,n=>C.applyTemplate(n,template,'event',event));const e=d.events.find(e=>e.id===event);assert.equal(e.items[0].servings,3);assert.equal(d.events[0].items[0].servings,6);assert.notEqual(e.items[0].id,d.templates[0].items[0].id);
 d=edit(d,n=>C.saveTemplate(n,'meal','friday-dinner','Pasta night'));assert.equal(d.templates[1].kind,'meal');
 assert.throws(()=>C.validate({...d,templates:[{...d.templates[0],kind:'future'}]}));
});
test('personal ingredient quantities, notes and task edits persist in v4 without other storage writes',()=>{
 const s=storage(),store=C.store(s);let task;
 const p=C.previewPlanningEdit(store.data,n=>{C.savePlannedItem(n,'meal','brunch','breakfast-note',{kind:'personal',name:'Bread',ingredients:[['bread',2,'count']]});task=C.saveTask(n,'saturday',null,{name:'Arrange flowers',group:'earlier'});});
 store.change(d=>Object.assign(d,p.next));assert.equal(JSON.parse(s.getItem()).version,4);assert.equal(C.store(s).data.events[0].tasks.find(t=>t.id===task).done,false);
 const before=s.getItem();assert.throws(()=>store.change(d=>C.saveEvent(d,'saturday',{name:'Bad',date:'2026-02-30',time:'99:00',guests:0})));assert.equal(s.getItem(),before);
});
test('v3 drafts are read without rewriting and upgraded only after a successful action',()=>{
 const s=storage();const raw=JSON.stringify({version:3,revision:7,data:C.seed()});s.setItem(C.KEY,raw);const store=C.store(s);assert.equal(s.getItem(),raw);assert.equal(store.mode,'ready');
 store.change(d=>C.saveTemplate(d,'meal','friday-dinner','Favourite'));assert.equal(JSON.parse(s.getItem()).version,4);assert.equal(JSON.parse(s.getItem()).revision,8);
});
test('period boundaries use the full plan range, not its first day alone',()=>{
 const p=C.seed().plans[0];assert.equal(C.planningPeriod(p,'2026-09-10'),'upcoming');assert.equal(C.planningPeriod(p,'2026-09-11'),'current');assert.equal(C.planningPeriod(p,'2026-09-13'),'current');assert.equal(C.planningPeriod(p,'2026-09-14'),'past');
 assert.equal(C.planningPeriod(C.seed().events[0],'2026-09-12'),'current');
});
function uiContext(){const ctx=vm.createContext({PlanningCore:C,state:{lang:'en'},location:{hash:'#plan'},escapeHTML:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;'),aiLink:()=>'<button>AI</button>'});
 for(const file of ['welcoming-planning.js','welcoming-planning-editor.js','welcoming-tomato.js'])vm.runInContext(fs.readFileSync(new URL(file,import.meta.url),'utf8'),ctx);
 // The recipe text is read from the existing source without starting the app.
 const main=fs.readFileSync(new URL('welcoming-kitchen.js',import.meta.url),'utf8');vm.runInContext(main.slice(0,main.indexOf('// Scoped to this sample')),ctx);
 vm.runInContext('planningStore={data:PlanningCore.seed(),mode:"ready"}',ctx);return ctx;
}
test('localized editor routes include bounded agenda, independent history and editable menu/tasks',()=>{
 const ctx=uiContext();assert.equal(vm.runInContext('Object.keys(peText.en).sort().join()',ctx),vm.runInContext('Object.keys(peText.de).sort().join()',ctx));
 for(const lang of ['en','de']){vm.runInContext(`state.lang='${lang}'`,ctx);for(const hash of ['#plan','#plan/plans/weekend','#plan/events','#plan/event/saturday','#plan/event/saturday/prep','#plan/recipe/party-main']){const html=vm.runInContext(`renderPlanningEditorRoute('${hash}'.split('/'))`,ctx);assert.ok(html);assert.ok(!html.includes('undefined'));} }
 const agenda=vm.runInContext('peAgenda(planningStore.data.plans[0])',ctx);assert.equal((agenda.match(/class="planning-day[ "]/g)||[]).length,3);assert.match(agenda,/data-pe="meal"/);assert.match(agenda,/data-pe="unlink"/);
});
test('configured preview is isolated and planning examples have no cooking instructions',()=>{
 const ctx=uiContext();vm.runInContext('planningStore.data.events[0].items[0].options.sauce="tomatoes"',ctx);
 const html=vm.runInContext('peRecipe("party-main")',ctx);assert.match(html,/1,200 g/);assert.match(html,/Make the sauce/);assert.doesNotMatch(html,/href="#cook/);
 const source=fs.readFileSync(new URL('welcoming-planning-editor.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest)\s*\(|\b(?:tomatoState|state\.(?:servings|step|timerRemaining|checked))\s*=/);
 vm.runInContext('PlanningCore.savePlannedItem(planningStore.data,"event","saturday","party-main",{kind:"dish",recipeId:"soup",language:"de",servings:2,options:{sauce:"example"}})',ctx);
 const example=vm.runInContext('peRecipe("party-main")',ctx);assert.match(example,/Planning example/);assert.doesNotMatch(example,/method-list|#cook/);
});
test('preview commits reject stale baselines and undo is fenced against later changes',()=>{
 const ctx=uiContext();vm.runInContext('peError=()=>{}',ctx);const result=vm.runInContext('peCommit({next:PlanningCore.seed()},"old",null)',ctx);assert.equal(result,false);
 vm.runInContext('peUndo={before:PlanningCore.seed(),after:JSON.stringify(planningStore.data),route:"#plan"}',ctx);assert.match(vm.runInContext('peUndoMarkup()',ctx),/Undo/);
 vm.runInContext('planningStore.data.plans[0].name="Later edit"',ctx);assert.equal(vm.runInContext('peUndoMarkup()',ctx),'');
});
test('compact cards preserve meal grouping and keep actions in inert templates',()=>{
 const ctx=uiContext(),before=vm.runInContext('JSON.stringify(planningStore.data)',ctx);
 const html=vm.runInContext('peAgenda(planningStore.data.plans[0])',ctx);
 assert.equal((html.match(/class="planning-meal pe-meal"/g)||[]).length,2);
 assert.match(html,/class="pe-linked pe-meal"/);assert.match(html,/class="pe-event-preview"/);
 assert.match(html,/Pasta with tomato sauce/);assert.match(html,/A green salad/);
 assert.match(html,/aria-haspopup="dialog"/);assert.match(html,/<template>/);
 assert.doesNotMatch(html,/<details class="pe-more"|data-planning-action="prev"|data-pe="jump"/);
 assert.equal(vm.runInContext('JSON.stringify(planningStore.data)',ctx),before);
});
test('quick controls show servings and only offer genuine component alternatives',()=>{
 const ctx=uiContext();
 const bolognese=vm.runInContext('peItem(planningStore.data.plans[0].meals[1].items[0])',ctx);
 assert.match(bolognese,/data-pe="quick-servings"/);assert.doesNotMatch(bolognese,/data-pe="quick-sauce"/);
 const tomato=vm.runInContext('peItem(planningStore.data.events[0].items[0])',ctx);assert.match(tomato,/data-pe="quick-sauce"/);
 const note=vm.runInContext('peItem(planningStore.data.plans[0].meals[0].items[0])',ctx);assert.match(note,/pe-note-row/);assert.doesNotMatch(note,/<h3|quick-servings/);
});
test('quick edits preserve every unrelated field and use the normal transactional edit path',()=>{
 const ctx=uiContext();ctx.document={querySelector:()=>({disabled:false})};
 vm.runInContext('peOpen=(title,body,submit)=>globalThis.captured={title,body,submit};peApply=edit=>globalThis.proposed=PlanningCore.previewPlanningEdit(planningStore.data,edit)',ctx);
 vm.runInContext('peQuickItem("party-main","sauce")',ctx);assert.doesNotMatch(ctx.captured.body,/name="kind"|name="recipe"|name="language"|name="servings"/);
 ctx.captured.submit(new Map([['sauce','tomatoes']]));let item=ctx.proposed.next.events[0].items[0];assert.equal(item.options.sauce,'tomatoes');assert.equal(item.servings,6);assert.equal(item.followsGuests,true);assert.deepEqual(item.group,C.seed().events[0].items[0].group);
 vm.runInContext('peQuickItem("party-main","servings")',ctx);assert.match(ctx.captured.body,/required disabled/);ctx.captured.submit(new Map([['servings','3']]));item=ctx.proposed.next.events[0].items[0];assert.equal(item.servings,3);assert.equal(item.followsGuests,false);assert.equal(item.options.sauce,'jar');
 assert.equal(vm.runInContext('planningStore.data.events[0].items[0].servings',ctx),6);
});
test('busy ten-day agenda stays bounded, ordered and renders long localized content',()=>{
 const ctx=uiContext();vm.runInContext(`planningStore.data.plans[0].end='2026-09-20';
 for(const date of PlanningCore.days('2026-09-11','2026-09-20'))for(let n=0;n<3;n++){
 const mid=PlanningCore.saveMeal(planningStore.data,'weekend',null,{name:{en:'A shared dinner with friends',de:'Gemeinsames Abendessen mit Freunden und Familie'},date,time:'19:00'});
 for(const recipeId of ['tomato','bolognese','soup'])PlanningCore.savePlannedItem(planningStore.data,'meal',mid,null,{kind:'dish',recipeId,language:'de',servings:4,options:{sauce:recipeId==='soup'?'example':'jar'}});
 }`,ctx);
 for(const lang of ['en','de']){vm.runInContext(`state.lang='${lang}';planningOffset=0`,ctx);const html=vm.runInContext('peAgenda(planningStore.data.plans[0])',ctx);assert.equal((html.match(/class="planning-day[ "]/g)||[]).length,3);assert.match(html,/data-pe="jump"/);assert.ok(!html.includes('undefined'));}
 vm.runInContext('planningOffset=999',ctx);const end=vm.runInContext('peAgenda(planningStore.data.plans[0])',ctx);assert.equal(vm.runInContext('planningOffset',ctx),7);assert.equal((end.match(/class="planning-day[ "]/g)||[]).length,3);
});
test('out-of-range event cards retain their date and live menu link',()=>{
 const ctx=uiContext();vm.runInContext('planningStore.data.events[0].date="2026-10-03"',ctx);
 for(const lang of ['en','de']){
  vm.runInContext(`state.lang='${lang}'`,ctx);
  const html=vm.runInContext('peAgenda(planningStore.data.plans[0])',ctx);
  assert.ok(html.includes(vm.runInContext('planningDate("2026-10-03")',ctx)));
  assert.match(html,/href="#plan\/event\/saturday"/);
 }
});
