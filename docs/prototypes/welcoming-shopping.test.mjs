import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const C=createRequire(import.meta.url)('./welcoming-planning-core.js');
const full=C.scopeDescriptor('plan','weekend'),event=C.scopeDescriptor('event','saturday');
const rows=(d,s=full)=>C.shoppingTargets(d,s);
const row=(d,key='pasta:g',s=full)=>rows(d,s).find(r=>r.key===key);
function storage(raw=null){let value=raw;return {getItem:()=>value,setItem:(k,v)=>{assert.equal(k,C.KEY);value=v;},removeItem:()=>{value=null;}};}
test('dish coverage is independent, persists in v3, and retains the consolidated remainder',()=>{
  const s=storage(),a=C.store(s),id=row(a.data).sources[0].itemId;
  a.change(d=>C.markShoppingParts(d,full,'pasta:g',[id],'bought'));
  const pasta=row(a.data);assert.equal(pasta.status,'partial');assert.equal(pasta.coveredAmount,220);assert.equal(pasta.remaining,600);assert.equal(pasta.target,820);
  assert.deepEqual(pasta.parts.map(p=>p.status),['bought','needed']);
  assert.equal(JSON.parse(s.getItem()).version,4);assert.equal(row(C.store(s).data).remaining,600);
  a.change(d=>C.markShopping(d,full,'pasta:g','bought'));assert.equal(row(a.data).remaining,0);
  a.change(d=>C.markShoppingParts(d,full,'pasta:g',[id],'needed'));assert.equal(row(a.data).remaining,220);
  a.change(d=>C.markShopping(d,full,'pasta:g','needed'));assert.equal(row(a.data).remaining,820);
});
test('legacy whole-item checks materialize without losing coverage of other dishes',()=>{
  const d=C.seed();C.markShopping(d,full,'pasta:g','have');const raw=JSON.stringify({version:2,revision:4,data:d}),s=storage(raw),a=C.store(s);
  assert.equal(s.getItem(),raw);assert.equal(row(a.data).status,'have');
  a.change(data=>C.markShoppingParts(data,full,'pasta:g',[row(data).sources[0].itemId],'needed'));
  assert.deepEqual(row(a.data).parts.map(p=>p.status),['needed','have']);assert.equal(row(a.data).remaining,220);
});
test('extras remain independent and are not assigned to either recipe',()=>{
  const d=C.seed();C.setShoppingTotal(d,full,'pasta:g',920);
  const ids=row(d).sources.map(s=>s.itemId);C.markShoppingParts(d,full,'pasta:g',ids,'bought');
  assert.equal(row(d).remaining,100);assert.equal(row(d).parts.find(p=>p.id==='@extra').status,'needed');
  C.markShoppingParts(d,full,'pasta:g',['@extra'],'have');assert.equal(row(d).status,'covered');assert.equal(row(d).remaining,0);
  C.setShoppingTotal(d,full,'pasta:g',950);assert.equal(row(d).status,'review');
  C.setShoppingTotal(d,full,'pasta:g',920);assert.equal(row(d).status,'review');
});
test('dish coverage does not leak across dates, increases, removed sources or component forms',()=>{
  const a=C.store(storage()),id=row(a.data).sources[0].itemId;
  a.change(d=>C.markShoppingParts(d,full,'pasta:g',[id],'bought'));
  const fri=C.scopeDescriptor('plan','weekend','dates',[],'2026-09-11','2026-09-11');assert.equal(row(a.data,'pasta:g',fri).status,'needed');
  a.change(d=>d.plans[0].meals[1].items[0].servings=4);assert.equal(row(a.data).status,'review');
  a.change(d=>d.plans[0].meals[1].items[0].servings=2);assert.equal(row(a.data).status,'review');
  a.change(d=>C.markShoppingParts(d,full,'pasta:g',[id],'bought'));
  const removed=C.clone(a.data.plans[0].meals[1].items[0]);a.change(d=>d.plans[0].meals[1].items=[]);
  a.change(d=>d.plans[0].meals[1].items.push(removed));assert.equal(row(a.data).parts.find(p=>p.id===id).status,'needed');
  assert.throws(()=>C.markShoppingParts(a.data,full,'pasta:g',['unknown'],'bought'));
});
test('partial measured and qualitative seasoning coverage remains separate',()=>{
  const d=C.seed(),salt=C.seasoningGroups(d,full)[0],measured=salt.members.find(r=>r.unit==='tsp');
  C.markShoppingParts(d,full,measured.key,measured.parts.map(p=>p.id),'bought');
  assert.equal(C.seasoningGroups(d,full)[0].status,'partial');assert.equal(row(d,'salt:taste').status,'needed');
  C.markSeasoning(d,full,'salt','have');assert.equal(C.seasoningGroups(d,full)[0].status,'have');
});
test('invalid part records are rejected and failed/cross-tab saves preserve protections',()=>{
  const d=C.seed();C.markShoppingParts(d,full,'pasta:g',[row(d).sources[0].itemId],'bought');
  for(const mutate of [p=>p.amount=-1,p=>p.status='partial',p=>p.id='__proto__!',p=>p.review=null]){const bad=C.clone(d);mutate(bad.shopping.scopes[0].adjustments[0].parts[0]);assert.throws(()=>C.validate(bad));}
  const s=storage(),a=C.store(s);a.change(()=>{});const b=C.store(s);
  a.change(data=>C.markShoppingParts(data,full,'pasta:g',[row(data).sources[0].itemId],'bought'));
  assert.equal(b.change(data=>C.markShopping(data,full,'pasta:g','bought')),false);assert.equal(b.mode,'conflict');
  b.reload();s.setItem=()=>{throw Error('Quota');};b.change(data=>C.markShopping(data,full,'pasta:g','bought'));assert.equal(b.mode,'unavailable');assert.equal(row(b.data).remaining,0);
});
test('v1 migration preserves names, recipes, task state and raw data until a successful write',()=>{
  const d=C.seed();delete d.shopping;d.plans[0].name='My original';d.events[0].tasks[0].done=true;
  const raw=JSON.stringify({version:1,revision:8,data:d}),s=storage(raw),a=C.store(s);
  assert.equal(a.mode,'ready');assert.equal(s.getItem(),raw);assert.equal(a.data.plans[0].name,'My original');assert.equal(a.data.events[0].tasks[0].done,true);
  a.change(data=>C.setShoppingTotal(data,full,'pasta:g',920));
  assert.equal(JSON.parse(s.getItem()).version,4);assert.equal(JSON.parse(s.getItem()).revision,9);
  assert.equal(row(C.store(s).data).extra,100);assert.deepEqual(a.data.plans,d.plans);
});
test('malformed migration candidates and future shopping data fail closed',()=>{
  for(const parsed of [{version:1,revision:1,data:C.seed()},{version:2,revision:1,data:{...C.seed(),shopping:{scopes:[{}],views:[]}}},{version:5,revision:1,data:C.seed()}]){
    const raw=JSON.stringify(parsed),s=storage(raw),a=C.store(s);assert.equal(a.mode,'invalid');assert.equal(a.change(()=>{}),false);assert.equal(s.getItem(),raw);
  }
});
test('820 required + 100 extra = 920 target, with minimum enforcement and no recipe changes',()=>{
  const d=C.seed(),original=C.clone(d.plans);C.setShoppingTotal(d,full,'pasta:g',920);
  assert.equal(row(d).amount,820);assert.equal(row(d).extra,100);assert.equal(row(d).target,920);assert.deepEqual(d.plans,original);
  for(const total of [819,-1,NaN,Infinity,1e10,'920'])assert.throws(()=>C.setShoppingTotal(d,full,'pasta:g',total));
  C.setShoppingTotal(d,full,'pasta:g',820);assert.equal(row(d).extra,0);
  assert.throws(()=>C.setShoppingTotal(d,full,'salt:taste',1));
});
test('bought/have/needed are reversible coverage states, not recipe quantity edits',()=>{
  const d=C.seed();for(const status of ['bought','have','needed']){C.markShopping(d,full,'pasta:g',status);assert.equal(row(d).status,status);assert.equal(row(d).amount,820);assert.equal(row(d).target,820);}
  assert.throws(()=>C.markShopping(d,full,'pasta:g','unknown'));assert.throws(()=>C.markShopping(d,full,'nope','have'));
});
test('increased extras or recipe servings need explicit review, which survives later decreases',()=>{
  const s=storage(),a=C.store(s);a.change(d=>C.markShopping(d,full,'pasta:g','have'));
  a.change(d=>C.setShoppingTotal(d,full,'pasta:g',920));assert.equal(row(a.data).status,'review');assert.equal(row(a.data).previousStatus,'have');
  a.change(d=>C.setShoppingTotal(d,full,'pasta:g',820));assert.equal(row(a.data).status,'review');
  a.change(d=>C.markShopping(d,full,'pasta:g','bought'));assert.equal(row(a.data).status,'bought');
  a.change(d=>d.events[0].items[0].servings=8);assert.equal(row(a.data).status,'review');assert.equal(row(a.data).amount,1020);
  assert.equal(row(C.store(s).data).status,'review');
});
test('date range and meal/event scopes recalculate independently, including empty selections',()=>{
  const d=C.seed(),fri=C.scopeDescriptor('plan','weekend','dates',[],'2026-09-11','2026-09-11');
  assert.equal(row(d,'pasta:g',fri).amount,220);assert.equal(row(d,'pasta:g',event).amount,600);
  const sat=C.scopeDescriptor('plan','weekend','meals',['event:saturday','event:saturday']);assert.equal(row(d,'pasta:g',sat).amount,600);
  assert.equal(rows(d,C.scopeDescriptor('plan','weekend','meals',[])).length,0);
  const both=C.scopeDescriptor('plan','weekend','meals',['event:saturday','meal:friday-dinner']);assert.equal(row(d,'pasta:g',both).amount,820);
  C.setShoppingTotal(d,fri,'pasta:g',300);C.markShopping(d,fri,'pasta:g','bought');C.selectScope(d,fri);
  assert.equal(row(d).target,820);assert.equal(row(d).status,'needed');assert.equal(row(d,'pasta:g',event).status,'needed');
  C.selectScope(d,full);C.selectScope(d,fri);assert.equal(C.getScope(d,'plan','weekend').mode,'dates');assert.equal(row(d,'pasta:g',fri).extra,80);assert.equal(row(d,'pasta:g',fri).status,'bought');
});
test('invalid selections cannot silently turn into a full-plan shopping list',()=>{
  const d=C.seed();for(const s of [C.scopeDescriptor('plan','missing'),C.scopeDescriptor('plan','weekend','dates',[],'2026-09-10','2026-09-11'),C.scopeDescriptor('plan','weekend','dates',[],'2026-09-12','2026-09-11'),C.scopeDescriptor('plan','weekend','meals',['meal:missing']),C.scopeDescriptor('event','saturday','meals',[])])assert.throws(()=>C.selectScope(d,s));
  assert.throws(()=>C.shopping(d,'plan','weekend',event));
});
test('long-plan shopping range remains limited and empty-day additions stay visible',()=>{
  const d=C.seed();d.plans[0].end='2026-09-20';const s=C.scopeDescriptor('plan','weekend','dates',[],'2026-09-13','2026-09-13');
  C.saveShoppingPersonal(d,s,{id:'drink',name:'Water',amount:2,unit:'bottle'});assert.equal(rows(d,s).length,1);assert.equal(rows(d,s)[0].target,2);
  assert.equal(row(d).amount,820);
});
test('component changes retain intentional extras as visible orphan rows, not phantom recipe demand',()=>{
  const s=storage(),a=C.store(s);a.change(d=>C.setShoppingTotal(d,event,'sauce:g',1150));
  a.change(d=>d.events[0].items[0].options.sauce='tomatoes');
  const sauce=row(a.data,'sauce:g',event);assert.equal(sauce.amount,0);assert.equal(sauce.extra,100);assert.equal(sauce.orphan,true);assert.equal(sauce.sources.length,0);
  assert.equal(row(a.data,'tomatoes:g',event).amount,1200);
  a.change(d=>C.setShoppingTotal(d,event,'sauce:g',0));assert.equal(row(a.data,'sauce:g',event),undefined);
});
test('removed recipe-only coverage is not reused when the ingredient returns',()=>{
  const a=C.store(storage());a.change(d=>C.markShopping(d,event,'sauce:g','bought'));
  a.change(d=>d.events[0].items[0].options.sauce='tomatoes');a.change(d=>d.events[0].items[0].options.sauce='jar');assert.equal(row(a.data,'sauce:g',event).status,'needed');
});
test('unit consolidation converts only within dimensions and preserves contributions',()=>{
  const d=C.seed();d.events[0].items[1].ingredients.push(['pasta',0.5,'kg'],['pasta',0.25,'l'],['pasta',250,'ml']);
  assert.equal(C.validate(d),true);assert.equal(row(d).amount,1320);assert.equal(row(d,'pasta:ml').amount,500);
  assert.equal(row(d,'pasta:g').sources.at(-1).amount,500);
  d.events[0].items[3].ingredients=[['pasta',1000,'g']];assert.equal(row(d).amount,1320);
});
test('personal items are separate, editable, removable and restorable without altering recipe quantities',()=>{
  const d=C.seed(),item={id:'manual',name:'Dry spaghetti',amount:2,unit:'pack'};
  C.saveShoppingPersonal(d,full,item);assert.equal(row(d).amount,820);assert.equal(row(d,'personal:manual').target,2);
  C.markShopping(d,full,'personal:manual','bought');C.saveShoppingPersonal(d,full,{...item,amount:3});assert.equal(row(d,'personal:manual').status,'review');
  C.saveShoppingPersonal(d,full,{...item,name:'Bread rolls',amount:2,unit:'count'});assert.equal(row(d,'personal:manual').status,'needed');
  const removed=C.removeShoppingPersonal(d,full,'manual');assert.equal(row(d,'personal:manual'),undefined);
  C.saveShoppingPersonal(d,full,removed);assert.equal(row(d,'personal:manual').target,2);assert.equal(C.validate(d),true);
  for(const i of [{...item,name:' '},{...item,name:'x'.repeat(201)},{...item,amount:0},{...item,unit:'unknown'},{...item,id:'<evil>'}])assert.throws(()=>C.saveShoppingPersonal(d,full,i));
});
test('shopping validation rejects corrupt statuses, coverage and duplicate records',()=>{
  const base=C.seed();C.markShopping(base,full,'pasta:g','have');C.selectScope(base,full);
  for(const change of [d=>d.shopping.scopes[0].adjustments[0].extra=-1,d=>d.shopping.scopes[0].adjustments[0].status='done',d=>d.shopping.scopes[0].adjustments[0].covered.amount=-1,d=>d.shopping.scopes.push(C.clone(d.shopping.scopes[0])),d=>d.shopping.views[0].key='missing']){const d=C.clone(base);change(d);assert.throws(()=>C.validate(d));}
});
test('default scope retrieves its saved personal records and restores coverage on undo',()=>{
  const d=C.seed();C.saveShoppingPersonal(d,event,{id:'water',name:'Water',amount:2,unit:'bottle'});
  C.markShopping(d,event,'personal:water','have');
  const removed=C.removeShoppingPersonal(d,event,'water');
  C.saveShoppingPersonal(d,event,removed);
  const saved=C.getScope(d,'event','saturday');
  Object.assign(saved.personal.find(p=>p.id==='water'),removed);
  assert.equal(saved,d.shopping.scopes[0]);assert.equal(row(d,'personal:water',event).status,'have');
  assert.equal(C.validate(d),true);
});
test('explicit draft replacement clears unsaved amounts and transient undo',()=>{
  const ctx=vm.createContext({planningStrings:{en:{},de:{}}});
  vm.runInContext(fs.readFileSync(new URL('./welcoming-shopping.js',import.meta.url),'utf8'),ctx);
  vm.runInContext('shoppingDrafts.set("test","999");shoppingEditors.add("test");shoppingUndo={record:{}};clearShoppingTransient()',ctx);
  assert.equal(vm.runInContext('shoppingDrafts.size',ctx),0);assert.equal(vm.runInContext('shoppingUndo',ctx),null);
  assert.equal(vm.runInContext('shoppingEditors.size',ctx),0);
});
test('below-minimum input resets on finishing an edit, not while typing or for empty/invalid values',()=>{
  const error={textContent:''},announcements=[];
  const input={value:'100',dataset:{shopTotal:'pasta:g'},setAttribute(k,v){this[k]=v;}};
  const ctx=vm.createContext({PlanningCore:C,state:{lang:'en'},location:{hash:'#plan/shopping/plan/weekend'},document:{getElementById:()=>error},announce:message=>announcements.push(message),input});
  for(const file of ['welcoming-planning.js','welcoming-shopping.js'])vm.runInContext(fs.readFileSync(new URL('./'+file,import.meta.url),'utf8'),ctx);
  vm.runInContext('planningStore={data:PlanningCore.seed(),mode:"ready"};PlanningCore.setShoppingTotal(planningStore.data,currentShopping(),"pasta:g",920)',ctx);
  assert.equal(vm.runInContext('validateShoppingInput(input)',ctx),false);assert.equal(input.value,'100');
  assert.equal(vm.runInContext('validateShoppingInput(input,true)',ctx),true);assert.equal(input.value,'820');assert.equal(error.textContent,'');
  assert.equal(vm.runInContext('shoppingDrafts.get(shoppingDraftKey(currentShopping(),"pasta:g"))',ctx),'820');
  assert.equal(vm.runInContext('PlanningCore.shoppingTargets(planningStore.data,currentShopping()).find(r=>r.key==="pasta:g").target',ctx),920,'blur changes the field, not saved shopping');
  assert.match(announcements[0],/820 g/);
  for(const value of ['', 'not a number','Infinity','1000000001']){input.value=value;assert.equal(vm.runInContext('validateShoppingInput(input,true)',ctx),false);assert.equal(input.value,value);}
  input.value='950';assert.equal(vm.runInContext('validateShoppingInput(input,true)',ctx),true);assert.equal(input.value,'950');
  input.value='0';ctx.state.lang='de';assert.equal(vm.runInContext('validateShoppingInput(input,true)',ctx),true);assert.equal(input.value,'820');assert.match(announcements.at(-1),/Rezeptmenge/);
  input.value='100';vm.runInContext('planningStore.mode="conflict"',ctx);assert.equal(vm.runInContext('validateShoppingInput(input,true)',ctx),false);assert.equal(input.value,'100');
});
test('cross-tab and write-failure protections also apply to extras and checks',()=>{
  const s=storage(),a=C.store(s);a.change(()=>{});const b=C.store(s);
  a.change(d=>C.setShoppingTotal(d,full,'pasta:g',920));assert.equal(b.change(d=>C.markShopping(d,full,'pasta:g','bought')),false);assert.equal(b.mode,'conflict');
  b.reload();assert.equal(row(b.data).extra,100);s.setItem=()=>{throw Error('Quota');};
  assert.equal(b.change(d=>C.markShopping(d,full,'pasta:g','have')),true);assert.equal(b.mode,'unavailable');assert.equal(row(b.data).status,'have');
});
test('shopping copy and states render in both languages with native controls and escaped personal text',()=>{
  const ctx=vm.createContext({PlanningCore:C,state:{lang:'en'},location:{hash:'#plan/shopping/plan/weekend'},app:{innerHTML:''},escapeHTML:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),aiLink:()=>''});
  for(const file of ['welcoming-planning.js','welcoming-shopping.js'])vm.runInContext(fs.readFileSync(new URL('./'+file,import.meta.url),'utf8'),ctx);
  vm.runInContext('planningStore={data:PlanningCore.seed(),mode:"ready"}',ctx);
  assert.equal(vm.runInContext('Object.keys(shoppingCopy.en).sort().join()',ctx),vm.runInContext('Object.keys(shoppingCopy.de).sort().join()',ctx));
  vm.runInContext('PlanningCore.setShoppingTotal(planningStore.data,currentShopping(),"pasta:g",920);PlanningCore.markShopping(planningStore.data,currentShopping(),"pasta:g","bought");PlanningCore.saveShoppingPersonal(planningStore.data,currentShopping(),{id:"test",name:"<img src=x>",amount:1,unit:"pack"})',ctx);
  for(const lang of ['en','de']){ctx.state.lang=lang;vm.runInContext('renderPlanning()',ctx);assert.ok(!ctx.app.innerHTML.includes('undefined'));assert.match(ctx.app.innerHTML,/type="checkbox"/);assert.match(ctx.app.innerHTML,/920 g/);assert.match(ctx.app.innerHTML,/&lt;img src=x&gt;/);assert.match(ctx.app.innerHTML,/data-shop-action="change-amount"/);assert.ok(!ctx.app.innerHTML.includes('data-shop-total-form'));assert.ok(!ctx.app.innerHTML.includes('read-only preview'));}
  vm.runInContext('planningStore.mode="conflict";renderPlanning()',ctx);assert.match(ctx.app.innerHTML,/data-shop-action="add" disabled/);
});
test('seasoning groups show salt once but retain measured and qualitative demand separately',()=>{
  const d=C.seed(),before=C.clone(C.shopping(d,'plan','weekend'));
  const groups=C.seasoningGroups(d,full),salt=groups.find(g=>g.ingredient==='salt');
  assert.equal(groups.length,2);assert.equal(salt.status,'unchecked');assert.equal(salt.members.length,2);
  assert.deepEqual(salt.members.map(r=>[r.amount,r.unit]),[[1,'tsp'],[null,'taste']]);
  assert.deepEqual(C.shopping(d,'plan','weekend'),before);
  assert.ok(!groups.some(g=>['pasta','lentils','bread'].includes(g.ingredient)));
  assert.equal(C.seasoningGroups(d,C.scopeDescriptor('plan','weekend','meals',[])).length,0);
});
test('seasoning coverage applies to all unit rows, persists, and stays scoped',()=>{
  const s=storage(),a=C.store(s),original=C.clone(a.data.plans);
  for(const status of ['have','needed','bought']){
    a.change(d=>C.markSeasoning(d,full,'salt',status));
    assert.equal(C.seasoningGroups(a.data,full)[0].status,status);
    assert.ok(rows(a.data).filter(r=>r.ingredient==='salt').every(r=>r.status===status));
    assert.equal(C.seasoningGroups(C.store(s).data,full)[0].status,status);
  }
  assert.equal(C.seasoningGroups(a.data,event)[0].status,'unchecked');assert.deepEqual(a.data.plans,original);
  assert.throws(()=>C.markSeasoning(a.data,full,'pasta','have'));assert.throws(()=>C.markSeasoning(a.data,full,'salt','invalid'));
});
test('partial seasoning checks stay partial; increased requirements ask for review',()=>{
  const a=C.store(storage());a.change(d=>C.markShopping(d,full,'salt:tsp','have'));
  assert.equal(C.seasoningGroups(a.data,full)[0].status,'partial');
  a.change(d=>C.markSeasoning(d,full,'salt','have'));
  a.change(d=>d.plans[0].meals[1].items[0].servings=4);
  assert.equal(C.seasoningGroups(a.data,full)[0].status,'review');
  a.change(d=>C.markSeasoning(d,full,'salt','have'));assert.equal(C.seasoningGroups(a.data,full)[0].status,'have');
  a.change(d=>C.markShopping(d,full,'salt:taste','bought'));assert.equal(C.seasoningGroups(a.data,full)[0].status,'covered');
});
test('existing seasoning extras remain visible without being interpreted as packs',()=>{
  const d=C.seed();C.setShoppingTotal(d,full,'salt:tsp',3);
  const salt=C.seasoningGroups(d,full)[0];assert.equal(salt.members.find(r=>r.unit==='tsp').extra,2);
  assert.equal(salt.members.find(r=>r.unit==='taste').amount,null);assert.equal(C.validate(d),true);
});
test('seasoning summaries are quantity-free in EN/DE with one native disclosure per ingredient',()=>{
  const ctx=vm.createContext({PlanningCore:C,state:{lang:'en'},location:{hash:'#plan/shopping/plan/weekend'},app:{innerHTML:''},escapeHTML:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),aiLink:()=>''});
  for(const file of ['welcoming-planning.js','welcoming-shopping.js'])vm.runInContext(fs.readFileSync(new URL('./'+file,import.meta.url),'utf8'),ctx);
  vm.runInContext('planningStore={data:PlanningCore.seed(),mode:"ready"}',ctx);
  for(const lang of ['en','de']){
    ctx.state.lang=lang;vm.runInContext('renderPlanning()',ctx);const html=ctx.app.innerHTML;
    assert.equal((html.match(/data-shop-row="seasoning:salt"/g)||[]).length,1);
    assert.ok(!html.includes('data-shop-row="salt:tsp"'));assert.ok(!html.includes('data-shop-row="salt:taste"'));
    assert.ok(!html.includes('data-shop-total="herbs:tsp"'));
    const summary=html.match(/data-shop-detail="seasoning:salt"><summary[^>]*>(.*?)<\/summary>/s)[1];
    assert.ok(!summary.includes('<strong>'));assert.ok(!summary.includes('taste'));assert.ok(!summary.includes('Geschmack'));
    assert.ok(html.includes(lang==='en'?'Herbs & spices':'Kräuter & Gewürze'));
    assert.ok(html.includes(lang==='en'?'to taste':'nach Geschmack'));
    assert.ok(html.includes('data-shop-action="change-amount" data-key="pasta:g"'));
  }
  vm.runInContext('planningStore.mode="conflict";renderPlanning()',ctx);assert.match(ctx.app.innerHTML,/data-shop-seasoning="salt"[^>]* disabled/);
});
test('last shopping owner is optional, persisted, validated and falls back safely',()=>{
  const s=storage(),a=C.store(s);
  assert.deepEqual(C.lastShoppingOwner(a.data),{kind:'plan',ownerId:'weekend'});
  a.change(d=>C.rememberShoppingOwner(d,'event','saturday'));
  assert.deepEqual(C.lastShoppingOwner(C.store(s).data),{kind:'event',ownerId:'saturday'});
  assert.throws(()=>C.rememberShoppingOwner(a.data,'event','missing'));
  const d=C.seed();d.shopping.lastOwner={kind:'event',ownerId:'deleted'};
  assert.equal(C.validate(d),true);assert.equal(C.lastShoppingOwner(d).ownerId,'weekend');
  d.plans=[];assert.equal(C.lastShoppingOwner(d).ownerId,'saturday');d.events=[];assert.equal(C.lastShoppingOwner(d),null);
  d.shopping.lastOwner={kind:'bad',ownerId:'x'};assert.throws(()=>C.validate(d));
});

