/* Planning prototype domain. No production services or account records. */
(function(root){
  'use strict';
  const KEY='recipe-drawer:planning-prototype:v1';
  const shoppingLayouts=['category','alphabetical','dish','amount'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const ingredients={
    pasta:{en:'Dry spaghetti',de:'Spaghetti, trocken',group:'cupboard'},
    lentils:{en:'Red lentils, dry',de:'Rote Linsen, trocken',group:'cupboard'},
    sauce:{en:'Tomato pasta sauce',de:'Tomaten-Pastasauce',group:'cupboard'},
    tomatoes:{en:'Tinned chopped tomatoes',de:'Gehackte Dosentomaten',group:'cupboard'},
    herbs:{en:'Dried Italian herbs',de:'Getrocknete italienische Kräuter',group:'cupboard'},
    salt:{en:'Salt',de:'Salz',group:'cupboard'},
    carrot:{en:'Carrots',de:'Karotten',group:'produce'},
    cucumber:{en:'Cucumber',de:'Gurke',group:'produce',countUnit:{en:['cucumber','cucumbers'],de:['Gurke','Gurken']}},
    lettuce:{en:'Lettuce',de:'Blattsalat',group:'produce',countUnit:{en:['head','heads'],de:['Kopf','Köpfe']}},
    bread:{en:'Bread',de:'Brot',group:'bakery',countUnit:{en:['loaf','loaves'],de:['Laib','Laibe']}}
  };
  const catalog={
    tomato:{en:'Pasta with tomato sauce',de:'Pasta mit Tomatensauce',status:'recipeDraft',image:'network-tomato',base:2,
      variants:{jar:[['pasta',200,'g'],['sauce',350,'g'],['salt',null,'taste']],tomatoes:[['pasta',200,'g'],['tomatoes',400,'g'],['herbs',1,'tsp'],['salt',null,'taste']]}},
    bolognese:{en:'Lentil Bolognese',de:'Linsen-Bolognese',status:'recipeDraft',image:'network-lentils',base:2,
      variants:{jar:[['pasta',220,'g'],['lentils',150,'g'],['sauce',450,'g'],['herbs',1,'tsp'],['salt',1,'tsp']]}},
    soup:{en:'Lentil soup',de:'Linsensuppe',status:'planningExample',base:2,
      variants:{example:[['lentils',200,'g'],['carrot',200,'g'],['tomatoes',400,'g']]}},
    salad:{en:'Warm lentil salad',de:'Warmer Linsensalat',status:'planningExample',base:2,
      variants:{example:[['lentils',150,'g'],['cucumber',1,'count'],['lettuce',1,'count']]}}
  };
  function seed(){return {
    plans:[{id:'weekend',name:{en:'A few days at home',de:'Ein paar Tage zu Hause'},start:'2026-09-11',end:'2026-09-13',meals:[
      {id:'brunch',date:'2026-09-11',name:{en:'A slow breakfast',de:'Ein gemütliches Frühstück'},time:'',items:[{id:'breakfast-note',kind:'note',name:{en:'Coffee and whatever is in the kitchen',de:'Kaffee und was die Küche hergibt'}}]},
      {id:'friday-dinner',date:'2026-09-11',name:{en:'Dinner',de:'Abendessen'},time:'',items:[{id:'friday-pasta',kind:'dish',recipeId:'bolognese',language:'en',servings:2,options:{sauce:'jar'}}]}
    ],eventIds:['saturday']}],
    events:[{id:'saturday',name:{en:'Saturday around the table',de:'Samstag zusammen am Tisch'},date:'2026-09-12',time:'19:00',guests:6,items:[
      {id:'party-main',kind:'dish',recipeId:'tomato',language:'en',servings:6,followsGuests:true,options:{sauce:'jar'},group:{en:'Main',de:'Hauptgericht'}},
      {id:'party-salad',kind:'personal',name:{en:'A green salad',de:'Ein grüner Salat'},group:{en:'For the table',de:'Für den Tisch'},ingredients:[['lettuce',1,'count'],['cucumber',1,'count']]},
      {id:'party-bread',kind:'personal',name:{en:'Bread to share',de:'Brot zum Teilen'},group:{en:'For the table',de:'Für den Tisch'},ingredients:[['bread',2,'count']]},
      {id:'party-dessert',kind:'personal',name:{en:'Alex brings dessert',de:'Alex bringt Dessert mit'},contribution:true,ingredients:[]}
    ],tasks:[
      {id:'table',group:'earlier',name:{en:'Set out plates and glasses',de:'Teller und Gläser bereitstellen'},done:false},
      {id:'equipment',group:'day',name:{en:'Get the pots and colander ready',de:'Töpfe und Sieb bereitstellen'},done:false},
      {id:'bread',group:'serving',name:{en:'Put the bread on the table',de:'Das Brot auf den Tisch stellen'},done:false}
    ]}],templates:[],purchases:[],batches:[],leftovers:[],shopping:{scopes:[],views:[]},preferences:{noticeDismissed:false}
  };}
  const label=(value,lang='en')=>typeof value==='string'?value:value?.[lang]||value?.en||'';
  const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  function dayCount(start,end){
    if(!dateOK(start)||!dateOK(end)||start>end)throw new Error('Invalid date range');
    return (Date.parse(end)-Date.parse(start))/86400000+1;
  }
  function days(start,end,offset=0,limit=Infinity){
    const count=dayCount(start,end);
    const result=[];
    for(let n=offset;n<Math.min(count,offset+limit);n++)result.push(new Date(Date.parse(start)+n*86400000).toISOString().slice(0,10));
    return result;
  }
  function validate(data){
    const fail=()=>{throw new Error('Invalid planning draft');};
    const nameOK=n=>typeof n==='string'?n.length<=200:n&&typeof n.en==='string'&&typeof n.de==='string'&&n.en.length<=200&&n.de.length<=200;
    if(!data||!['plans','events','templates','purchases','batches','leftovers'].every(k=>Array.isArray(data[k]))||typeof data.preferences?.noticeDismissed!=='boolean')fail();
    if(data.preferences.shoppingLayout!==undefined&&!shoppingLayouts.includes(data.preferences.shoppingLayout))fail();
    // Later increments introduce these records with an explicit schema migration.
    if(['purchases','batches','leftovers'].some(k=>data[k].length))fail();
    const ids=new Set();
    const identify=o=>{if(!o||typeof o.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(o.id)||ids.has(o.id))fail();ids.add(o.id);};
    const items=list=>{
      if(!Array.isArray(list))fail();
      for(const i of list){identify(i);if(i.group&&!nameOK(i.group))fail();
        if(i.kind==='dish'){
          if(!Object.hasOwn(catalog,i.recipeId)||!['en','de'].includes(i.language)||!Number.isFinite(i.servings)||i.servings<=0||i.servings>10000||!Object.hasOwn(catalog[i.recipeId].variants,i.options?.sauce))fail();
          if(i.followsGuests!==undefined&&typeof i.followsGuests!=='boolean')fail();
        }else if(i.kind==='note'||i.kind==='personal'){
          if(!nameOK(i.name))fail();
          if(i.kind==='personal'&&(!Array.isArray(i.ingredients)||i.ingredients.some(r=>!Array.isArray(r)||r.length!==3||!Object.hasOwn(ingredients,r[0])||!['g','kg','ml','l','tsp','count','taste'].includes(r[2])||!(r[2]==='taste'?r[1]===null:Number.isFinite(r[1])&&r[1]>=0))))fail();
        }else fail();
        if(i.contribution!==undefined&&typeof i.contribution!=='boolean')fail();
      }
    };
    for(const e of data.events){identify(e);if(!nameOK(e.name)||!dateOK(e.date)||!Number.isInteger(e.guests)||e.guests<1||e.guests>10000||!(e.time===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))||!Array.isArray(e.tasks))fail();items(e.items);
      for(const task of e.tasks){identify(task);if(!nameOK(task.name)||!['earlier','day','serving'].includes(task.group)||typeof task.done!=='boolean')fail();}
    }
    for(const p of data.plans){identify(p);if(!nameOK(p.name)||!dateOK(p.start)||!dateOK(p.end)||p.start>p.end||!Array.isArray(p.meals)||!Array.isArray(p.eventIds)||p.eventIds.some(id=>!data.events.some(e=>e.id===id)))fail();
      for(const m of p.meals){identify(m);if(!nameOK(m.name)||!dateOK(m.date)||m.date<p.start||m.date>p.end||!(m.time===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)))fail();items(m.items);}
    }
    for(const template of data.templates){identify(template);if(!nameOK(template.name)||!['meal','menu'].includes(template.kind))fail();items(template.items);}
    validateShopping(data);
    return true;
  }
  function itemRows(item){
    if(item.contribution||item.kind==='note')return [];
    if(item.kind==='personal')return clone(item.ingredients);
    const recipe=catalog[item.recipeId];
    return recipe.variants[item.options.sauce].map(([id,amount,unit])=>[id,amount===null?null:amount*item.servings/recipe.base,unit]);
  }
  function shopping(data,kind,id,scope=null){
    if(scope){checkScope(data,scope);if(scope.kind!==kind||scope.ownerId!==id)throw Error('scope');}
    const entries=[];
    if(kind==='event'){
      const event=data.events.find(e=>e.id===id);if(!event)throw new Error('Missing event');
      entries.push(...event.items.map(item=>({item,source:event.name})));
    }else if(kind==='plan'){
      const plan=data.plans.find(p=>p.id===id);if(!plan)throw new Error('Missing plan');
      const selected=(date,key)=>!scope||scope.mode==='all'||scope.mode==='dates'&&date>=scope.from&&date<=scope.to||scope.mode==='meals'&&scope.selection.includes(key);
      for(const meal of plan.meals)if(selected(meal.date,'meal:'+meal.id))entries.push(...meal.items.map(item=>({item,source:meal.name,date:meal.date})));
      for(const eventId of new Set(plan.eventIds)){const event=data.events.find(e=>e.id===eventId);if(event.date>=plan.start&&event.date<=plan.end&&selected(event.date,'event:'+event.id))entries.push(...event.items.map(item=>({item,source:event.name,date:event.date})));}
    }else throw new Error('Invalid shopping scope');
    const rows=new Map();
    for(const {item,source,date} of entries)for(const [ingredient,rawAmount,rawUnit] of itemRows(item)){
      const unit=rawUnit==='kg'?'g':rawUnit==='l'?'ml':rawUnit,amount=rawAmount===null?null:rawAmount*(rawUnit==='kg'||rawUnit==='l'?1000:1);
      const key=ingredient+':'+unit;
      if(!rows.has(key))rows.set(key,{key,ingredient,unit,amount:amount===null?null:0,sources:[]});
      const row=rows.get(key);if(amount!==null)row.amount+=amount;
      row.sources.push({itemId:item.id,source,date,amount});
    }
    return [...rows.values()];
  }
  const quantityOK=n=>Number.isFinite(n)&&n>=0&&n<=1e9;
  const personalUnits=['g','kg','ml','l','count','bottle','loaf','pack'];
  const rounded=n=>Math.round(n*1e6)/1e6;
  function scopeDescriptor(kind,ownerId,mode='all',selection=[],from=null,to=null){
    return {kind,ownerId,mode,selection:mode==='meals'?[...new Set(selection)].sort():[],from:mode==='dates'?from:null,to:mode==='dates'?to:null};
  }
  const scopeKey=s=>JSON.stringify([s.kind,s.ownerId,s.mode,s.selection,s.from,s.to]);
  function checkScope(data,s){
    if(!s||!['plan','event'].includes(s.kind)||!['all','dates','meals'].includes(s.mode)||!Array.isArray(s.selection))throw Error('scope');
    const owner=(s.kind==='plan'?data.plans:data.events).find(o=>o.id===s.ownerId);
    if(!owner||s.kind==='event'&&s.mode!=='all')throw Error('scope');
    if(s.mode==='dates'&&(!dateOK(s.from)||!dateOK(s.to)||s.from>s.to||s.from<owner.start||s.to>owner.end))throw Error('scope');
    if(s.mode!=='dates'&&(s.from!==null||s.to!==null)||s.mode!=='meals'&&s.selection.length)throw Error('scope');
    if(s.mode==='meals'){
      const keys=new Set([...owner.meals.map(m=>'meal:'+m.id),...owner.eventIds.map(id=>'event:'+id)]);
      if(s.selection.some(k=>typeof k!=='string'||!keys.has(k))||new Set(s.selection).size!==s.selection.length||s.selection.join('|')!==[...s.selection].sort().join('|'))throw Error('scope');
    }
    return owner;
  }
  function validateShopping(data){
    const value=data.shopping;if(!value||!Array.isArray(value.scopes)||!Array.isArray(value.views))throw Error('shopping');
    if(value.lastOwner!==undefined&&(!value.lastOwner||!['plan','event'].includes(value.lastOwner.kind)||typeof value.lastOwner.ownerId!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(value.lastOwner.ownerId)))throw Error('last shopping owner');
    const keys=new Set(),personalIds=new Set();
    const coverage=r=>{
      if(!['needed','bought','have'].includes(r.status)||typeof r.review!=='boolean')throw Error('status');
      if(r.covered!==null&&(!r.covered||!(r.covered.amount===null||quantityOK(r.covered.amount))||typeof r.covered.signature!=='string'||r.covered.signature.length>100000))throw Error('coverage');
      if(r.status==='needed'&&(r.covered!==null||r.review)||r.status!=='needed'&&!r.covered)throw Error('coverage');
    };
    for(const s of value.scopes){
      checkScope(data,s);const key=scopeKey(s);if(keys.has(key)||!Array.isArray(s.adjustments)||!Array.isArray(s.personal))throw Error('shopping');keys.add(key);
      const rows=new Set();
      for(const a of s.adjustments){
        if(!Object.hasOwn(ingredients,a.ingredient)||!['g','ml','tsp','count','taste'].includes(a.unit)||!quantityOK(a.extra)||a.unit==='taste'&&a.extra!==0)throw Error('adjustment');
        const k=a.ingredient+':'+a.unit;if(rows.has(k))throw Error('adjustment');rows.add(k);coverage(a);
        if(a.parts!==undefined){
          if(!Array.isArray(a.parts)||a.parts.length>10000||a.status!=='needed')throw Error('parts');
          const ids=new Set();for(const p of a.parts){
            if(!p||typeof p.id!=='string'||!/^(@extra|[-a-zA-Z0-9_]{1,80})$/.test(p.id)||ids.has(p.id)||!(p.amount===null||quantityOK(p.amount))||!['needed','bought','have'].includes(p.status)||typeof p.review!=='boolean')throw Error('part');
            ids.add(p.id);
          }
        }
      }
      for(const p of s.personal){
        if(typeof p.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(p.id)||personalIds.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>200||!quantityOK(p.amount)||p.amount<=0||!personalUnits.includes(p.unit))throw Error('personal');
        personalIds.add(p.id);coverage(p);
      }
    }
    const owners=new Set();
    for(const v of value.views){
      const owner=v.kind+':'+v.ownerId;if(owners.has(owner)||!value.scopes.some(s=>scopeKey(s)===v.key&&s.kind===v.kind&&s.ownerId===v.ownerId))throw Error('view');owners.add(owner);
    }
  }
  function getScope(data,kind,ownerId){
    const v=data.shopping.views.find(v=>v.kind===kind&&v.ownerId===ownerId);
    const descriptor=scopeDescriptor(kind,ownerId),key=v?.key||scopeKey(descriptor);
    return data.shopping.scopes.find(s=>scopeKey(s)===key)||{...descriptor,adjustments:[],personal:[]};
  }
  function lastShoppingOwner(data){
    const last=data.shopping.lastOwner;
    if(last&&(last.kind==='plan'?data.plans:data.events).some(o=>o.id===last.ownerId))return {...last};
    return data.plans[0]?{kind:'plan',ownerId:data.plans[0].id}:data.events[0]?{kind:'event',ownerId:data.events[0].id}:null;
  }
  function rememberShoppingOwner(data,kind,ownerId){
    checkScope(data,scopeDescriptor(kind,ownerId));data.shopping.lastOwner={kind,ownerId};
  }
  function ensureScope(data,descriptor){
    checkScope(data,descriptor);const key=scopeKey(descriptor);
    let scope=data.shopping.scopes.find(s=>scopeKey(s)===key);
    if(!scope){scope={...scopeDescriptor(descriptor.kind,descriptor.ownerId,descriptor.mode,descriptor.selection,descriptor.from,descriptor.to),adjustments:[],personal:[]};data.shopping.scopes.push(scope);}
    return scope;
  }
  function selectScope(data,descriptor){
    const scope=ensureScope(data,descriptor),key=scopeKey(scope);
    const v=data.shopping.views.find(v=>v.kind===scope.kind&&v.ownerId===scope.ownerId);
    if(v)v.key=key;else data.shopping.views.push({kind:scope.kind,ownerId:scope.ownerId,key});
  }
  function shoppingTargets(data,descriptor){
    const s=data.shopping.scopes.find(s=>scopeKey(s)===scopeKey(descriptor))||descriptor;
    const rows=shopping(data,s.kind,s.ownerId,s).map(r=>({...r,amount:r.amount===null?null:rounded(r.amount),personal:false}));
    for(const a of s.adjustments||[])if(a.extra>0&&!rows.some(r=>r.key===a.ingredient+':'+a.unit))rows.push({key:a.ingredient+':'+a.unit,ingredient:a.ingredient,unit:a.unit,amount:0,sources:[],personal:false,orphan:true});
    for(const p of s.personal||[])rows.push({key:'personal:'+p.id,name:p.name,unit:p.unit,amount:p.amount,sources:[],personal:true,record:p});
    return rows.map(row=>{
      const a=row.personal?row.record:(s.adjustments||[]).find(a=>a.ingredient===row.ingredient&&a.unit===row.unit);
      const extra=row.personal?0:a?.extra||0,target=row.amount===null?null:rounded(row.amount+extra);
      const signature=JSON.stringify(row.personal?[row.name,row.unit]:row.sources.map(source=>source.itemId).sort());
      const review=!!a&&a.status!=='needed'&&(a.review||!a.covered||(target===null?a.covered.signature!==signature:a.covered.amount===null||target>a.covered.amount));
      const result={...row,extra,target,signature,status:review?'review':a?.status||'needed',previousStatus:a?.status||'needed'};
      result.parts=shoppingParts(result,a);
      if(a?.parts){
        const covered=result.parts.filter(p=>['bought','have'].includes(p.status));
        result.status=result.parts.some(p=>p.status==='review')?'review':covered.length===result.parts.length&&covered.length?(covered.every(p=>p.status===covered[0].status)?covered[0].status:'covered'):covered.length?'partial':'needed';
      }
      result.coveredAmount=target===null?null:rounded(result.parts.reduce((sum,p)=>sum+(['bought','have'].includes(p.status)?p.amount||0:0),0));
      result.remaining=target===null?null:rounded(Math.max(0,target-result.coveredAmount));
      return result;
    });
  }
  function shoppingParts(row,record){
    const parts=new Map();
    for(const source of row.sources){const p=parts.get(source.itemId)||{id:source.itemId,amount:source.amount===null?null:0};if(source.amount!==null)p.amount=rounded(p.amount+source.amount);parts.set(p.id,p);}
    if(row.extra>0||row.personal)parts.set('@extra',{id:'@extra',amount:row.personal?row.target:row.extra});
    return [...parts.values()].map(p=>{
      const saved=record?.parts?.find(s=>s.id===p.id);
      const status=record?.parts?(saved?.status||'needed'):row.status;
      const review=saved&&saved.status!=='needed'&&(saved.review||p.amount!==saved.amount&&(p.amount===null||saved.amount===null||p.amount>saved.amount));
      return {...p,status:review?'review':status};
    });
  }
  function markShoppingParts(data,descriptor,key,ids,status){
    if(!['needed','bought','have'].includes(status)||!Array.isArray(ids)||!ids.length)throw Error('parts');
    const {row,record}=targetRecord(data,descriptor,key);
    if(row.personal||ids.some(id=>!row.parts.some(p=>p.id===id)))throw Error('part');
    if(!record.parts)record.parts=row.parts.map(p=>({id:p.id,amount:p.amount,status:p.status==='review'?row.previousStatus:p.status,review:p.status==='review'}));
    record.status='needed';record.covered=null;record.review=false;
    for(const id of ids){let p=record.parts.find(p=>p.id===id);if(!p){p={id};record.parts.push(p);}Object.assign(p,{amount:row.parts.find(p=>p.id===id).amount,status,review:false});}
  }
  // Presentation groups only: keep each unit's demand and coverage independent.
  const seasoningIds=['salt','herbs'];
  function seasoningGroups(data,descriptor){
    const rows=shoppingTargets(data,descriptor),scope=getScopeRecord(data,descriptor);
    return seasoningIds.map(ingredient=>{
      const members=rows.filter(r=>!r.personal&&r.ingredient===ingredient);
      if(!members.length)return null;
      const statuses=members.map(r=>r.status),covered=statuses.every(s=>['have','bought','covered'].includes(s));
      const explicit=members.some(r=>scope?.adjustments.some(a=>a.ingredient+':'+a.unit===r.key&&a.status==='needed'));
      const allParts=members.flatMap(r=>r.parts),hasPartial=allParts.some(p=>['bought','have'].includes(p.status));
      const status=covered?(statuses.every(s=>s===statuses[0])?statuses[0]:'covered'):statuses.includes('review')?'review':hasPartial?'partial':statuses.some(s=>s!=='needed')?'review':explicit?'needed':'unchecked';
      return {key:'seasoning:'+ingredient,ingredient,members,status,covered};
    }).filter(Boolean);
  }
  function getScopeRecord(data,descriptor){return data.shopping.scopes.find(s=>scopeKey(s)===scopeKey(descriptor));}
  function markSeasoning(data,descriptor,ingredient,status){
    const group=seasoningGroups(data,descriptor).find(g=>g.ingredient===ingredient);
    if(!group||!['needed','have','bought'].includes(status))throw Error('seasoning');
    for(const row of group.members)markShopping(data,descriptor,row.key,status);
  }
  function targetRecord(data,descriptor,key){
    const row=shoppingTargets(data,descriptor).find(r=>r.key===key);if(!row)throw Error('missing');
    const scope=ensureScope(data,descriptor);
    let record=row.personal?scope.personal.find(p=>'personal:'+p.id===key):scope.adjustments.find(a=>a.ingredient+':'+a.unit===key);
    if(!record){record={ingredient:row.ingredient,unit:row.unit,extra:0,status:'needed',covered:null,review:false};scope.adjustments.push(record);}
    return {row,record,scope};
  }
  function setShoppingTotal(data,descriptor,key,total){
    const row=shoppingTargets(data,descriptor).find(r=>r.key===key);
    if(!row||row.personal||row.amount===null||!quantityOK(total)||total<row.amount)throw Error('minimum');
    targetRecord(data,descriptor,key).record.extra=rounded(total-row.amount);
    reconcileShopping(data);
  }
  function markShopping(data,descriptor,key,status){
    if(!['needed','bought','have'].includes(status))throw Error('status');
    const {row,record}=targetRecord(data,descriptor,key);
    delete record.parts;
    record.status=status;record.covered=status==='needed'?null:{amount:row.target,signature:row.signature};record.review=false;
  }
  function saveShoppingPersonal(data,descriptor,item){
    if(typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>200||!quantityOK(item.amount)||item.amount<=0||!personalUnits.includes(item.unit)||typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(item.id))throw Error('personal');
    const scope=ensureScope(data,descriptor),existing=scope.personal.find(p=>p.id===item.id);
    if(existing){
      if(existing.name!==item.name.trim()||existing.unit!==item.unit){existing.status='needed';existing.covered=null;existing.review=false;}
      Object.assign(existing,{name:item.name.trim(),amount:item.amount,unit:item.unit});
    }else{
      if(data.shopping.scopes.some(s=>s.personal.some(p=>p.id===item.id)))throw Error('personal');
      scope.personal.push({id:item.id,name:item.name.trim(),amount:item.amount,unit:item.unit,status:'needed',covered:null,review:false});
    }
    reconcileShopping(data);
  }
  function removeShoppingPersonal(data,descriptor,id){
    const scope=ensureScope(data,descriptor),index=scope.personal.findIndex(p=>p.id===id);
    if(index<0)throw Error('missing');return scope.personal.splice(index,1)[0];
  }
  function reconcileShopping(data){
    for(const s of data.shopping.scopes){
      const targets=shoppingTargets(data,s);
      s.adjustments=s.adjustments.filter(a=>targets.some(r=>r.key===a.ingredient+':'+a.unit));
      for(const a of s.adjustments)if(a.parts){
        const target=targets.find(r=>r.key===a.ingredient+':'+a.unit);
        a.parts=a.parts.filter(p=>target.parts.some(t=>t.id===p.id));
        for(const p of a.parts)if(target.parts.find(t=>t.id===p.id).status==='review')p.review=true;
      }
      for(const r of targets)if(r.status==='review'){
        const record=r.personal?s.personal.find(p=>'personal:'+p.id===r.key):s.adjustments.find(a=>a.ingredient+':'+a.unit===r.key);
        if(!record.parts)record.review=true;
      }
    }
  }
  const freshId=()=>root.crypto.randomUUID();
  const dateShift=(date,amount)=>{if(!dateOK(date)||!Number.isInteger(amount))throw Error('date');const shifted=new Date(Date.parse(date)+amount*86400000).toISOString().slice(0,10);if(!dateOK(shifted))throw Error('date');return shifted;};
  const planById=(data,id)=>{const p=data.plans.find(p=>p.id===id);if(!p)throw Error('plan');return p;};
  const eventById=(data,id)=>{const e=data.events.find(e=>e.id===id);if(!e)throw Error('event');return e;};
  function itemContainer(data,kind,id){
    if(kind==='event')return eventById(data,id);
    if(kind==='meal'){const m=data.plans.flatMap(p=>p.meals).find(m=>m.id===id);if(m)return m;}
    throw Error('container');
  }
  function findItemOwner(data,id){
    for(const p of data.plans)for(const m of p.meals)if(m.items.some(i=>i.id===id))return {kind:'meal',id:m.id,planId:p.id,container:m};
    for(const e of data.events)if(e.items.some(i=>i.id===id))return {kind:'event',id:e.id,container:e};
    throw Error('item');
  }
  const copyItems=items=>items.map(item=>({...clone(item),id:freshId()}));
  // Clean only selections that no longer resolve. UI previews this loss and offers undo.
  function cleanPlanningShopping(data){
    const removed=[];
    data.shopping.scopes=data.shopping.scopes.filter(s=>{try{checkScope(data,s);return true;}catch{removed.push(clone(s));return false;}});
    data.shopping.views=data.shopping.views.filter(v=>data.shopping.scopes.some(s=>scopeKey(s)===v.key));
    if(data.shopping.lastOwner&&!data[data.shopping.lastOwner.kind==='plan'?'plans':'events'].some(o=>o.id===data.shopping.lastOwner.ownerId))delete data.shopping.lastOwner;
    return removed;
  }
  function savePlan(data,id,values){
    dayCount(values.start,values.end);
    const p=id?planById(data,id):{id:freshId(),meals:[],eventIds:[]};
    Object.assign(p,{name:values.name,start:values.start,end:values.end});
    p.meals=p.meals.filter(m=>m.date>=p.start&&m.date<=p.end);
    if(!id)data.plans.push(p);return p.id;
  }
  function saveMeal(data,planId,id,values){
    const p=planById(data,planId);if(values.date<p.start||values.date>p.end||!dateOK(values.date))throw Error('date');
    const m=id?p.meals.find(m=>m.id===id):{id:freshId(),items:[]};if(!m)throw Error('meal');
    Object.assign(m,{name:values.name,date:values.date,time:values.time});if(!id)p.meals.push(m);return m.id;
  }
  function saveEvent(data,id,values){
    const e=id?eventById(data,id):{id:freshId(),items:[],tasks:[]};
    Object.assign(e,{name:values.name,date:values.date,time:values.time,guests:values.guests});
    for(const item of e.items)if(item.kind==='dish'&&item.followsGuests)item.servings=e.guests;
    if(!id)data.events.push(e);return e.id;
  }
  function savePlannedItem(data,kind,containerId,id,values){
    const c=itemContainer(data,kind,containerId),existing=id?c.items.find(i=>i.id===id):null;if(id&&!existing)throw Error('item');
    const item={...clone(values),id:existing?.id||freshId()};
    if(kind==='event'&&item.kind==='dish'&&item.followsGuests)item.servings=c.guests;
    if(kind==='meal')delete item.followsGuests;
    if(existing)c.items.splice(c.items.indexOf(existing),1,item);else c.items.push(item);return item.id;
  }
  function transferMeal(data,id,destination,date,copy=false,index=null){
    const source=data.plans.find(p=>p.meals.some(m=>m.id===id)),target=planById(data,destination);if(!source)throw Error('meal');
    if(!dateOK(date)||date<target.start||date>target.end)throw Error('date');
    const original=source.meals.find(m=>m.id===id),m=copy?{...clone(original),id:freshId(),items:copyItems(original.items)}:original;
    if(!copy)source.meals.splice(source.meals.indexOf(original),1);m.date=date;
    const at=index===null?target.meals.length:Math.max(0,Math.min(target.meals.length,index));target.meals.splice(at,0,m);return m.id;
  }
  function transferItem(data,id,kind,containerId,copy=false,index=null){
    const source=findItemOwner(data,id).container,target=itemContainer(data,kind,containerId),original=source.items.find(i=>i.id===id);
    const item=copy?copyItems([original])[0]:original;
    if(!copy)source.items.splice(source.items.indexOf(original),1);
    if(item.kind==='dish')item.followsGuests=false;
    const at=index===null?target.items.length:Math.max(0,Math.min(target.items.length,index));target.items.splice(at,0,item);return item.id;
  }
  function deletePlanningEntity(data,kind,id){
    if(kind==='plan'){planById(data,id);data.plans=data.plans.filter(p=>p.id!==id);}
    else if(kind==='event'){eventById(data,id);data.events=data.events.filter(e=>e.id!==id);for(const p of data.plans)p.eventIds=p.eventIds.filter(e=>e!==id);}
    else if(kind==='meal'){const p=data.plans.find(p=>p.meals.some(m=>m.id===id));if(!p)throw Error('meal');p.meals=p.meals.filter(m=>m.id!==id);}
    else if(kind==='item'){const c=findItemOwner(data,id).container;c.items=c.items.filter(i=>i.id!==id);}
    else if(kind==='task'){const e=data.events.find(e=>e.tasks.some(t=>t.id===id));if(!e)throw Error('task');e.tasks=e.tasks.filter(t=>t.id!==id);}
    else if(kind==='template'){if(!data.templates.some(t=>t.id===id))throw Error('template');data.templates=data.templates.filter(t=>t.id!==id);}
    else throw Error('kind');
  }
  function copyEvent(data,id,date,name){
    const source=eventById(data,id),e={...clone(source),id:freshId(),name,date,items:copyItems(source.items),tasks:source.tasks.map(t=>({...clone(t),id:freshId(),done:false}))};
    data.events.push(e);return e.id;
  }
  function copyPlan(data,id,start,name){
    const source=planById(data,id),offset=(Date.parse(start)-Date.parse(source.start))/86400000;
    const p={...clone(source),id:freshId(),name,start,end:dateShift(source.end,offset),meals:source.meals.map(m=>({...clone(m),id:freshId(),date:dateShift(m.date,offset),items:copyItems(m.items)})),eventIds:[]};
    p.eventIds=[...new Set(source.eventIds)].map(id=>copyEvent(data,id,dateShift(eventById(data,id).date,offset),clone(eventById(data,id).name)));
    data.plans.push(p);return p.id;
  }
  function linkEvent(data,planId,eventId,link=true){const p=planById(data,planId);eventById(data,eventId);p.eventIds=p.eventIds.filter(id=>id!==eventId);if(link)p.eventIds.push(eventId);}
  function saveTask(data,eventId,id,values){const e=eventById(data,eventId),t=id?e.tasks.find(t=>t.id===id):{id:freshId(),done:false};if(!t)throw Error('task');Object.assign(t,{name:values.name,group:values.group});if(!id)e.tasks.push(t);return t.id;}
  function saveTemplate(data,kind,id,name){const container=itemContainer(data,kind==='menu'?'event':'meal',id);const t={id:freshId(),kind,name,items:copyItems(container.items)};data.templates.push(t);return t.id;}
  function applyTemplate(data,id,kind,containerId){const t=data.templates.find(t=>t.id===id);if(!t)throw Error('template');const target=itemContainer(data,kind,containerId),items=copyItems(t.items);for(const i of items)if(i.kind==='dish'){if(kind==='event'&&i.followsGuests)i.servings=target.guests;else i.followsGuests=false;}target.items.push(...items);}
  function planningPeriod(owner,today){if(!dateOK(today))throw Error('date');const start=owner.start||owner.date,end=owner.end||owner.date;return end<today?'past':start>today?'upcoming':'current';}
  // Transaction preview: pure caller-owned clone; persistence remains in store.change.
  function previewPlanningEdit(data,edit){
    const next=clone(data),result=edit(next),scopes=cleanPlanningShopping(next);
    validate(next);reconcileShopping(next);
    const removedMeals=data.plans.flatMap(p=>p.meals).filter(m=>!next.plans.some(p=>p.meals.some(n=>n.id===m.id)));
    return {next,result,scopes,removedMeals};
  }
  function store(storage){
    let raw=null,data=seed(),mode='ready',revision=0;
    function read(){
      try{raw=storage.getItem(KEY);}catch{mode='unavailable';return;}
      if(raw===null){data=seed();revision=0;mode='ready';return;}
      try{
        const parsed=JSON.parse(raw);if(![1,2,3,4].includes(parsed.version)||!Number.isSafeInteger(parsed.revision)||parsed.revision<0)throw new Error();
        if(parsed.version===1){if(Object.hasOwn(parsed.data,'shopping'))throw new Error();parsed.data.shopping={scopes:[],views:[]};}
        validate(parsed.data);data=parsed.data;revision=parsed.revision;mode='ready';
      }catch{mode='invalid';}
    }
    function change(edit){
      if(mode==='invalid'||mode==='conflict')return false;
      let readable=true;
      try{if(storage.getItem(KEY)!==raw){mode='conflict';return false;}}catch{mode='unavailable';readable=false;}
      const next=clone(data);edit(next);validate(next);reconcileShopping(next);data=next;
      // An unreadable record may contain a newer/unsupported draft. Never overwrite it.
      if(!readable)return true;
      const serialized=JSON.stringify({version:4,revision:revision+1,data});
      try{storage.setItem(KEY,serialized);raw=serialized;revision++;mode='ready';}catch{mode='unavailable';}
      return true;
    }
    read();
    return {get data(){return data;},get mode(){return mode;},get raw(){return raw;},change,reload:read,
      external(value){if(value!==raw)mode='conflict';},
      reset(){try{storage.removeItem(KEY);raw=null;data=seed();revision=0;mode='ready';return change(()=>{});}catch{mode='unavailable';return false;}}
    };
  }
  const api={KEY,clone,ingredients,catalog,seed,label,days,dayCount,validate,itemRows,shopping,store,scopeDescriptor,scopeKey,checkScope,getScope,selectScope,shoppingTargets,setShoppingTotal,markShopping,markShoppingParts,saveShoppingPersonal,removeShoppingPersonal,personalUnits,seasoningIds,seasoningGroups,markSeasoning,lastShoppingOwner,rememberShoppingOwner,shoppingLayouts};
  Object.assign(api,{savePlan,saveMeal,saveEvent,savePlannedItem,transferMeal,transferItem,deletePlanningEntity,copyEvent,copyPlan,linkEvent,saveTask,saveTemplate,applyTemplate,planningPeriod,previewPlanningEdit,findItemOwner,itemContainer,dateShift});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlanningCore=api;
})(globalThis);
