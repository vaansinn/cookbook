'use strict';
// Shopping is a local prototype: requirements are derived; extras/status are scoped.
const shoppingCopy={
  en:{shopping:'Shopping list',shoppingNote:'Illustrative quantities from the sample dishes.',draftBody:'Interactive local shopping is ready to try. Recipe quantities stay unchanged. Flexible plan/event editors, packs and Use the rest follow in the next increments.',
    allPlan:'Whole plan',allEvent:'Whole event',dates:'Date range',meals:'Selected meals & events',changeScope:'Change selection',scopeTitle:'Choose what to shop for',scopeHelp:'Each selection keeps its own extras, personal additions and checkmarks.',from:'From',to:'To',apply:'Apply selection',selectionCount:'selected',noMeals:'No meals or events in this plan.',
    bought:'Bought',have:'Already have',needed:'Still needed',review:'Check amount',reviewHelp:'The amount changed after you marked this covered. Check what you have, then confirm Bought or Already have again.',markBought:'Mark as bought',markNeeded:'Mark as still needed',
    required:'For the recipes',extra:'Extra',total:'Shopping total',saveTotal:'Save amount',clearExtra:'Remove extra',minimum:'The total cannot be below the recipe requirement.',invalidTotal:'Enter an amount between the recipe requirement and 1,000,000,000.',qualitative:'Use the recipe’s “to taste” guidance; no fixed amount is assumed.',orphan:'No longer required by the selected meals. This is your extra amount.',
    additions:'Your additions',add:'Add item',edit:'Edit item',itemName:'Item name',quantity:'Quantity',unit:'Unit',saveItem:'Save item',remove:'Remove item',undo:'Undo removal',removed:'Item removed.',personalHelp:'Personal shopping items stay separate from recipe ingredients.',invalidItem:'Enter an item name and a quantity greater than zero (up to 1,000,000,000).',invalidScope:'Choose a valid date range within this plan.',saved:'Shopping list updated.',scopeSaved:'Shopping selection updated.',error:'This change could not be saved. Review the values and try again.',empty:'Nothing required by these meals. You can still add a personal item.',
    units:{g:['g','g'],kg:['kg','kg'],ml:['ml','ml'],l:['l','l'],count:['piece','pieces'],bottle:['bottle','bottles'],loaf:['loaf','loaves'],pack:['pack','packs']}},
  de:{shopping:'Einkaufsliste',shoppingNote:'Beispielmengen aus den Beispielgerichten.',draftBody:'Der lokale Einkauf ist jetzt interaktiv. Rezeptmengen bleiben unverändert. Flexible Plan- und Anlasseditoren, Packungen und Resteverwendung folgen in den nächsten Schritten.',
    allPlan:'Ganzer Plan',allEvent:'Ganzer Anlass',dates:'Zeitraum',meals:'Ausgewählte Mahlzeiten & Anlässe',changeScope:'Auswahl ändern',scopeTitle:'Einkauf auswählen',scopeHelp:'Jede Auswahl behält ihre eigenen Extras, Ergänzungen und Häkchen.',from:'Von',to:'Bis',apply:'Auswahl übernehmen',selectionCount:'ausgewählt',noMeals:'Keine Mahlzeiten oder Anlässe in diesem Plan.',
    bought:'Gekauft',have:'Schon vorhanden',needed:'Noch benötigt',review:'Menge prüfen',reviewHelp:'Die Menge hat sich nach dem Abhaken geändert. Prüfe deinen Bestand und bestätige Gekauft oder Schon vorhanden erneut.',markBought:'Als gekauft markieren',markNeeded:'Als noch benötigt markieren',
    required:'Für die Rezepte',extra:'Extra',total:'Einkaufsmenge',saveTotal:'Menge speichern',clearExtra:'Extra entfernen',minimum:'Die Einkaufsmenge darf nicht unter der Rezeptmenge liegen.',invalidTotal:'Gib eine Menge zwischen dem Rezeptbedarf und 1.000.000.000 ein.',qualitative:'Beachte die Angabe „nach Geschmack“ im Rezept; es wird keine feste Menge angenommen.',orphan:'Für die ausgewählten Mahlzeiten nicht mehr benötigt. Dies ist deine zusätzliche Menge.',
    additions:'Deine Ergänzungen',add:'Eintrag hinzufügen',edit:'Eintrag bearbeiten',itemName:'Bezeichnung',quantity:'Menge',unit:'Einheit',saveItem:'Eintrag speichern',remove:'Eintrag entfernen',undo:'Entfernen rückgängig',removed:'Eintrag entfernt.',personalHelp:'Eigene Einkaufspositionen bleiben getrennt von Rezeptzutaten.',invalidItem:'Gib eine Bezeichnung und eine Menge größer als null ein (höchstens 1.000.000.000).',invalidScope:'Wähle einen gültigen Zeitraum innerhalb dieses Plans.',saved:'Einkaufsliste aktualisiert.',scopeSaved:'Einkaufsauswahl aktualisiert.',error:'Diese Änderung konnte nicht gespeichert werden. Prüfe die Werte und versuche es erneut.',empty:'Für diese Mahlzeiten wird nichts benötigt. Du kannst eigene Einträge hinzufügen.',
    units:{g:['g','g'],kg:['kg','kg'],ml:['ml','ml'],l:['l','l'],count:['Stück','Stück'],bottle:['Flasche','Flaschen'],loaf:['Laib','Laibe'],pack:['Packung','Packungen']}}
};
for(const lang of ['en','de'])for(const key of ['shopping','shoppingNote','draftBody'])planningStrings[lang][key]=shoppingCopy[lang][key];
Object.assign(shoppingCopy.en,{seasonings:'Herbs & spices',seasoningHelp:'Check your cupboard before buying.',seasoningCheck:'Check cupboard',seasoningHave:'Have enough',seasoningBuy:'Need to buy',seasoningCovered:'Covered',seasoningReview:'Check again',seasoningReviewHelp:'Some recipe needs have changed or are not covered yet. Check you have enough for all the quantities below.',seasoningAmounts:'Recipe amounts',seasoningMarkHave:'Mark as have enough'});
Object.assign(shoppingCopy.de,{seasonings:'Kräuter & Gewürze',seasoningHelp:'Prüfe vor dem Einkauf deinen Vorrat.',seasoningCheck:'Vorrat prüfen',seasoningHave:'Genug vorhanden',seasoningBuy:'Nachkaufen',seasoningCovered:'Abgedeckt',seasoningReview:'Erneut prüfen',seasoningReviewHelp:'Ein Teil des Rezeptbedarfs hat sich geändert oder ist noch nicht abgedeckt. Prüfe, ob du für alle Mengen unten genug hast.',seasoningAmounts:'Rezeptmengen',seasoningMarkHave:'Als genug vorhanden markieren'});
const sc=key=>shoppingCopy[state.lang][key];
Object.assign(shoppingCopy.en,{switchList:'Switch list',chooseList:'Choose a shopping list',noLists:'No shopping lists yet. Open a meal plan or event to get started.',openPlans:'Open meal plans'});
Object.assign(shoppingCopy.de,{switchList:'Liste wechseln',chooseList:'Einkaufsliste auswählen',noLists:'Noch keine Einkaufslisten. Öffne einen Essensplan oder Anlass, um loszulegen.',openPlans:'Essenspläne öffnen'});
Object.assign(shoppingCopy.en,{changeAmount:'Change amount',amountLabel:'Amount',saveAmount:'Save',minimumLabel:'Minimum',undoStatus:'Undo',reviewHelp:'The amount changed. Check what you have, then tick Bought or choose Already have.'});
Object.assign(shoppingCopy.de,{changeAmount:'Menge ändern',amountLabel:'Menge',saveAmount:'Speichern',minimumLabel:'Mindestens',undoStatus:'Rückgängig',reviewHelp:'Die Menge hat sich geändert. Prüfe deinen Bestand. Hake dann als gekauft ab oder wähle Schon vorhanden.'});
const shoppingDrafts=new Map();
const shoppingEditors=new Set();
Object.assign(shoppingCopy.en,{groupBy:'View',category:'Category',alphabetical:'A–Z',dish:'Dish',amount:'Amount',weightGroup:'Weight',countGroup:'Count',otherGroup:'Other',sharedDishes:'Shared across dishes',extraItems:'Extra items',ingredients:'Ingredients',viewChanged:'Shopping view updated.'});
Object.assign(shoppingCopy.de,{groupBy:'Ansicht',category:'Kategorie',alphabetical:'A–Z',dish:'Gericht',amount:'Menge',weightGroup:'Gewicht',countGroup:'Anzahl',otherGroup:'Sonstiges',sharedDishes:'Für mehrere Gerichte',extraItems:'Zusätzliche Artikel',ingredients:'Zutaten',viewChanged:'Einkaufsansicht aktualisiert.'});
const shoppingLayout=()=>planningStore.data.preferences.shoppingLayout||'category';
Object.assign(shoppingCopy.en,{alsoIn:'Also in',buyAll:'Mark all {amount} bought',allDishes:'For all dishes',haveAll:'Already have the total'});
Object.assign(shoppingCopy.de,{alsoIn:'Auch in',buyAll:'Gesamte {amount} als gekauft markieren',allDishes:'Für alle Gerichte',haveAll:'Gesamte Menge vorhanden'});
Object.assign(shoppingCopy.en,{changeScope:'Dates & meals',twoDays:'2 days from start'});
Object.assign(shoppingCopy.de,{changeScope:'Tage & Mahlzeiten',twoDays:'2 Tage ab Start'});
function shoppingTwoDayRange(plan,from=null,today=null){
  if(!today){const now=new Date();today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');}
  const start=from||((today>=plan.start&&today<=plan.end)?today:plan.start);
  if(start<plan.start||start>plan.end)throw Error('date range');
  const dates=PlanningCore.days(start,plan.end,0,2);
  return {from:dates[0],to:dates.at(-1)};
}
let shoppingUndo=null;
function clearShoppingTransient(){shoppingDrafts.clear();shoppingEditors.clear();shoppingUndo=null;shoppingCheckNotice=null;}
const shoppingBlocked=()=>['invalid','conflict'].includes(planningStore.mode);
function shoppingOwnerFromRoute(){
  const p=location.hash.split('/');
  if(p[0]==='#shopping'&&p.length===1)return PlanningCore.lastShoppingOwner(planningStore.data);
  const owner=p[0]==='#shopping'&&p.length===3?{kind:p[1],ownerId:p[2]}:p[0]==='#plan'&&p[1]==='shopping'&&p.length===4?{kind:p[2],ownerId:p[3]}:null;
  return owner&&['plan','event'].includes(owner.kind)&&(owner.kind==='plan'?planningStore.data.plans:planningStore.data.events).some(o=>o.id===owner.ownerId)?owner:null;
}
function currentShopping(){const owner=shoppingOwnerFromRoute();return owner?PlanningCore.getScope(planningStore.data,owner.kind,owner.ownerId):null;}
function renderShoppingDestination(){
  const owner=shoppingOwnerFromRoute();
  if(!owner)return location.hash==='#shopping'?`<h1>${sc('shopping')}</h1><p class="planning-empty">${sc('noLists')}</p><a class="button" href="#plan">${sc('openPlans')}</a>`:planningNotFound();
  const last=planningStore.data.shopping.lastOwner;
  if(!shoppingBlocked()&&(last?.kind!==owner.kind||last?.ownerId!==owner.ownerId))planningStore.change?.(d=>PlanningCore.rememberShoppingOwner(d,owner.kind,owner.ownerId));
  return renderShopping(owner.kind,owner.ownerId);
}
function shoppingListDialog(){
  planningModal(sc('chooseList'),`<div class="shopping-list-choices">${[['plan','plans'],['event','events']].map(([kind,collection])=>planningStore.data[collection].length?`<section><h3>${pt(collection)}</h3>${planningStore.data[collection].map(owner=>`<a href="#shopping/${kind}/${owner.id}" data-shop-list-link><span>${escapeHTML(pl(owner.name))}<small>${kind==='plan'?planningDate(owner.start)+' – '+planningDate(owner.end):planningDate(owner.date)}</small></span>${planningIcon('chevron')}</a>`).join('')}</section>`:'').join('')}</div>`);
}
function shoppingName(row){return row.personal?row.name:PlanningCore.ingredients[row.ingredient][state.lang];}
function shoppingAmount(row,amount=row.target){return row.personal?new Intl.NumberFormat(state.lang,{maximumFractionDigits:6}).format(amount)+' '+sc('units')[row.unit][amount>0&&amount<=1?0:1]:planningQuantity(amount,row.unit,row.ingredient);}
function shoppingColumnAmount(row,amount){
  const unit=PlanningCore.ingredients[row.ingredient]?.countUnit?.[state.lang]?.[0];
  if(!row.personal&&row.unit==='count'&&unit?.toLocaleLowerCase()===shoppingName(row).toLocaleLowerCase())return new Intl.NumberFormat(state.lang,{maximumFractionDigits:6}).format(amount);
  return shoppingAmount(row,amount);
}
const shoppingDraftKey=(scope,key)=>PlanningCore.scopeKey(scope)+'|'+key;
const shoppingInteractionKey=(element,key)=>element?.closest?.('[data-shop-instance]')?.dataset.shopInstance||key;
function shoppingClearAmount(scope,key){
  const prefix=PlanningCore.scopeKey(scope)+'|';
  for(const stored of new Set([...shoppingEditors,...shoppingDrafts.keys()]))if(stored.startsWith(prefix)&&(stored===prefix+key||stored.endsWith('|'+key))){shoppingEditors.delete(stored);shoppingDrafts.delete(stored);}
}
const shoppingId=key=>'shop-'+key.replaceAll(':','-');
function shoppingScopeLabel(scope){return scope.mode==='all'?sc(scope.kind==='plan'?'allPlan':'allEvent'):scope.mode==='dates'?scope.from===scope.to?planningDate(scope.from):`${planningDate(scope.from)} – ${planningDate(scope.to)}`:`${scope.selection.length} ${sc('selectionCount')}`;}
function shoppingSourceName(source,presentation=null){
  if(shoppingLayout()!=='dish')return pl(source.source);
  const item=planningFindItem(source.itemId);
  const title=item?.kind==='dish'?PlanningCore.catalog[item.recipeId][state.lang]:pl(item?.name);
  const sameDish=presentation?.sources.some(s=>s.itemId===source.itemId);
  const label=title?[title,pl(source.source)].filter(Boolean).join(' · '):pl(source.source);
  return presentation?(sameDish?pl(source.source):sc('alsoIn')+' '+label):label;
}
// View models reference the same aggregate rows. They never duplicate demand or checks.
function shoppingViewGroups(data,scope,layout,lang){
  const rows=[...PlanningCore.shoppingTargets(data,scope).filter(r=>r.personal||!PlanningCore.seasoningIds.includes(r.ingredient)),...PlanningCore.seasoningGroups(data,scope)];
  const text=key=>shoppingCopy[lang][key];
  const name=row=>row.personal?row.name:PlanningCore.ingredients[row.ingredient][lang];
  const collator=new Intl.Collator(lang,{sensitivity:'base',numeric:true});
  const alpha=(a,b)=>collator.compare(name(a),name(b))||a.key.localeCompare(b.key);
  if(layout==='alphabetical')return [{key:'alphabetical',title:text('ingredients'),rows:rows.sort(alpha)}];
  if(layout==='amount'){
    const countUnits=['count','loaf','pack','bottle'];
    const rank=row=>row.members||row.target===null?2:['g','kg'].includes(row.unit)?0:countUnits.includes(row.unit)?1:2;
    const base=row=>row.target*(row.unit==='kg'||row.unit==='l'?1000:1);
    const otherUnit=row=>row.members||row.target===null?'zz-unmeasured':['l','ml'].includes(row.unit)?'ml':row.unit;
    const compare=(a,b)=>{
      if(rank(a)===2){const units=otherUnit(a).localeCompare(otherUnit(b));if(units)return units;if(otherUnit(a)==='zz-unmeasured')return alpha(a,b);}
      return base(b)-base(a)||alpha(a,b);
    };
    return ['weightGroup','countGroup','otherGroup'].map((key,i)=>({key,title:text(key),rows:rows.filter(r=>rank(r)===i).sort(compare)})).filter(g=>g.rows.length);
  }
  if(layout==='dish'){
    const items=new Map([...data.plans.flatMap(p=>p.meals.flatMap(m=>m.items)),...data.events.flatMap(e=>e.items)].map(item=>[item.id,item]));
    const groups=new Map();
    for(const row of rows){
      const sources=row.members?row.members.flatMap(member=>member.sources):row.sources;
      const dishes=new Map();
      for(const source of sources){const item=items.get(source.itemId);if(item)dishes.set(item.kind==='dish'?'recipe:'+item.recipeId:'item:'+item.id,item);}
      const destinations=row.personal?[['personal',null]]:dishes.size?[...dishes]:[['extras',null]];
      for(const [key,item] of destinations){
        const title=item?(item.kind==='dish'?PlanningCore.catalog[item.recipeId][lang]:PlanningCore.label(item.name,lang)):text(key==='personal'?'additions':'extraItems');
        if(!groups.has(key))groups.set(key,{key,title,rows:[]});
        const belongs=source=>{const sourceItem=items.get(source.itemId);return sourceItem&&(sourceItem.kind==='dish'?'recipe:'+sourceItem.recipeId:'item:'+sourceItem.id)===key;};
        const localSources=sources.filter(belongs);
        const presentation=item?{instance:key+'|'+row.key,shared:dishes.size>1,sources:localSources,amount:localSources.some(s=>s.amount===null)?null:localSources.reduce((sum,s)=>sum+s.amount,0)}:null;
        groups.get(key).rows.push({...row,presentation});
      }
    }
    const order=key=>key==='shared'?1:key==='personal'||key==='extras'?2:0;
    return [...groups.values()].sort((a,b)=>order(a.key)-order(b.key)||collator.compare(a.title,b.title)||a.key.localeCompare(b.key)).map(g=>({...g,rows:g.rows.sort(alpha)}));
  }
  return [];
}
function shoppingAlternativeView(scope){
  const layout=shoppingLayout(),groups=shoppingViewGroups(planningStore.data,scope,layout,state.lang);
  return `<div class="planning-shopping shopping-interactive shopping-ordered">${groups.map(group=>`<section data-shop-group="${group.key}"><h2${layout==='alphabetical'?' class="sr-only"':''}>${escapeHTML(group.title)}</h2>${layout==='dish'?`<div class="shopping-column-head"><span>${sc('ingredients')}</span><span>${sc('dishColumn')}</span><span>${sc('totalColumn')}</span><span></span></div>`:''}${group.rows.map(row=>row.presentation?shoppingDishRow(row,scope):row.members?shoppingSeasoningRow(row):shoppingRow(row,scope)).join('')}</section>`).join('')}</div>`;
}
// Dish quantities are references, while purchase controls still act on one aggregate.
// Reuse the tested aggregate editor with a unique presentation identity per reference.
function shoppingDishRow(row,scope){return shoppingEntry(row,scope);}
function shoppingBody(row,scope,instance=row.key){
  const key=escapeHTML(row.key),id=shoppingId(instance),name=escapeHTML(shoppingName(row)),blocked=shoppingBlocked()?'disabled':'',covered=['bought','have','covered'].includes(row.status);
  const draft=shoppingDrafts.get(shoppingDraftKey(scope,instance));
  const editing=shoppingEditors.has(shoppingDraftKey(scope,instance));
  const stateText=row.status==='needed'?'':`<small class="shopping-state ${row.status==='review'?'shopping-review':''}">${sc(row.status)}</small>`;
  return `<div class="shopping-row-body">
    ${row.status==='review'?`<p class="shopping-review-copy">${sc('reviewHelp')}</p>`:''}
    ${row.personal?`<p class="planning-caption">${sc('personalHelp')}</p>`:`${row.orphan?`<p class="planning-caption">${sc('orphan')}</p>`:''}<ul aria-label="${pt('sources')}">${row.sources.map(source=>`<li>${escapeHTML(shoppingSourceName(source,row.presentation))}${source.date?' · '+planningDate(source.date,{day:'numeric',month:'short'}):''}<span>${shoppingAmount(row,source.amount)}</span></li>`).join('')}</ul>${row.extra>0?shoppingExtraControl(row):''}`}
${editing&&!row.personal&&row.amount!==null?`<form class="shopping-total-form" data-shop-total-form="${key}" aria-label="${sc('changeAmount')}: ${name}" novalidate><div class="shopping-amount-controls"><label for="${id}-total">${sc('amountLabel')}</label><input id="${id}-total" data-shop-total="${key}" type="number" inputmode="decimal" min="${row.amount}" max="1000000000" step="any" required value="${escapeHTML(draft??row.target)}" aria-describedby="${id}-hint ${id}-error" ${blocked}><span class="shopping-unit">${escapeHTML(row.unit==='count'?PlanningCore.ingredients[row.ingredient].countUnit?.[state.lang]?.[1]||pt('count'):row.unit)}</span><span class="shopping-edit-actions"><button type="submit" class="text-link" ${blocked}>${sc('saveAmount')}</button><button type="button" class="text-link" data-shop-action="cancel-amount" data-key="${key}" ${blocked}>${pt('cancel')}</button></span></div><p class="shopping-hint" id="${id}-hint">${sc('minimumLabel')}: ${shoppingAmount(row,row.amount)}</p><p class="shopping-error" id="${id}-error" role="alert"></p>${row.extra>0?`<button type="button" class="text-link" data-shop-action="clear" data-key="${key}" ${blocked}>${sc('clearExtra')}</button>`:''} </form>`:`<div class="shopping-row-actions"><button type="button" class="text-link" data-shop-action="status" data-key="${key}" data-status="${covered?'needed':'have'}" ${blocked}>${sc(covered?'undoStatus':'have')}</button>${row.personal?`<button type="button" class="text-link" data-shop-action="edit" data-key="${key}" ${blocked}>${sc('edit')}</button><button type="button" class="text-link" data-shop-action="remove" data-key="${key}" ${blocked}>${sc('remove')}</button>`:row.amount!==null?`<button type="button" class="text-link shopping-change-amount" data-shop-action="change-amount" data-key="${key}" ${blocked}>${sc('changeAmount')}</button>`:''}</div>`}
    </div>`;
}
function shoppingSeasoningBody(group){
  const name=escapeHTML(PlanningCore.ingredients[group.ingredient][state.lang]),key=group.key,blocked=shoppingBlocked()?'disabled':'';
  const labels={unchecked:sc('seasoningCheck'),needed:sc('seasoningBuy'),have:sc('seasoningHave'),bought:sc('bought'),covered:sc('seasoningCovered'),review:sc('seasoningReview')};
  return `<div class="shopping-row-body">
    ${group.status==='review'?`<p class="shopping-review-copy">${sc('seasoningReviewHelp')}</p>`:''}
    <ul aria-label="${sc('seasoningAmounts')}">${group.members.flatMap(row=>row.sources.map(source=>`<li>${escapeHTML(shoppingSourceName(source,group.presentation))}${source.date?' · '+planningDate(source.date,{day:'numeric',month:'short'}):''}<span>${shoppingAmount(row,source.amount)}</span></li>`)).join('')}</ul>
    ${group.members.filter(row=>row.extra>0).map(row=>`<p class="shopping-extra"><span>${sc('extra')}</span><strong>${shoppingAmount(row,row.extra)}</strong></p><button class="text-link" type="button" data-shop-action="seasoning-clear" data-ingredient="${group.ingredient}" data-key="${row.key}" ${blocked}>${sc('clearExtra')}</button>`).join('')}
    <div class="shopping-row-actions">${(group.covered?[['needed','undoStatus']]:group.status==='needed'?[['have','seasoningHave']]:[['have','seasoningHave'],['needed','seasoningBuy']]).map(([status,label])=>`<button type="button" class="text-link" data-shop-action="seasoning-status" data-ingredient="${group.ingredient}" data-status="${status}" ${blocked}>${sc(label)}</button>`).join('')}</div>
    </div>`;
}

Object.assign(shoppingCopy.en,{dishColumn:'Dish',totalColumn:'Total',details:'Details',partial:'Partly covered',covered:'Covered',remaining:'{remaining} remaining of {total}',checkAll:'Check all {amount}',checkedDish:'Checked for this dish.',checkedAll:'Checked for all dishes.',dismiss:'Dismiss',extraCheck:'Check extra',undoCheck:'Undo'});
Object.assign(shoppingCopy.de,{dishColumn:'Gericht',totalColumn:'Gesamt',details:'Details',partial:'Teilweise abgedeckt',covered:'Abgedeckt',remaining:'{remaining} offen von {total}',checkAll:'Alle {amount} abhaken',checkedDish:'Für dieses Gericht abgehakt.',checkedAll:'Für alle Gerichte abgehakt.',dismiss:'Schließen',extraCheck:'Extra abhaken',undoCheck:'Rückgängig'});
let shoppingCheckNotice=null;
const shoppingCovered=status=>['bought','have','covered'].includes(status);
function shoppingRow(row,scope){return shoppingEntry(row,scope);}
function shoppingSeasoningRow(row){return shoppingEntry(row,currentShopping());}
function shoppingEntry(row,scope){
  const p=row.presentation,instance=p?.instance||row.key,id=shoppingId(instance),name=escapeHTML(shoppingName(row)),key=escapeHTML(row.key),blocked=shoppingBlocked()?'disabled':'';
  const allParts=row.members?row.members.flatMap(m=>m.parts):row.parts;
  const parts=p?allParts.filter(part=>p.sources.some(s=>s.itemId===part.id)):allParts;
  const checked=p?parts.length>0&&parts.every(part=>shoppingCovered(part.status)):row.members?row.covered:shoppingCovered(row.status);
  const mixed=!checked&&parts.some(part=>shoppingCovered(part.status));
  const status=!p?row.status:checked?(parts.every(part=>part.status===parts[0].status)?parts[0].status:'covered'):parts.some(part=>part.status==='review')?'review':mixed?'partial':row.members&&row.status==='unchecked'?'unchecked':'needed';
  const seasoningLabels={unchecked:sc('seasoningCheck'),have:sc('seasoningHave'),review:sc('seasoningReview'),covered:sc('seasoningCovered')};
  const statusText=status==='needed'?'':row.members&&seasoningLabels[status]?seasoningLabels[status]:sc(status);
  const remaining=!p&&!row.members&&row.target!==null&&mixed?sc('remaining').replace('{remaining}',shoppingAmount(row,row.remaining)).replace('{total}',shoppingAmount(row)):statusText;
  const quantity=row.members?'—':shoppingColumnAmount(row,p?p.amount:row.target);
  const total=p?.shared?(row.members?'—':shoppingColumnAmount(row,row.target)):'—';
  const attributes=p?'data-shop-dish="'+escapeHTML(instance)+'"':row.members?'data-shop-seasoning="'+row.ingredient+'"':'data-shop-check="'+key+'"';
  const checkLabel=checked?sc('markNeeded'):!p&&row.members&&status!=='needed'?sc('seasoningMarkHave'):sc('markBought');
  const body=row.members?shoppingSeasoningBody({...row,status,covered:checked}):shoppingBody({...row,status},scope,instance);
  const notice=shoppingCheckNotice&&shoppingCheckNotice.instance===instance&&shoppingCheckNotice.scopeKey===PlanningCore.scopeKey(scope)&&shoppingCheckNotice.after===JSON.stringify(planningStore.data);
  return `<article class="shopping-entry shopping-selectable ${shoppingLayout()==='dish'?'shopping-dish-columns':''} ${checked?'shopping-covered':''}" data-shop-row="${key}" data-shop-instance="${escapeHTML(instance)}">
    <label class="shopping-name-check" for="${id}-check"><input id="${id}-check" type="checkbox" ${attributes} ${mixed?'data-shop-mixed aria-checked="mixed"':''} aria-label="${escapeHTML(checkLabel+': '+shoppingName(row)+(p&&quantity!=='—'?' · '+quantity:''))}" ${checked?'checked':''} ${blocked}><span><span class="shopping-item-name">${name}</span>${remaining?`<small class="shopping-state ${status==='review'?'shopping-review':''}">${escapeHTML(remaining)}</small>`:''}</span></label>
    <strong class="shopping-dish-quantity" aria-label="${p?sc('dishColumn'):sc('quantity')}: ${escapeHTML(quantity)}">${quantity}</strong>
    ${shoppingLayout()==='dish'?`<span class="shopping-all-quantity" aria-label="${sc('totalColumn')}: ${escapeHTML(total)}">${total}</span>`:''}
    <details data-shop-detail="${escapeHTML(instance)}"><summary aria-label="${sc('details')}: ${name}">${planningIcon('chevron')}</summary>${body}</details>
    ${notice?`<div class="shopping-check-notice"><span role="status">${sc(shoppingCheckNotice.all?'checkedAll':'checkedDish')}</span>${!shoppingCheckNotice.all?`<button class="text-link" type="button" data-shop-action="check-all" data-key="${key}" ${blocked}>${escapeHTML(sc('checkAll').replace('{amount}',row.members?shoppingName(row):shoppingAmount(row)))}</button>`:''}<button class="text-link" type="button" data-shop-action="undo-check" data-key="${key}" ${blocked}>${sc('undoCheck')}</button><button class="text-link" type="button" data-shop-action="dismiss-check" data-key="${key}">${sc('dismiss')}</button></div>`:''}
  </article>`;
}
function shoppingExtraControl(row){
  const checked=shoppingCovered(row.parts.find(p=>p.id==='@extra')?.status),blocked=shoppingBlocked()?'disabled':'';
  return `<label class="shopping-extra-check"><input type="checkbox" data-shop-part="@extra" data-key="${escapeHTML(row.key)}" aria-label="${sc('extraCheck')}: ${escapeHTML(shoppingName(row))} ${shoppingAmount(row,row.extra)}" ${checked?'checked':''} ${blocked}><span>${sc('extra')} ${shoppingAmount(row,row.extra)}</span></label>`;
}
function shoppingApplyMixed(){for(const input of document.querySelectorAll('[data-shop-mixed]'))input.indeterminate=true;}
function shoppingReference(scope,instance){return shoppingViewGroups(planningStore.data,scope,'dish',state.lang).flatMap(g=>g.rows).find(r=>r.presentation?.instance===instance);}
function shoppingMarkReference(data,scope,reference,status){
  for(const row of reference.members||[reference]){
    const ids=row.parts.filter(p=>reference.presentation.sources.some(s=>s.itemId===p.id)).map(p=>p.id);
    if(ids.length)PlanningCore.markShoppingParts(data,scope,row.key,ids,status);
  }
}
function shoppingTickDish(input,scope){
  const instance=input.dataset.shopDish,reference=shoppingReference(scope,instance);if(!reference)return;
  const keys=(reference.members||[reference]).map(r=>r.key);
  const before=PlanningCore.clone((planningStore.data.shopping.scopes.find(s=>PlanningCore.scopeKey(s)===PlanningCore.scopeKey(scope))?.adjustments||[]).filter(a=>keys.includes(a.ingredient+':'+a.unit)));
  const success=planningStore.change(d=>shoppingMarkReference(d,scope,reference,input.checked?'bought':'needed'));
  shoppingCheckNotice=success&&input.checked&&reference.presentation.shared?{instance,key:reference.key,keys,before,scopeKey:PlanningCore.scopeKey(scope),after:JSON.stringify(planningStore.data),all:false}:null;
  shoppingRefresh(reference.key,'input[data-shop-dish]');
  if(success)announce(planningStore.mode==='ready'?sc('saved'):pt('unavailable'));
}
function renderShopping(kind,id){
  const owner=(kind==='plan'?planningStore.data.plans:planningStore.data.events).find(p=>p.id===id);
  if(!owner||!['plan','event'].includes(kind))return planningNotFound();
  const scope=PlanningCore.getScope(planningStore.data,kind,id),rows=PlanningCore.shoppingTargets(planningStore.data,scope),blocked=shoppingBlocked()?'disabled':'';
  const groups=group=>{
    if(group==='seasonings'){
      const items=PlanningCore.seasoningGroups(planningStore.data,scope);
      return items.length?`<section class="shopping-seasonings"><h2>${sc('seasonings')}</h2><p class="planning-caption">${sc('seasoningHelp')}</p>${items.map(shoppingSeasoningRow).join('')}</section>`:'';
    }
    const items=rows.filter(row=>row.personal?group==='personal':!PlanningCore.seasoningIds.includes(row.ingredient)&&PlanningCore.ingredients[row.ingredient].group===group);
    return items.length?`<section><h2>${group==='personal'?sc('additions'):pt(group)}</h2>${items.map(row=>shoppingRow(row,scope)).join('')}</section>`:'';
  };
  return `<div class="planning-heading shopping-heading"><h1>${sc('shopping')}</h1><button type="button" class="button" data-shop-action="add" ${blocked}>${sc('add')}</button></div>
    <div class="shopping-scope-bar"><button type="button" class="shopping-list-selector" data-shop-action="switch-list" aria-haspopup="dialog" aria-label="${sc('switchList')}: ${escapeHTML(pl(owner.name))}"><span>${escapeHTML(pl(owner.name))}</span>${planningIcon('chevron')}</button><span>${shoppingScopeLabel(scope)}</span>${kind==='plan'?`<button type="button" class="text-link" data-shop-action="scope" ${blocked}>${sc('changeScope')}</button>`:''}<label class="shopping-view-picker" for="shopping-layout">${sc('groupBy')}<select id="shopping-layout" ${blocked}>${PlanningCore.shoppingLayouts.map(value=>`<option value="${value}" ${shoppingLayout()===value?'selected':''}>${sc(value)}</option>`).join('')}</select></label></div>
    ${shoppingUndo&&PlanningCore.scopeKey(shoppingUndo.scope)===PlanningCore.scopeKey(scope)?`<div class="shopping-undo" role="status">${sc('removed')} <button type="button" class="text-link" data-shop-action="undo" ${blocked}>${sc('undo')}</button></div>`:''}
    ${rows.length?shoppingLayout()==='category'?`<div class="planning-shopping shopping-interactive"><div class="shopping-column">${groups('produce')}${groups('bakery')}</div><div class="shopping-column">${groups('cupboard')}${groups('seasonings')}${groups('personal')}</div></div>`:shoppingAlternativeView(scope):`<p class="planning-empty">${sc('empty')}</p>`}`;
}
function shoppingRefresh(key,control='summary',keepOpen=true){
  const origin=shoppingInteractionKey(document.activeElement,key);
  const open=keepOpen?[...document.querySelectorAll('[data-shop-detail][open]')].map(e=>e.dataset.shopDetail):[];
  renderPlanning();
  shoppingApplyMixed();
  for(const e of document.querySelectorAll('[data-shop-detail]'))if(open.includes(e.dataset.shopDetail))e.open=true;
  const row=[...document.querySelectorAll('[data-shop-row]')].find(e=>(e.dataset.shopInstance||e.dataset.shopRow)===origin)||[...document.querySelectorAll('[data-shop-row]')].find(e=>e.dataset.shopRow===key);
  const focus=row?.querySelector(control)||row?.querySelector('summary')||document.querySelector('[data-shop-action="add"]');focus?.focus({preventScroll:true});
}
function shoppingCommit(edit,key,control='summary'){
  shoppingCheckNotice=null;
  const success=planningStore.change(edit);shoppingRefresh(key,control);
  if(success)announce(planningStore.mode==='ready'?sc('saved'):pt('unavailable'));
  return success;
}
function shoppingScopeDialog(scope){
  const plan=planningStore.data.plans.find(p=>p.id===scope.ownerId);if(!plan)return;
  const initialDates=shoppingTwoDayRange(plan,scope.mode==='dates'?scope.from:null);
  const choices=[...plan.meals.map(m=>({key:'meal:'+m.id,date:m.date,title:pl(m.name)||pt('meals')})),...planningStore.data.events.filter(e=>plan.eventIds.includes(e.id)&&e.date>=plan.start&&e.date<=plan.end).map(e=>({key:'event:'+e.id,date:e.date,title:pl(e.name)}))].sort((a,b)=>a.date.localeCompare(b.date));
  planningModal(sc('scopeTitle'),`<form id="shopping-scope-form" novalidate><p class="planning-caption">${sc('scopeHelp')}</p><fieldset class="shopping-scope-modes"><legend class="sr-only">${sc('scopeTitle')}</legend>${['all','dates','meals'].map(mode=>`<label><input type="radio" name="mode" value="${mode}" ${scope.mode===mode?'checked':''}>${sc(mode==='all'?'allPlan':mode)}</label>`).join('')}</fieldset><fieldset data-shop-scope-fields="dates" ${scope.mode==='dates'?'':'hidden disabled'}><legend>${sc('dates')}</legend><div class="shopping-date-inputs"><label>${sc('from')}<input name="from" type="date" required min="${plan.start}" max="${plan.end}" value="${scope.from||initialDates.from}"></label><label>${sc('to')}<input name="to" type="date" required min="${plan.start}" max="${plan.end}" value="${scope.to||plan.end}"></label></div><button type="button" class="text-link" data-shop-action="two-days">${sc('twoDays')}</button></fieldset><fieldset data-shop-scope-fields="meals" ${scope.mode==='meals'?'':'hidden disabled'}><legend>${sc('meals')}</legend>${choices.length?choices.map(c=>`<label class="shopping-meal-choice"><input type="checkbox" name="selection" value="${c.key}" ${scope.selection.includes(c.key)?'checked':''}><span>${escapeHTML(c.title)}<small>${planningDate(c.date)}</small></span></label>`).join(''):`<p>${sc('noMeals')}</p>`}</fieldset><p id="shopping-scope-error" class="shopping-error" role="alert" tabindex="-1"></p><div class="planning-modal-actions row"><button class="button" type="submit">${sc('apply')}</button>${planningAction('cancel',pt('cancel'),'','button secondary')}</div></form>`);
}
function shoppingPersonalDialog(item=null){
  planningModal(sc(item?'edit':'add'),`<form id="shopping-personal-form" data-item="${item?.id||''}" novalidate><label for="shopping-item-name">${sc('itemName')}</label><input id="shopping-item-name" name="name" type="text" maxlength="200" required value="${escapeHTML(item?.name||'')}" aria-describedby="shopping-personal-error"><div class="shopping-personal-quantity"><label for="shopping-item-quantity">${sc('quantity')}<input id="shopping-item-quantity" name="amount" type="number" inputmode="decimal" step="any" min="0.000001" max="1000000000" required value="${item?.amount||1}" aria-describedby="shopping-personal-error"></label><label for="shopping-item-unit">${sc('unit')}<select id="shopping-item-unit" name="unit">${PlanningCore.personalUnits.map(unit=>`<option value="${unit}" ${unit===(item?.unit||'count')?'selected':''}>${sc('units')[unit][1]}</option>`).join('')}</select></label></div><p id="shopping-personal-error" class="shopping-error" role="alert" tabindex="-1"></p><div class="planning-modal-actions row"><button type="submit" class="button">${sc('saveItem')}</button>${planningAction('cancel',pt('cancel'),'','button secondary')}</div></form>`);
  document.querySelector('#shopping-item-name').focus();
}
function validateShoppingInput(input,restoreMinimum=false){
  const scope=currentShopping();
  const row=PlanningCore.shoppingTargets(planningStore.data,scope).find(r=>r.key===input.dataset.shopTotal);
  let number=Number(input.value);
  if(restoreMinimum&&!shoppingBlocked()&&row&&!row.personal&&row.amount!==null&&input.value.trim()!==''&&Number.isFinite(number)&&number<row.amount){
    input.value=String(row.amount);number=row.amount;
    shoppingDrafts.set(shoppingDraftKey(scope,shoppingInteractionKey(input,row.key)),input.value);
    announce(`${state.lang==='de'?'Auf Rezeptmenge zurückgesetzt':'Reset to recipe amount'}: ${shoppingAmount(row,row.amount)}`);
  }
  const invalid=input.value.trim()===''||!Number.isFinite(number)||number>1e9||!row||number<row.amount;
  const error=document.getElementById(input.id?input.id.replace(/-total$/,'-error'):shoppingId(input.dataset.shopTotal)+'-error');
  input.setAttribute('aria-invalid',String(invalid));error.textContent=invalid?(input.value.trim()!==''&&row&&number<row.amount?sc('minimum'):sc('invalidTotal')):'';
  return !invalid;
}
function bindShoppingEvents(){
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-shop-list-link]'))document.querySelector('#planning-dialog').close();
    if(event.target.closest('[data-shop-action="switch-list"]')){shoppingListDialog();return;}
    const button=event.target.closest('[data-shop-action]');if(!button||shoppingBlocked())return;
    const scope=currentShopping();if(!scope)return;const {shopAction:action,key,status}=button.dataset;const instance=shoppingInteractionKey(button,key);
    const row=key?PlanningCore.shoppingTargets(planningStore.data,scope).find(r=>r.key===key):null;
    if(['check-all','undo-check','dismiss-check'].includes(action)){
      const notice=shoppingCheckNotice;
      if(!notice||notice.scopeKey!==PlanningCore.scopeKey(scope))return;
      if(action==='dismiss-check'||notice.after!==JSON.stringify(planningStore.data)){shoppingCheckNotice=null;shoppingRefresh(key,'input');return;}
      const reference=shoppingReference(scope,notice.instance);if(!reference)return;
      const beforeAll=PlanningCore.clone((planningStore.data.shopping.scopes.find(s=>PlanningCore.scopeKey(s)===PlanningCore.scopeKey(scope))?.adjustments||[]).filter(a=>notice.keys.includes(a.ingredient+':'+a.unit)));
      const success=planningStore.change(d=>{
        if(action==='check-all'){for(const r of reference.members||[reference])PlanningCore.markShopping(d,scope,r.key,'bought');}
        else{const saved=d.shopping.scopes.find(s=>PlanningCore.scopeKey(s)===PlanningCore.scopeKey(scope));saved.adjustments=saved.adjustments.filter(a=>!notice.keys.includes(a.ingredient+':'+a.unit));saved.adjustments.push(...PlanningCore.clone(notice.before));}
      });
      if(success)shoppingCheckNotice=action==='check-all'?{...notice,before:beforeAll,all:true,after:JSON.stringify(planningStore.data)}:null;
      shoppingRefresh(key,'input[data-shop-dish]');return;
    }
    if((action==='status'||action==='seasoning-status')&&instance.includes('|')){
      const reference=shoppingReference(scope,instance);if(reference){shoppingCommit(d=>shoppingMarkReference(d,scope,reference,status),reference.key,'input[data-shop-dish]');return;}
    }
    if(action==='scope')shoppingScopeDialog(scope);
    if(action==='two-days'){
      const form=document.getElementById('shopping-scope-form'),plan=planningStore.data.plans.find(p=>p.id===scope.ownerId);
      if(!form||!plan)return;
      try{
        const range=shoppingTwoDayRange(plan,form.elements.from.value);
        form.elements.from.value=range.from;form.elements.to.value=range.to;
        for(const radio of form.querySelectorAll('[name="mode"]'))radio.checked=radio.value==='dates';
        for(const fields of form.querySelectorAll('[data-shop-scope-fields]')){fields.hidden=fields.dataset.shopScopeFields!=='dates';fields.disabled=fields.hidden;}
        form.querySelector('.shopping-error').textContent='';form.elements.to.focus();
      }catch{const error=form.querySelector('.shopping-error');error.textContent=sc('invalidScope');error.focus();}
    }
    if(action==='seasoning-status')shoppingCommit(d=>PlanningCore.markSeasoning(d,scope,button.dataset.ingredient,status),'seasoning:'+button.dataset.ingredient,`[data-status="${status}"]`);
    if(action==='seasoning-clear'&&row)shoppingCommit(d=>PlanningCore.setShoppingTotal(d,scope,key,row.amount),'seasoning:'+button.dataset.ingredient);
    if(action==='add')shoppingPersonalDialog();
    if(action==='edit'&&row?.personal)shoppingPersonalDialog(row.record);
    if(action==='status'&&row)shoppingCommit(d=>PlanningCore.markShopping(d,scope,key,status),key,`[data-status="${status}"]`);
    if(action==='change-amount'&&row&&!row.personal&&row.amount!==null){shoppingEditors.add(shoppingDraftKey(scope,instance));shoppingRefresh(key,'input[data-shop-total]');}
    if(action==='cancel-amount'&&row){shoppingEditors.delete(shoppingDraftKey(scope,instance));shoppingDrafts.delete(shoppingDraftKey(scope,instance));shoppingRefresh(key,'[data-shop-action="change-amount"]');}
    if(action==='clear'&&row){
      const success=planningStore.change(d=>PlanningCore.setShoppingTotal(d,scope,key,row.amount));
      if(success)shoppingClearAmount(scope,key);
      shoppingRefresh(key,success?'[data-shop-action="change-amount"]':'input[data-shop-total]');
      if(success)announce(planningStore.mode==='ready'?sc('saved'):pt('unavailable'));
    }
    if(action==='remove'&&row?.personal){
      let removed;const success=planningStore.change(d=>removed=PlanningCore.removeShoppingPersonal(d,scope,row.record.id));
      if(success)shoppingUndo={scope:PlanningCore.clone(scope),record:removed};shoppingRefresh(null);document.querySelector('[data-shop-action="undo"]')?.focus();
    }
    if(action==='undo'&&shoppingUndo){
      const undo=shoppingUndo;const success=planningStore.change(d=>{PlanningCore.saveShoppingPersonal(d,undo.scope,undo.record);const s=PlanningCore.getScope(d,scope.kind,scope.ownerId);const p=s.personal.find(p=>p.id===undo.record.id);Object.assign(p,undo.record);});
      if(success)shoppingUndo=null;shoppingRefresh('personal:'+undo.record.id);
    }
  });
  document.addEventListener('input',event=>{
    const input=event.target;if(!input.dataset.shopTotal)return;const scope=currentShopping();if(!scope)return;
    shoppingDrafts.set(shoppingDraftKey(scope,shoppingInteractionKey(input,input.dataset.shopTotal)),input.value);
    if(input.getAttribute('aria-invalid')==='true')validateShoppingInput(input);
  });
  document.addEventListener('focusout',event=>{if(event.target.dataset.shopTotal&&currentShopping())validateShoppingInput(event.target,true);});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!event.target.closest('[data-shop-total-form]'))return;
    event.preventDefault();event.target.closest('[data-shop-total-form]').querySelector('[data-shop-action="cancel-amount"]').click();
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset?.shopDish){const scope=currentShopping();if(scope&&!shoppingBlocked())shoppingTickDish(input,scope);return;}
    if(input.dataset?.shopPart){const scope=currentShopping();if(scope&&!shoppingBlocked())shoppingCommit(d=>PlanningCore.markShoppingParts(d,scope,input.dataset.key,[input.dataset.shopPart],input.checked?'bought':'needed'),input.dataset.key,'input[data-shop-part]');return;}
    if(input.id==='shopping-layout'){
      if(shoppingBlocked()||!PlanningCore.shoppingLayouts.includes(input.value))return;
      const success=planningStore.change(data=>{data.preferences.shoppingLayout=input.value;});
      shoppingRefresh(null);document.getElementById('shopping-layout')?.focus({preventScroll:true});
      if(success)announce(planningStore.mode==='ready'?sc('viewChanged'):pt('unavailable'));return;
    }
    if(input.dataset.shopSeasoning){
      const scope=currentShopping();if(!scope||shoppingBlocked())return;
      const group=PlanningCore.seasoningGroups(planningStore.data,scope).find(g=>g.ingredient===input.dataset.shopSeasoning);if(!group)return;
      const status=!input.checked?'needed':group.status==='needed'?'bought':'have';
      shoppingCommit(d=>PlanningCore.markSeasoning(d,scope,group.ingredient,status),group.key,'input[data-shop-seasoning]');return;
    }
    if(input.matches('#shopping-scope-form input[name="mode"]'))for(const group of document.querySelectorAll('[data-shop-scope-fields]')){group.hidden=group.dataset.shopScopeFields!==input.value;group.disabled=group.hidden;}
    if(!input.dataset.shopCheck)return;const scope=currentShopping();if(!scope||shoppingBlocked())return;
    shoppingCommit(d=>PlanningCore.markShopping(d,scope,input.dataset.shopCheck,input.checked?'bought':'needed'),input.dataset.shopCheck,'input[data-shop-check]');
  });
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.matches('[data-shop-total-form],#shopping-scope-form,#shopping-personal-form'))return;event.preventDefault();
    const scope=currentShopping();if(!scope||shoppingBlocked())return;
    if(form.dataset.shopTotalForm){
      const input=form.querySelector('input');if(!validateShoppingInput(input,true)){input.focus();return;}
      const key=form.dataset.shopTotalForm,total=Number(input.value),instance=shoppingInteractionKey(form,key);
      const success=planningStore.change(d=>PlanningCore.setShoppingTotal(d,scope,key,total));
      if(success)shoppingClearAmount(scope,key);shoppingRefresh(key,success?'[data-shop-action="change-amount"]':'input[data-shop-total]');if(success)announce(planningStore.mode==='ready'?sc('saved'):pt('unavailable'));
      return;
    }
    const fields=new FormData(form),error=form.querySelector('.shopping-error');
    try{
      if(form.id==='shopping-scope-form'){
        const next=PlanningCore.scopeDescriptor(scope.kind,scope.ownerId,fields.get('mode'),fields.getAll('selection'),fields.get('from'),fields.get('to'));
        PlanningCore.checkScope(planningStore.data,next);
        planningStore.change(d=>PlanningCore.selectScope(d,next));document.querySelector('#planning-dialog').close();shoppingRefresh(null,'summary',false);document.querySelector('[data-shop-action="scope"]')?.focus();
      }else{
        const item={id:form.dataset.item||crypto.randomUUID(),name:fields.get('name'),amount:Number(fields.get('amount')),unit:fields.get('unit')};
        planningStore.change(d=>PlanningCore.saveShoppingPersonal(d,scope,item));document.querySelector('#planning-dialog').close();shoppingRefresh('personal:'+item.id);
      }
    }catch{error.textContent=sc(form.id==='shopping-scope-form'?'invalidScope':'invalidItem');error.focus();}
  });
}