test('seasoning copy is quiet without hiding unchecked, covered or changed states',()=>{
  const ctx=navigationContext();
  for(const lang of ['en','de']){
    ctx.state.lang=lang;
    for(const status of ['unchecked','needed','have','bought','covered','review']){
      ctx.status=status;
      const html=vm.runInContext('shoppingSeasoningRow({...PlanningCore.seasoningGroups(planningStore.data,currentShopping())[0],status,covered:["have","bought","covered"].includes(status)})',ctx);
      const summary=html.match(/<label class="shopping-name-check"[\s\S]*?<\/label>/)[0];
      if(status==='needed')assert.ok(!summary.includes('shopping-state'));
      else assert.match(summary,/shopping-state/);
      if(status==='review')assert.match(summary,/shopping-review/);
      assert.ok(!html.includes('<p class="shopping-hint">'));
      assert.match(html,/ul aria-label="(Recipe amounts|Rezeptmengen)"/);
      assert.match(html,/1 (tsp|TL)/);
      assert.match(html,/to taste|nach Geschmack/);
      assert.match(html,/data-shop-seasoning="salt"/);
    }
  }
});

test('secondary actions use theme-aware grey and preserve blue interaction feedback',()=>{
  const css=fs.readFileSync(new URL('./welcoming-shopping.css',import.meta.url),'utf8');
  assert.match(css,/\.shopping-row-actions \.text-link\{color:var\(--muted\)\}/);
  assert.match(css,/:not\(:disabled\):is\(:hover,:focus-visible\)\{color:var\(--blue\)\}/);
  const base=fs.readFileSync(new URL('./welcoming-kitchen.css',import.meta.url),'utf8');
  const luminance=hex=>hex.match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[0.2126,0.7152,0.0722][i],0);
  for(const selector of [':root','html[data-theme=dark]']){
    const block=base.slice(base.indexOf(selector)).split('}')[0];
    const color=name=>luminance(block.match(new RegExp('--'+name+':#([0-9a-f]{6})'))[1]);
    const a=color('muted'),b=color('paper');
    assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5,selector+' secondary action contrast');
  }
});
function navigationContext(){
  const adapter=storage(),ctx=vm.createContext({PlanningCore:C,state:{lang:'en'},location:{hash:'#shopping'},app:{innerHTML:''},escapeHTML:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),aiLink:()=>'',adapter});
  for(const file of ['welcoming-planning.js','welcoming-shopping.js'])vm.runInContext(fs.readFileSync(new URL('./'+file,import.meta.url),'utf8'),ctx);
  vm.runInContext('planningStore=PlanningCore.store(adapter)',ctx);return ctx;
}

test('view preference is optional, validated and saved without changing shopping or recipes',()=>{
  const adapter=storage(),a=C.store(adapter),before=C.clone(a.data);
  assert.equal(C.validate(before),true);
  for(const shoppingLayout of C.shoppingLayouts){
    a.change(d=>{d.preferences.shoppingLayout=shoppingLayout;});
    assert.equal(C.store(adapter).data.preferences.shoppingLayout,shoppingLayout);
    assert.deepEqual(a.data.shopping,before.shopping);assert.deepEqual(a.data.plans,before.plans);
  }
  assert.throws(()=>a.change(d=>{d.preferences.shoppingLayout='bad';}));
  assert.equal(a.data.preferences.shoppingLayout,'amount');
});

test('consolidated views keep each ingredient once; Dish references preserve the aggregate',()=>{
  const ctx=navigationContext();
  vm.runInContext('PlanningCore.setShoppingTotal(planningStore.data,currentShopping(),"pasta:g",920);PlanningCore.markShopping(planningStore.data,currentShopping(),"pasta:g","have")',ctx);
  const before=vm.runInContext('JSON.stringify(planningStore.data.shopping)',ctx);
  for(const layout of ['alphabetical','dish','amount']){
    ctx.layout=layout;
    const groups=vm.runInContext('shoppingViewGroups(planningStore.data,currentShopping(),layout,"en")',ctx);
    const rows=groups.flatMap(g=>g.rows),keys=rows.map(r=>r.key);
    assert.equal(new Set(keys).size,8);assert.equal(keys.length,layout==='dish'?11:8);
    const pasta=rows.find(r=>r.key==='pasta:g');assert.equal(pasta.target,920);assert.equal(pasta.extra,100);assert.equal(pasta.status,'have');
    assert.equal(rows.filter(r=>r.ingredient==='salt').length,layout==='dish'?2:1);
  }
  assert.equal(vm.runInContext('JSON.stringify(planningStore.data.shopping)',ctx),before);
});

test('alphabetical order follows the displayed language and includes personal items',()=>{
  const ctx=navigationContext();
  vm.runInContext('PlanningCore.saveShoppingPersonal(planningStore.data,currentShopping(),{id:"apple",name:"Apples",amount:2,unit:"count"})',ctx);
  for(const lang of ['en','de']){
    ctx.lang=lang;
    const rows=vm.runInContext('shoppingViewGroups(planningStore.data,currentShopping(),"alphabetical",lang)[0].rows',ctx);
    const names=Array.from(rows,r=>r.personal?r.name:C.ingredients[r.ingredient][lang]);
    assert.deepEqual(names,[...names].sort(new Intl.Collator(lang,{sensitivity:'base',numeric:true}).compare));
  }
});

test('amount view orders weight, counts and other units without comparing volume to weight',()=>{
  const ctx=navigationContext();
  vm.runInContext('for(const p of [{id:"flour",name:"Flour",amount:2,unit:"kg"},{id:"milk",name:"Milk",amount:1,unit:"l"},{id:"water",name:"Water",amount:750,unit:"ml"},{id:"rolls",name:"Rolls",amount:4,unit:"count"}])PlanningCore.saveShoppingPersonal(planningStore.data,currentShopping(),p)',ctx);
  const groups=vm.runInContext('shoppingViewGroups(planningStore.data,currentShopping(),"amount","en")',ctx);
  assert.deepEqual(Array.from(groups,g=>g.key),['weightGroup','countGroup','otherGroup']);
  assert.deepEqual(Array.from(groups[0].rows,r=>r.key),['personal:flour','sauce:g','pasta:g','lentils:g']);
  assert.equal(groups[1].rows[0].key,'personal:rolls');
  assert.deepEqual(Array.from(groups[2].rows.slice(0,2),r=>r.key),['personal:milk','personal:water']);
  assert.ok(groups[2].rows.slice(2).every(r=>r.members));
});

test('Dish groups contain full recipes with local amounts and respect dates',()=>{
  const ctx=navigationContext();
  const groups=vm.runInContext('shoppingViewGroups(planningStore.data,currentShopping(),"dish","en")',ctx);
  assert.ok(groups.some(g=>g.title==='Lentil Bolognese'));
  assert.ok(groups.some(g=>g.title==='A green salad'));
  assert.ok(!groups.some(g=>g.title==='Dinner'));
  assert.ok(!groups.some(g=>g.key==='shared'));
  const bolognese=groups.find(g=>g.key==='recipe:bolognese'),tomato=groups.find(g=>g.key==='recipe:tomato');
  assert.deepEqual(Array.from(bolognese.rows,r=>r.key).sort(),['lentils:g','pasta:g','sauce:g','seasoning:herbs','seasoning:salt']);
  assert.deepEqual(Array.from(tomato.rows,r=>r.key).sort(),['pasta:g','sauce:g','seasoning:salt']);
  assert.equal(bolognese.rows.find(r=>r.key==='pasta:g').presentation.amount,220);
  assert.equal(tomato.rows.find(r=>r.key==='pasta:g').presentation.amount,600);
  assert.equal(bolognese.rows.find(r=>r.key==='pasta:g').target,820);
  vm.runInContext('PlanningCore.selectScope(planningStore.data,PlanningCore.scopeDescriptor("plan","weekend","dates",[],"2026-09-11","2026-09-11"))',ctx);
  const friday=vm.runInContext('shoppingViewGroups(planningStore.data,currentShopping(),"dish","en")',ctx);
  assert.equal(friday.length,1);assert.equal(friday[0].key,'recipe:bolognese');
  assert.equal(friday[0].rows.find(r=>r.key==='pasta:g').amount,220);
});

test('Dish references expose local quantities, totals and independent dish checkboxes, in EN/DE',()=>{
  const ctx=navigationContext();
  for(const lang of ['en','de']){
    ctx.state.lang=lang;
    vm.runInContext('planningStore.data.preferences.shoppingLayout="dish";renderPlanning()',ctx);
    const html=ctx.app.innerHTML;
    assert.ok(!html.includes('data-shop-group="shared"'));
    assert.equal((html.match(/data-shop-row="pasta:g"/g)||[]).length,2);
    assert.ok(!html.includes('data-shop-check="pasta:g"'));
    assert.ok(!html.includes('data-shop-seasoning="salt"'));
    assert.match(html,/<strong[^>]*>220 g<\/strong>/);assert.match(html,/<strong[^>]*>600 g<\/strong>/);
    assert.equal((html.match(/data-shop-dish="recipe:[^"]+\|pasta:g"/g)||[]).length,2);assert.match(html,/class="shopping-all-quantity"[^>]*>820 g/);
    assert.match(html,lang==='en'?/Also in Pasta with tomato sauce/:/Auch in Pasta mit Tomatensauce/);
    const details=[...html.matchAll(/data-shop-detail="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(details).size,details.length);
  }
});

test('Dish references share saved purchase state and extras without changing recipe quantities',()=>{
  const ctx=navigationContext();
  vm.runInContext('planningStore.data.preferences.shoppingLayout="dish";PlanningCore.setShoppingTotal(planningStore.data,currentShopping(),"pasta:g",920);PlanningCore.markShopping(planningStore.data,currentShopping(),"pasta:g","bought");renderPlanning()',ctx);
  const references=vm.runInContext('shoppingViewGroups(planningStore.data,currentShopping(),"dish","en").flatMap(g=>g.rows).filter(r=>r.key==="pasta:g")',ctx);
  assert.deepEqual(Array.from(references,r=>r.presentation.amount),[220,600]);
  assert.ok(references.every(r=>r.target===920&&r.extra===100&&r.status==='bought'));
  assert.equal((ctx.app.innerHTML.match(/class="shopping-all-quantity"[^>]*>920 g/g)||[]).length,2);
  vm.runInContext('planningStore.data.preferences.shoppingLayout="category";renderPlanning()',ctx);
  assert.equal((ctx.app.innerHTML.match(/data-shop-row="pasta:g"/g)||[]).length,1);
});

test('duplicate Dish editors have unique IDs and obsolete drafts clear after an aggregate save',()=>{
  const ctx=navigationContext();
  vm.runInContext('planningStore.data.preferences.shoppingLayout="dish";for(const dish of ["bolognese","tomato"]){const key=shoppingDraftKey(currentShopping(),"recipe:"+dish+"|pasta:g");shoppingEditors.add(key);shoppingDrafts.set(key,"999");}renderPlanning()',ctx);
  const ids=[...ctx.app.innerHTML.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  assert.equal((ctx.app.innerHTML.match(/data-shop-total="pasta:g"/g)||[]).length,2);
  vm.runInContext('shoppingClearAmount(currentShopping(),"pasta:g");renderPlanning()',ctx);
  assert.equal(vm.runInContext('shoppingEditors.size+shoppingDrafts.size',ctx),0);
});

test('dish checkbox follow-up supports Check all, one-action undo, dismissal and stale-undo protection',()=>{
  const ctx=navigationContext(),handlers={};ctx.document={addEventListener:(name,fn)=>handlers[name]=fn};ctx.announce=()=>{};
  vm.runInContext('planningStore.data.preferences.shoppingLayout="dish";shoppingRefresh=()=>{};bindShoppingEvents()',ctx);
  const tick=()=>handlers.change({target:{dataset:{shopDish:'recipe:bolognese|pasta:g'},checked:true}});
  const action=value=>handlers.click({target:{closest:selector=>selector==='[data-shop-action]'?{dataset:{shopAction:value,key:'pasta:g'}}:null}});
  const remaining=()=>vm.runInContext('PlanningCore.shoppingTargets(planningStore.data,currentShopping()).find(r=>r.key==="pasta:g").remaining',ctx);
  tick();assert.equal(remaining(),600);action('check-all');assert.equal(remaining(),0);action('undo-check');assert.equal(remaining(),600);
  tick();action('dismiss-check');assert.equal(remaining(),600);assert.equal(vm.runInContext('shoppingCheckNotice',ctx),null);
  tick();vm.runInContext('planningStore.change(d=>PlanningCore.setShoppingTotal(d,currentShopping(),"pasta:g",920))',ctx);action('undo-check');assert.equal(remaining(),700);
});

test('partial consolidated checkbox renders mixed with remaining quantity; arrows contain no names',()=>{
  const ctx=navigationContext();
  vm.runInContext('const scope=currentShopping();const p=PlanningCore.shoppingTargets(planningStore.data,scope).find(r=>r.key==="pasta:g");PlanningCore.markShoppingParts(planningStore.data,scope,"pasta:g",[p.sources[0].itemId],"bought");renderPlanning()',ctx);
  assert.match(ctx.app.innerHTML,/aria-checked="mixed"/);assert.match(ctx.app.innerHTML,/600 g remaining of 820 g/);
  const summaries=[...ctx.app.innerHTML.matchAll(/<summary aria-label="Details:[^"]*">([\s\S]*?)<\/summary>/g)];assert.ok(summaries.length);
  assert.ok(summaries.every(s=>!s[1].includes('shopping-item-name')&&s[1].includes('<svg')));
  assert.match(ctx.app.innerHTML,/<label class="shopping-name-check"[^>]*><input[^>]*>[\s\S]*?shopping-item-name/);
  const mixed={indeterminate:false};ctx.document={querySelectorAll:()=>[mixed]};vm.runInContext('shoppingApplyMixed()',ctx);assert.equal(mixed.indeterminate,true);
});

test('two-day shortcut stays in the plan and does not add dates or mutate the plan',()=>{
  const ctx=navigationContext();ctx.plan={start:'2026-09-11',end:'2026-09-17'};
  const range=(from,today)=>{ctx.from=from;ctx.today=today;return JSON.parse(vm.runInContext('JSON.stringify(shoppingTwoDayRange(plan,from,today))',ctx));};
  assert.deepEqual(range(null,'2026-09-13'),{from:'2026-09-13',to:'2026-09-14'});
  assert.deepEqual(range(null,'2026-09-08'),{from:'2026-09-11',to:'2026-09-12'});
  assert.deepEqual(range('2026-09-17','2026-09-13'),{from:'2026-09-17',to:'2026-09-17'});
  assert.throws(()=>range('2026-09-18','2026-09-13'));
  assert.deepEqual(ctx.plan,{start:'2026-09-11',end:'2026-09-17'});
});

test('all views render EN/DE with one labelled picker, escaped sources and isolated editors',()=>{
  const ctx=navigationContext();
  vm.runInContext('planningStore.data.events[0].items[1].name="<salad>";shoppingEditors.add(shoppingDraftKey(currentShopping(),"pasta:g"));shoppingDrafts.set(shoppingDraftKey(currentShopping(),"pasta:g"),"999")',ctx);
  for(const lang of ['en','de'])for(const layout of C.shoppingLayouts){
    ctx.state.lang=lang;ctx.layout=layout;
    vm.runInContext('planningStore.data.preferences.shoppingLayout=layout;if(layout==="dish"){shoppingEditors.add(shoppingDraftKey(currentShopping(),"recipe:tomato|pasta:g"));shoppingDrafts.set(shoppingDraftKey(currentShopping(),"recipe:tomato|pasta:g"),"999");}renderPlanning()',ctx);
    assert.match(ctx.app.innerHTML,/for="shopping-layout"/);
    assert.equal((ctx.app.innerHTML.match(/id="shopping-layout"/g)||[]).length,1);
    assert.equal((ctx.app.innerHTML.match(/data-shop-total="pasta:g"/g)||[]).length,1);
    assert.match(ctx.app.innerHTML,/value="999"/);assert.ok(!ctx.app.innerHTML.includes('undefined'));assert.ok(!ctx.app.innerHTML.includes('<salad>'));
    if(layout==='dish')assert.match(ctx.app.innerHTML,/&lt;salad&gt;/);
  }
});

test('view changes respect cross-tab conflicts and storage failures',()=>{
  const adapter=storage(),a=C.store(adapter);a.change(()=>{});const b=C.store(adapter);
  a.change(d=>{d.preferences.shoppingLayout='dish';});
  assert.equal(b.change(d=>{d.preferences.shoppingLayout='amount';}),false);assert.equal(b.mode,'conflict');
  b.reload();assert.equal(b.data.preferences.shoppingLayout,'dish');
  adapter.setItem=()=>{throw Error('quota');};
  assert.equal(b.change(d=>{d.preferences.shoppingLayout='amount';}),true);assert.equal(b.mode,'unavailable');assert.equal(b.data.preferences.shoppingLayout,'amount');
});

test('view selector handler retains scope and blocks mutations on conflict',()=>{
  const ctx=navigationContext(),handlers={},focus=[];
  ctx.document={addEventListener:(name,fn)=>handlers[name]=fn,getElementById:()=>({focus:()=>focus.push('picker')})};ctx.announce=()=>{};
  vm.runInContext('shoppingRefresh=()=>{};bindShoppingEvents()',ctx);
  const input={id:'shopping-layout',value:'dish'};
  handlers.change({target:input});assert.equal(vm.runInContext('shoppingLayout()',ctx),'dish');assert.deepEqual(focus,['picker']);
  assert.equal(vm.runInContext('currentShopping().mode',ctx),'all');
  vm.runInContext('planningStore={data:planningStore.data,mode:"conflict",change(){throw Error("no writes")}}',ctx);
  input.value='amount';handlers.change({target:input});assert.equal(vm.runInContext('shoppingLayout()',ctx),'dish');
});

test('compact rows keep sources, omit duplicate status controls and defer amount forms in EN/DE',()=>{
  const ctx=navigationContext();
  for(const lang of ['en','de']){
    ctx.state.lang=lang;vm.runInContext('renderPlanning()',ctx);
    assert.ok(!ctx.app.innerHTML.includes(lang==='en'?'Shopping for:':'Einkauf für:'));
    assert.match(ctx.app.innerHTML,/aria-haspopup="dialog"/);
    const html=vm.runInContext('shoppingRow(PlanningCore.shoppingTargets(planningStore.data,currentShopping()).find(r=>r.key==="pasta:g"),currentShopping())',ctx);
    assert.match(html,/aria-label="(Needed for|Benötigt für)"/);
    assert.match(html,/data-status="have"/);assert.ok(!html.includes('data-status="bought"'));assert.ok(!html.includes('data-status="needed"'));
    assert.ok(!html.includes('<form'));assert.ok(!html.includes('Shopping total'));
  }
  vm.runInContext('PlanningCore.markShopping(planningStore.data,currentShopping(),"pasta:g","have");renderPlanning()',ctx);
  assert.match(ctx.app.innerHTML,/data-status="needed"/);
});

test('amount editor is scoped, preserves drafts and is disabled on conflict',()=>{
  const ctx=navigationContext();
  vm.runInContext('shoppingEditors.add(shoppingDraftKey(currentShopping(),"pasta:g"));shoppingDrafts.set(shoppingDraftKey(currentShopping(),"pasta:g"),"920");renderPlanning()',ctx);
  assert.equal((ctx.app.innerHTML.match(/data-shop-total-form/g)||[]).length,1);
  assert.match(ctx.app.innerHTML,/value="920"/);assert.match(ctx.app.innerHTML,/Minimum: 820 g/);
  assert.match(ctx.app.innerHTML,/data-shop-action="cancel-amount"/);
  vm.runInContext('PlanningCore.markShopping(planningStore.data,currentShopping(),"lettuce:count","bought");renderPlanning()',ctx);
  assert.match(ctx.app.innerHTML,/value="920"/);
  ctx.location.hash='#shopping/event/saturday';vm.runInContext('renderPlanning()',ctx);assert.ok(!ctx.app.innerHTML.includes('data-shop-total-form'));
  ctx.location.hash='#shopping/plan/weekend';vm.runInContext('planningStore={data:planningStore.data,mode:"conflict"};renderPlanning()',ctx);
  assert.match(ctx.app.innerHTML,/data-shop-total="pasta:g"[^>]* disabled/);
});

test('amount open/cancel/Escape/save handlers retain minimum rules and restore row focus',()=>{
  const ctx=navigationContext(),handlers={},focuses=[],error={textContent:''};
  ctx.document={addEventListener:(name,fn)=>handlers[name]=fn,getElementById:()=>error};
  ctx.announce=()=>{};ctx.focuses=focuses;
  vm.runInContext('shoppingRefresh=(key,control)=>focuses.push([key,control]);bindShoppingEvents()',ctx);
  const click=(action,key='pasta:g')=>handlers.click({target:{closest:selector=>selector==='[data-shop-action]'?{dataset:{shopAction:action,key}}:null}});
  click('change-amount');assert.equal(vm.runInContext('shoppingEditors.size',ctx),1);
  assert.equal(focuses.at(-1)[1],'input[data-shop-total]');
  vm.runInContext('shoppingDrafts.set(shoppingDraftKey(currentShopping(),"pasta:g"),"999")',ctx);
  click('cancel-amount');assert.equal(vm.runInContext('shoppingEditors.size',ctx),0);assert.equal(vm.runInContext('shoppingDrafts.size',ctx),0);
  assert.equal(focuses.at(-1)[1],'[data-shop-action="change-amount"]');
  click('change-amount');
  const input={value:'920',dataset:{shopTotal:'pasta:g'},setAttribute(k,v){this[k]=v;},focus(){}};
  const form={dataset:{shopTotalForm:'pasta:g'},matches:()=>true,querySelector:()=>input};
  handlers.submit({target:form,preventDefault(){}});
  assert.equal(vm.runInContext('PlanningCore.shoppingTargets(planningStore.data,currentShopping()).find(r=>r.key==="pasta:g").extra',ctx),100);
  assert.equal(vm.runInContext('shoppingEditors.size',ctx),0);
  click('change-amount');input.value='100';handlers.submit({target:form,preventDefault(){}});assert.equal(input.value,'820');
  assert.equal(vm.runInContext('PlanningCore.shoppingTargets(planningStore.data,currentShopping()).find(r=>r.key==="pasta:g").extra',ctx),0);
  click('change-amount');input.value='';handlers.submit({target:form,preventDefault(){}});assert.equal(vm.runInContext('shoppingEditors.size',ctx),1);assert.notEqual(error.textContent,'');
  handlers.keydown({key:'Escape',preventDefault(){},target:{closest:()=>({querySelector:()=>({click:()=>click('cancel-amount')})})}});
  assert.equal(vm.runInContext('shoppingEditors.size',ctx),0);
  click('change-amount');input.value='920';handlers.submit({target:form,preventDefault(){}});
  click('change-amount');click('clear');assert.equal(vm.runInContext('shoppingEditors.size',ctx),0);
  assert.equal(vm.runInContext('PlanningCore.shoppingTargets(planningStore.data,currentShopping()).find(r=>r.key==="pasta:g").extra',ctx),0);
});
test('new and legacy shopping routes share scope, quantities and checks without copying records',()=>{
  const ctx=navigationContext();
  ctx.location.hash='#plan/shopping/plan/weekend';vm.runInContext('renderPlanning();PlanningCore.markShopping(planningStore.data,currentShopping(),"pasta:g","have")',ctx);
  const key=vm.runInContext('PlanningCore.scopeKey(currentShopping())',ctx);
  for(const hash of ['#shopping/plan/weekend','#shopping','#plan/shopping/plan/weekend']){
    ctx.location.hash=hash;vm.runInContext('renderPlanning()',ctx);
    assert.equal(vm.runInContext('PlanningCore.scopeKey(currentShopping())',ctx),key);
    assert.equal(vm.runInContext('PlanningCore.shoppingTargets(planningStore.data,currentShopping()).find(r=>r.key==="pasta:g").status',ctx),'have');
    assert.ok(!ctx.app.innerHTML.includes('class="planning-nav"'));assert.ok(ctx.app.innerHTML.includes('Switch list'));
  }
  assert.equal(vm.runInContext('planningStore.data.shopping.scopes.length',ctx),1);
});
test('Shopping reopens last visited event across refresh without saving on every render',()=>{
  const ctx=navigationContext();ctx.location.hash='#shopping/event/saturday';vm.runInContext('renderPlanning()',ctx);
  const raw=ctx.adapter.getItem();vm.runInContext('renderPlanning()',ctx);assert.equal(ctx.adapter.getItem(),raw);
  ctx.location.hash='#shopping';vm.runInContext('planningStore=PlanningCore.store(adapter);renderPlanning()',ctx);
  assert.equal(vm.runInContext('currentShopping().ownerId',ctx),'saturday');assert.match(ctx.app.innerHTML,/Saturday around the table/);
  vm.runInContext('PlanningCore.selectScope(planningStore.data,PlanningCore.scopeDescriptor("plan","weekend","meals",["meal:friday-dinner"]))',ctx);
  ctx.location.hash='#shopping/plan/weekend';vm.runInContext('renderPlanning()',ctx);ctx.location.hash='#shopping';
  assert.equal(vm.runInContext('currentShopping().mode',ctx),'meals');
});
test('Shopping empty and invalid routes are explicit and do not erase stored drafts',()=>{
  const ctx=navigationContext();vm.runInContext('planningStore.data.plans=[];planningStore.data.events=[];renderPlanning()',ctx);assert.match(ctx.app.innerHTML,/No shopping lists yet/);
  for(const hash of ['#shopping/nope/x','#shopping/plan/missing','#shopping/event/saturday/extra']){ctx.location.hash=hash;assert.equal(vm.runInContext('currentShopping()',ctx),null);vm.runInContext('renderPlanning()',ctx);assert.ok(!ctx.app.innerHTML.includes('data-shop-action="add"'));}
  ctx.location.hash='#shopping';
  vm.runInContext('planningStore={data:PlanningCore.seed(),mode:"conflict",change(){throw Error("must not write")}};renderPlanning()',ctx);
  assert.match(ctx.app.innerHTML,/data-shop-action="add" disabled/);
});
