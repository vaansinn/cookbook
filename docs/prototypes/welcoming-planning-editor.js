'use strict';
// Local planning editors. Recipe/cook state is deliberately never mutated here.
const peText={
 en:{newPlan:'New meal plan',newEvent:'New event',edit:'Edit',save:'Save',name:'Name',start:'First day',end:'Last day',date:'Date',time:'Time (optional)',guests:'Guests',again:'Plan again',remove:'Delete',more:'More options',current:'In progress / today',upcoming:'Upcoming',past:'Past',all:'Current & upcoming',none:'Nothing here yet.',addMeal:'Add meal',meal:'Meal',addItem:'Add dish or item',item:'Dish or item',kind:'Type',dish:'Recipe',personal:'Personal item',note:'Note',recipe:'Recipe',servings:'Servings',sauce:'Sauce',language:'Recipe language',group:'Menu group (optional)',contribution:'Someone else brings this — exclude from my shopping',follow:'Follow guest count',optional:'Name (optional)',move:'Move',copy:'Copy',destination:'Destination',position:'Position (1 = first)',link:'Link event',unlink:'Remove link',saveTemplate:'Save as template',useTemplate:'Add from template',template:'Template',newTask:'Add task',task:'Preparation task',taskGroup:'When',undo:'Undo',saved:'Saved.',confirm:'Confirm change',review:'Please check these changes',removed:'Meals that will be removed:',scopes:'Shopping selections that will be cleared (including their checkmarks and extras):',changed:'The draft changed. Close this dialog and review the latest version.',invalid:'Please check the dates, quantities and required fields.',deleteBody:'Delete this entry? You can undo immediately afterwards.',eventLinks:'This event is linked to these plans. Changes apply everywhere:',planDelete:'Linked events will remain available in Events.',copyBody:'Creates independent items with fresh shopping checkmarks. Linked events become separate occasions. Preparation reminders start unchecked.',outside:'Linked events outside these dates',ingredients:'Shopping ingredients',addIngredient:'Add ingredient',unit:'Unit',quantity:'Quantity',noIngredients:'No shopping ingredients. Add them below if needed.',newCopy:' (again)',back:'Back',method:'Method',equipment:'Equipment',preview:'Configured recipe preview',previewNote:'Your planned servings and sauce are shown here. Existing cooking attempts are unchanged. Timing and equipment still need a cooking check.',templateNote:'Adds independent items; the original is not changed.',removeIngredient:'Remove ingredient',noTargets:'Create a meal or event first.',scopeAll:'All meals',scopeDates:'Selected dates',scopeMeals:'Selected meals',event:'Event',plan:'Meal plan'},
 de:{newPlan:'Neuer Essensplan',newEvent:'Neuer Anlass',edit:'Bearbeiten',save:'Speichern',name:'Name',start:'Erster Tag',end:'Letzter Tag',date:'Datum',time:'Uhrzeit (optional)',guests:'Gäste',again:'Erneut planen',remove:'Löschen',more:'Weitere Optionen',current:'Laufend / heute',upcoming:'Bevorstehend',past:'Vergangen',all:'Aktuell & bevorstehend',none:'Hier ist noch nichts.',addMeal:'Mahlzeit hinzufügen',meal:'Mahlzeit',addItem:'Gericht oder Eintrag hinzufügen',item:'Gericht oder Eintrag',kind:'Art',dish:'Rezept',personal:'Eigener Eintrag',note:'Notiz',recipe:'Rezept',servings:'Portionen',sauce:'Sauce',language:'Rezeptsprache',group:'Menügruppe (optional)',contribution:'Wird mitgebracht — nicht auf meinem Einkaufszettel',follow:'Gästezahl übernehmen',optional:'Name (optional)',move:'Verschieben',copy:'Kopieren',destination:'Ziel',position:'Position (1 = zuerst)',link:'Anlass verknüpfen',unlink:'Verknüpfung entfernen',saveTemplate:'Als Vorlage speichern',useTemplate:'Aus Vorlage hinzufügen',template:'Vorlage',newTask:'Aufgabe hinzufügen',task:'Aufgabe',taskGroup:'Wann',undo:'Rückgängig',saved:'Gespeichert.',confirm:'Änderung bestätigen',review:'Bitte diese Änderungen prüfen',removed:'Diese Mahlzeiten werden entfernt:',scopes:'Diese Einkaufsauswahlen werden geleert (einschließlich Häkchen und Extras):',changed:'Der Entwurf wurde geändert. Schließe den Dialog und prüfe den aktuellen Stand.',invalid:'Bitte Daten, Mengen und Pflichtfelder prüfen.',deleteBody:'Diesen Eintrag löschen? Direkt danach kannst du dies rückgängig machen.',eventLinks:'Dieser Anlass ist mit folgenden Plänen verknüpft. Änderungen gelten überall:',planDelete:'Verknüpfte Anlässe bleiben unter Anlässe verfügbar.',copyBody:'Erstellt unabhängige Einträge mit neuen Einkaufslisten. Verknüpfte Anlässe werden eigene Kopien. Vorbereitungsaufgaben sind wieder offen.',outside:'Verknüpfte Anlässe außerhalb dieser Daten',ingredients:'Einkaufszutaten',addIngredient:'Zutat hinzufügen',unit:'Einheit',quantity:'Menge',noIngredients:'Keine Einkaufszutaten. Bei Bedarf unten hinzufügen.',newCopy:' (erneut)',back:'Zurück',method:'Zubereitung',equipment:'Kochgeschirr',preview:'Konfigurierte Rezeptvorschau',previewNote:'Hier siehst du deine geplanten Portionen und die Sauce. Laufende Kochversuche bleiben unverändert. Zeit und Kochgeschirr müssen noch beim Kochen geprüft werden.',templateNote:'Fügt unabhängige Einträge hinzu; das Original bleibt unverändert.',removeIngredient:'Zutat entfernen',noTargets:'Erstelle zuerst eine Mahlzeit oder einen Anlass.',scopeAll:'Alle Mahlzeiten',scopeDates:'Ausgewählte Daten',scopeMeals:'Ausgewählte Mahlzeiten',event:'Anlass',plan:'Essensplan'}
};
const pe=k=>peText[state.lang][k];
planningStrings.en.draftBody='Local prototype: edit meal plans and event menus, repeat past plans, and review the resulting shopping. Soup and salad are planning examples, not cooking guides. Pack sizes, Use the rest, shared preparation and leftovers come later.';
planningStrings.de.draftBody='Lokaler Prototyp: Essenspläne und Menüs bearbeiten, vergangene Pläne wiederholen und den Einkauf prüfen. Suppe und Salat sind Planungsbeispiele, keine Kochanleitungen. Packungsgrößen, Resteverwertung, gemeinsame Vorbereitung und übrig gebliebene Portionen folgen später.';
const peEsc=value=>escapeHTML(String(value??''));
let peFilter={plan:'all',event:'all'},pePending=null,peUndo=null,peReturn=null;
function clearPlanningEditorTransient(){pePending=null;peUndo=null;peReturn=null;}
function peToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function peButton(action,label,attrs='',style='text-link'){return `<button type="button" class="${style}" data-pe="${action}" ${attrs}>${label}</button>`;}
function peAttrs(kind,id){return `data-kind="${kind}" data-id="${peEsc(id)}"`;}
function peMore(body,label=pe('more')){
 return `<span class="pe-more"><button type="button" class="pe-menu-trigger" data-pe="menu" aria-haspopup="dialog" aria-expanded="false" aria-label="${peEsc(label)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button><template>${body}</template></span>`;
}
function pePlus(action,label,attrs=''){return peButton(action,'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',attrs+` aria-label="${peEsc(label)}" title="${peEsc(label)}"`,'pe-inline-icon');}
function peShoppingLink(kind,id){return `<a class="pe-shop-link" href="#shopping/${kind}/${id}" aria-label="${pt('shop')}">${planningIcon('bag')}<span>${state.lang==='de'?'Einkauf':'Shopping'}</span></a>`;}

function peOwnerHref(kind,id){return kind==='plan'?`#plan/plans/${id}`:`#plan/event/${id}`;}
function peOwnerActions(kind,id){const a=peAttrs(kind,id);return peMore(peButton('owner',pe('edit'),a)+peButton('again',pe('again'),a)+(kind==='event'?peButton('template-save',pe('saveTemplate'),peAttrs('menu',id)):'')+peButton('delete',pe('remove'),a),pe('more')+': '+pl(planningStore.data[kind==='plan'?'plans':'events'].find(o=>o.id===id)?.name));}
function peList(kind){
 const owners=planningStore.data[kind==='plan'?'plans':'events'],filter=peFilter[kind],today=peToday();
 const groups=filter==='past'?['past']:['current','upcoming'];
 const cards=groups.map(period=>{const list=owners.filter(o=>PlanningCore.planningPeriod(o,today)===period).sort((a,b)=>((a.start||a.date).localeCompare(b.start||b.date))*(period==='past'?-1:1));return list.length?`<section class="pe-period"><h2>${pe(period)}</h2><div class="planning-event-grid">${list.map(o=>`<article class="pe-owner-card"><a href="${peOwnerHref(kind,o.id)}">${planningIcon(kind==='plan'?'calendar':'table')}<h3>${peEsc(pl(o.name))}</h3><p>${planningDate(o.start||o.date)}${kind==='plan'?` – ${planningDate(o.end)}`:''}</p><span>${kind==='plan'?`${PlanningCore.dayCount(o.start,o.end)} ${pt('days')}`:`${o.guests} ${pt('guests')}${o.time?' · '+o.time:''}`}</span></a><div class="pe-card-actions">${peButton('again',pe('again'),peAttrs(kind,o.id))}${peOwnerActions(kind,o.id)}</div></article>`).join('')}</div></section>`:'';}).join('');
 return `<div class="planning-heading"><h1>${pt(kind==='plan'?'plans':'events')}</h1>${peButton('owner',pe(kind==='plan'?'newPlan':'newEvent'),peAttrs(kind,''),'button')}</div><div class="pe-period-filter" role="group" aria-label="${pt(kind==='plan'?'plans':'events')}">${['all','past'].map(f=>peButton('filter',pe(f),`data-kind="${kind}" data-filter="${f}" aria-pressed="${filter===f}"`)).join('')}</div>${cards||`<p class="planning-empty">${pe('none')}</p>`}`;
}
function peItem(item){
 const recipe=item.kind==='dish'?PlanningCore.catalog[item.recipeId]:null,title=recipe?recipe[state.lang]:pl(item.name),a=peAttrs('item',item.id);
 const options=recipe?Object.keys(recipe.variants):[];
 const actions=peButton('item',pe('edit'),a)+peButton('transfer',pe('move'),a)+peButton('transfer',pe('copy'),a+' data-copy="true"')+peButton('delete',pe('remove'),a);
 return `<article class="planning-dish pe-item ${item.kind==='note'?'pe-note-row':''}">
 ${recipe?.image?`<figure class="planning-thumb"><img src="kitchen-assets/${recipe.image}.png" width="48" height="48" alt="" loading="lazy">${aiLink(pt('ai'),'planning-photo-credit')}</figure>`:''}
 <div class="pe-item-content">${recipe?peButton('recipe',peEsc(title),`data-id="${item.id}"`,'planning-dish-title'):`<p class="pe-personal-title">${peEsc(title)}</p>`}
 ${recipe?`<div class="pe-item-meta">${peButton('quick-servings',`${item.servings} ${pt('servings')}`,`data-id="${item.id}" aria-label="${pe('servings')}: ${peEsc(title)}"`,'pe-value-button')}${options.length>1?peButton('quick-sauce',`${pt(item.options.sauce)} <span class="pe-change-word">${tt('change')}</span>`,`data-id="${item.id}" aria-label="${tt('change')}: ${peEsc(title)}"`,'pe-value-button'):recipe.status==='planningExample'?`<span>${pt('example')}</span>`:''}</div>`:''}
 ${item.contribution?`<p class="pe-contribution">${pt('contribution')}</p>`:''}</div>
 ${peMore(actions,pe('more')+': '+title)}</article>`;
}
function peEventLink(event,plan,showDate=false){
 const names=event.items.map(i=>i.kind==='dish'?PlanningCore.catalog[i.recipeId][state.lang]:pl(i.name));
 return `<article class="pe-linked pe-meal"><header class="pe-meal-heading"><span class="pe-event-label">${planningIcon('table')}${pt('event')}${event.time?' · '+event.time:''}</span>${peMore(peButton('owner',pe('edit'),peAttrs('event',event.id))+peButton('unlink',pe('unlink'),`data-plan="${plan.id}" data-id="${event.id}"`),pe('more')+': '+pl(event.name))}</header><a class="pe-event-open" href="#plan/event/${event.id}"><h3>${peEsc(pl(event.name))}</h3>${showDate?`<p>${planningDate(event.date)}</p>`:''}<p>${event.guests} ${pt('guests')}</p><div class="pe-event-preview">${names.slice(0,3).map(n=>`<span>${peEsc(n)}</span>`).join('')}${names.length>3?`<span class="pe-event-more">${names.length-3} ${state.lang==='de'?'weitere':'more'}</span>`:''}</div><span class="pe-open-label">${pt('openEvent')} →</span></a></article>`;
}
function peAgenda(plan){
 if(!plan)return planningNotFound();
 const count=PlanningCore.dayCount(plan.start,plan.end);planningOffset=Math.max(0,Math.min(planningOffset,Math.max(0,count-3)));
 const events=planningStore.data.events.filter(e=>plan.eventIds.includes(e.id));
 const outside=events.filter(e=>e.date<plan.start||e.date>plan.end);
 const ownerActions=peButton('owner',pe('edit'),peAttrs('plan',plan.id))+peButton('link',pe('link'),peAttrs('plan',plan.id))+peButton('again',pe('again'),peAttrs('plan',plan.id))+peButton('delete',pe('remove'),peAttrs('plan',plan.id));
 const visible=PlanningCore.days(plan.start,plan.end,planningOffset,3);
 return `<div class="planning-heading pe-plan-heading"><div><h1>${peEsc(pl(plan.name))}</h1><p>${planningDate(plan.start)} – ${planningDate(plan.end)}</p></div><div class="pe-heading-actions">${peShoppingLink('plan',plan.id)}${peMore(ownerActions,pe('more')+': '+pl(plan.name))}</div></div>
 ${count>3?`<nav class="pe-date-bar" aria-label="${pe('date')}">${planningAction('prev','←',`aria-label="${pt('prev')}" ${planningOffset===0?'disabled':''}`,'planning-page-button')}${peButton('jump',`${planningDate(visible[0])} – ${planningDate(visible.at(-1))}`,peAttrs('plan',plan.id),'pe-date-jump')}${planningAction('next','→',`aria-label="${pt('next')}" ${planningOffset+3>=count?'disabled':''}`,'planning-page-button')}</nav>`:''}
 <div class="planning-days">${visible.map(date=>{
 const meals=plan.meals.filter(m=>m.date===date),linked=events.filter(e=>e.date===date);
 return `<section class="planning-day ${!meals.length&&!linked.length?'pe-empty-day':''}"><header><h2><span>${planningDate(date,{weekday:'short'})}</span> ${planningDate(date,{day:'numeric',month:'short'})}</h2>${pePlus('meal',pe('addMeal')+' · '+planningDate(date),`data-plan="${plan.id}" data-date="${date}"`)}</header>
 <div class="planning-day-content">${meals.map(m=>{
 const label=pl(m.name)||pe('meal'),attrs=`data-plan="${plan.id}" data-id="${m.id}"`;
 const actions=peButton('meal',pe('edit'),attrs)+peButton('transfer',pe('move'),peAttrs('meal',m.id))+peButton('transfer',pe('copy'),peAttrs('meal',m.id)+' data-copy="true"')+peButton('template-save',pe('saveTemplate'),peAttrs('meal',m.id))+peButton('template-use',pe('useTemplate'),peAttrs('meal',m.id))+peButton('delete',pe('remove'),peAttrs('meal',m.id));
 return `<section class="planning-meal pe-meal"><header class="pe-meal-heading"><h3>${peButton('meal',peEsc(label),attrs,'pe-meal-title')}${m.time?`<span class="pe-meal-time">${m.time}</span>`:''}</h3><div class="pe-card-tools">${m.items.length?pePlus('item',pe('addItem')+': '+label,`data-container="${m.id}" data-kind="meal"`):''}${peMore(actions,pe('more')+': '+label+' · '+planningDate(m.date))}</div></header>${m.items.map(peItem).join('')}${!m.items.length?peButton('item',pe('addItem'),`data-container="${m.id}" data-kind="meal"`,'pe-empty-add'):''}</section>`;
 }).join('')}${linked.map(e=>peEventLink(e,plan)).join('')}${!meals.length&&!linked.length?`<p class="pe-open-day">${pt('free')}</p>`:''}</div></section>`;
 }).join('')}</div>${outside.length?`<section class="pe-period"><h2>${pe('outside')}</h2><div class="planning-event-grid">${outside.map(e=>peEventLink(e,plan,true)).join('')}</div></section>`:''}`;
}
function peEvent(event,prep){
 if(!event)return planningNotFound();const links=planningStore.data.plans.filter(p=>p.eventIds.includes(event.id));
 const groups=[...new Set(event.items.map(i=>pl(i.group)||pt('menu')))];
 return `<a class="back" href="#plan/events">← ${pt('events')}</a><div class="planning-heading"><div><h1>${peEsc(pl(event.name))}</h1><p>${planningDate(event.date)}${event.time?' · '+event.time:''} · ${event.guests} ${pt('guests')}</p></div><div class="pe-heading-actions"><a class="button" href="#shopping/event/${event.id}">${pt('shop')}</a>${peOwnerActions('event',event.id)}</div></div><div class="planning-event-tabs"><a href="#plan/event/${event.id}" ${!prep?'aria-current="page"':''}>${pt('menu')}</a><a href="#plan/event/${event.id}/prep" ${prep?'aria-current="page"':''}>${pt('prep')}</a></div>${prep?`<p class="planning-caption">${pt('taskNote')}</p><div class="planning-tasks">${['earlier','day','serving'].map(group=>`<section><h2>${pt(group)}</h2>${event.tasks.filter(t=>t.group===group).map(t=>`<div class="pe-task"><label><input type="checkbox" data-planning-task="${t.id}" data-event="${event.id}" ${t.done?'checked':''}><span>${peEsc(pl(t.name))}</span></label>${peMore(peButton('task',pe('edit'),`data-event="${event.id}" data-id="${t.id}"`)+peButton('delete',pe('remove'),peAttrs('task',t.id)),pe('more')+': '+pl(t.name))}</div>`).join('')}${peButton('task',pe('newTask'),`data-event="${event.id}" data-group="${group}"`)}</section>`).join('')}</div>`:`<div class="pe-menu">${groups.map(group=>`<section><h2>${peEsc(group)}</h2>${event.items.filter(i=>(pl(i.group)||pt('menu'))===group).map(peItem).join('')}</section>`).join('')}</div><div class="pe-heading-actions">${peButton('item',pe('addItem'),`data-kind="event" data-container="${event.id}"`,'button')}${peButton('template-use',pe('useTemplate'),peAttrs('event',event.id))}</div>`}${links.length?`<p class="planning-linked">${pt('linked')}: ${links.map(p=>`<a href="#plan/plans/${p.id}">${peEsc(pl(p.name))}</a>`).join(', ')}</p>`:''}`;
}
function peRecipe(id){
 const item=planningFindItem(id);if(!item||item.kind!=='dish')return planningNotFound();
 const r=PlanningCore.catalog[item.recipeId],owner=PlanningCore.findItemOwner(planningStore.data,id),lang=item.language;
 const steps=r.status==='planningExample'?[]:item.recipeId==='tomato'?resolveTomatoRecipe(lang,item.options.sauce).steps:strings[lang].stepTitles.map((s,i)=>[s,strings[lang].instructions[i]]);
 const rows=PlanningCore.itemRows({...item,contribution:false});
 return `<a class="back" href="${peOwnerHref(owner.kind==='meal'?'plan':'event',owner.planId||owner.id)}">← ${pe('back')}</a><div class="planning-heading"><div><h1>${peEsc(r[lang])}</h1><p>${item.servings} ${pt('servings')} · ${pt(r.status==='planningExample'?'example':'drafts')}</p></div>${peButton('item',tt('change'),peAttrs('item',id))}</div><div class="pe-recipe" lang="${lang}"><section><h2>${strings[lang].ingredients}</h2>${r.image?`<figure class="planning-detail-image"><img src="kitchen-assets/${r.image}.png" alt="${peEsc(r[lang])}" width="160" height="160"><figcaption>${aiLink(pt('ai'),'text-link')}</figcaption></figure>`:''}<ul class="planning-detail-ingredients">${rows.map(([i,q,u])=>`<li><span>${PlanningCore.ingredients[i][lang]}</span><strong>${planningQuantity(q,u,i)}</strong></li>`).join('')}</ul>${steps.length?`<p class="planning-caption">${strings[lang].water}</p>`:''}</section><section>${steps.length?`<h2>${strings[lang].steps}</h2><ol class="method-list">${steps.map(([title,body])=>`<li><div><h3>${peEsc(title)}</h3><p>${peEsc(body)}</p></div></li>`).join('')}</ol>${item.recipeId==='tomato'?`<h2>${tomatoStrings[lang].equipment}</h2><p>${tomatoStrings[lang].equipmentItems.join(' · ')}</p>`:''}`:`<p>${pt('exampleNote')}</p>`}</section></div>${steps.length?`<p class="planning-caption">${pe('previewNote')}</p>`:''}`;
}
function renderPlanningEditorRoute(parts){
 const area=parts[1]||'plans',id=parts[2];
 if(area==='plans'&&parts.length<=3)return id?peAgenda(planningStore.data.plans.find(p=>p.id===id)):peList('plan');
 if(area==='events'&&!id)return peList('event');
 if(area==='event'&&parts.length<=4&&(!parts[3]||parts[3]==='prep'))return peEvent(planningStore.data.events.find(e=>e.id===id),parts[3]==='prep');
 if(area==='recipe'&&id&&parts.length===3)return peRecipe(id);
 return null;
}
function peUndoMarkup(){return peUndo&&peUndo.after===JSON.stringify(planningStore.data)?`<div class="pe-saved" role="status"><span>${pe('saved')}</span>${peButton('undo',pe('undo'))}</div>`:'';}
function peInput(name,label,value='',type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${peEsc(value)}" ${type==='text'?'maxlength="200"':''} ${extra}></label>`;}
function peSelect(name,label,options,value){return `<label>${label}<select name="${name}">${options.map(([key,text])=>`<option value="${peEsc(key)}" ${String(value)===String(key)?'selected':''}>${peEsc(text)}</option>`).join('')}</select></label>`;}
function peCheck(name,label,checked){return `<label class="pe-check"><input type="checkbox" name="${name}" ${checked?'checked':''}>${label}</label>`;}
function peOpen(title,body,submit){
 const modal=document.querySelector('#planning-dialog');
 const origin=modal.classList.contains('pe-actions-dialog')?peReturn:document.activeElement;
 modal.classList.remove('pe-actions-dialog');modal.style.removeProperty('--pe-menu-top');modal.style.removeProperty('--pe-menu-left');
 peReturn=origin;pePending={baseline:JSON.stringify(planningStore.data),submit};
 planningModal(title,`<form id="pe-form">${body}<p id="pe-error" role="alert"></p><div class="row planning-modal-actions"><button class="button" type="submit">${pe('save')}</button>${peButton('cancel',pt('cancel'),'','button secondary')}</div></form>`);
 document.querySelector('#pe-form input:not([disabled]),#pe-form select,#pe-form button')?.focus();
}
function peQuickItem(id,field){
 const item=planningFindItem(id);if(!item||item.kind!=='dish')return;
 const owner=PlanningCore.findItemOwner(planningStore.data,id),recipe=PlanningCore.catalog[item.recipeId];
 const following=owner.kind==='event'&&item.followsGuests;
 const body=field==='servings'?peInput('servings',pe('servings'),item.servings,'number','min="0.01" max="10000" step="any" required'+(following?' disabled':''))+(owner.kind==='event'?peCheck('follow',pe('follow'),following):''):peSelect('sauce',pe('sauce'),Object.keys(recipe.variants).map(k=>[k,pt(k)]),item.options.sauce);
 peOpen(recipe[state.lang],body,f=>peApply(d=>{
 const values=PlanningCore.clone(item);
 if(field==='servings'){values.servings=Number(f.get('servings'));values.followsGuests=owner.kind==='event'&&f.has('follow');}
 else values.options.sauce=f.get('sauce');
 return PlanningCore.savePlannedItem(d,owner.kind,owner.id,id,values);
 }));
}
function peOpenActions(button){
 const modal=document.querySelector('#planning-dialog'),rect=button.getBoundingClientRect();
 pePending=null;peReturn=button;button.setAttribute('aria-expanded','true');
 modal.classList.add('pe-actions-dialog');
 modal.style.setProperty('--pe-menu-left',Math.max(12,Math.min(rect.right-260,innerWidth-284))+'px');
 modal.style.setProperty('--pe-menu-top',Math.max(12,Math.min(rect.bottom+6,innerHeight-440))+'px');
 planningModal(button.getAttribute('aria-label'),'<div class="pe-action-list">'+button.nextElementSibling.innerHTML+'</div>');
 document.querySelector('.pe-action-list button')?.focus();
}
function peError(message){const target=document.querySelector('#pe-error');if(target)target.textContent=message;else document.querySelector('#announcement').textContent=message;}
function peCommit(preview,baseline,route){
 if(baseline!==JSON.stringify(planningStore.data)||['invalid','conflict'].includes(planningStore.mode)){peError(pe('changed'));return false;}
 const before=PlanningCore.clone(planningStore.data),oldRoute=location.hash;
 const changed=planningStore.change(d=>{for(const key of Object.keys(d))delete d[key];Object.assign(d,PlanningCore.clone(preview.next));});
 if(!changed){peError(pe('changed'));return false;}
 peUndo={before,after:JSON.stringify(planningStore.data),route:oldRoute};clearShoppingTransient();pePending=null;
 document.querySelector('#planning-dialog').close();if(route&&route!==location.hash)location.hash=route;else renderPlanning();planningFocusHeading();
 return true;
}
function peApply(edit,{route=null,warning=''}={}){
 const baseline=pePending?.baseline||JSON.stringify(planningStore.data);
 if(baseline!==JSON.stringify(planningStore.data)){peError(pe('changed'));return;}
 let preview;try{preview=PlanningCore.previewPlanningEdit(planningStore.data,edit);}catch{peError(pe('invalid'));return;}
 const href=typeof route==='function'?route(preview.result):route;
 if(warning||preview.removedMeals.length||preview.scopes.length){
  const meals=preview.removedMeals.map(m=>`<li>${peEsc(pl(m.name)||pe('meal'))} · ${planningDate(m.date)} (${m.items.length})</li>`).join('');
  const scopes=preview.scopes.map(s=>{const owner=planningStore.data[s.kind==='plan'?'plans':'events'].find(o=>o.id===s.ownerId);return `<li>${peEsc(pl(owner?.name))} · ${pe(s.mode==='dates'?'scopeDates':s.mode==='meals'?'scopeMeals':'scopeAll')}${s.mode==='dates'?' · '+peEsc(s.from)+' – '+peEsc(s.to):''}</li>`;}).join('');
  const body=`${warning?`<p>${warning}</p>`:''}${meals?`<p>${pe('removed')}</p><ul>${meals}</ul>`:''}${scopes?`<p>${pe('scopes')}</p><ul>${scopes}</ul>`:''}`;
  // Keep the original preview and baseline: confirmation must never rerun ID creation.
  peOpen(pe('review'),body,()=>peCommit(preview,baseline,href));
  document.querySelector('#pe-form button[type="submit"]').textContent=pe('confirm');document.querySelector('#pe-form [data-pe="cancel"]').focus();return;
 }
 peCommit(preview,baseline,href);
}
function peOwnerForm(kind,id,again=false){
 const o=planningStore.data[kind==='plan'?'plans':'events'].find(o=>o.id===id),isPlan=kind==='plan';
 const start=again?peToday():o?.start||peToday(),date=again?peToday():o?.date||peToday();
 const linked=kind==='event'&&o?planningStore.data.plans.filter(p=>p.eventIds.includes(id)):[];
 peOpen(pe(again?'again':o?'edit':isPlan?'newPlan':'newEvent'),`${again?`<p class="planning-caption">${pe('copyBody')}</p>`:''}${peInput('name',pe('name'),o?pl(o.name)+(again?pe('newCopy'):''):'','text','required')}${isPlan?`<div class="pe-fields">${peInput('start',pe('start'),start,'date','required')}${!again?peInput('end',pe('end'),o?.end||start,'date','required'):''}</div>`:peInput('date',pe('date'),date,'date','required')}${!isPlan&&!again?`<div class="pe-fields">${peInput('time',pe('time'),o?.time||'','time')}${peInput('guests',pe('guests'),o?.guests||2,'number','required min="1" max="10000" step="1"')}</div>${linked.length?`<p>${pe('eventLinks')} ${linked.map(p=>peEsc(pl(p.name))).join(', ')}</p>`:''}`:''}`,f=>{
  const name=f.get('name').trim();if(!name)throw Error('name');
  const values=isPlan?{name,start:f.get('start'),end:f.get('end')}:{name,date:f.get('date'),time:f.get('time'),guests:Number(f.get('guests'))};
  peApply(d=>again?(isPlan?PlanningCore.copyPlan(d,id,values.start,name):PlanningCore.copyEvent(d,id,values.date,name)):(isPlan?PlanningCore.savePlan(d,id||null,values):PlanningCore.saveEvent(d,id||null,values)),{route:result=>peOwnerHref(kind,result)});
 });
}
function peMealForm(planId,id,date){const p=planningStore.data.plans.find(p=>p.id===planId),m=p.meals.find(m=>m.id===id);
 peOpen(pe('meal'),`${peInput('name',pe('optional'),m?pl(m.name):'')}<div class="pe-fields">${peInput('date',pe('date'),m?.date||date||p.start,'date',`required min="${p.start}" max="${p.end}"`)}${peInput('time',pe('time'),m?.time||'','time')}</div>`,f=>peApply(d=>PlanningCore.saveMeal(d,planId,id||null,{name:f.get('name').trim(),date:f.get('date'),time:f.get('time')})));
}
function peIngredientFields(row=['bread',1,'count']){return `<div class="pe-ingredient">${peSelect('ingredient',pe('ingredients'),Object.entries(PlanningCore.ingredients).map(([id,i])=>[id,i[state.lang]]),row[0])}${peInput('quantity',pe('quantity'),row[1]??'','number',`min="0" step="any" ${row[2]==='taste'?'disabled':'required'}`)}${peSelect('unit',pe('unit'),['g','kg','ml','l','tsp','count','taste'].map(u=>[u,['tsp','count','taste'].includes(u)?pt(u):u]),row[2])}${peButton('ingredient-remove','×',`aria-label="${pe('removeIngredient')}"`,'pe-icon-button')}</div>`;}
function peItemForm(kind,containerId,id){
 if(id){const owner=PlanningCore.findItemOwner(planningStore.data,id);kind=owner.kind;containerId=owner.id;}
 const container=PlanningCore.itemContainer(planningStore.data,kind,containerId),item=container.items.find(i=>i.id===id),r=item?.recipeId||'tomato',type=item?.kind||'dish';
 peOpen(pe('item'),`${peSelect('kind',pe('kind'),['dish','personal','note'].map(k=>[k,pe(k)]),type)}<div data-item-panel="dish">${peSelect('recipe',pe('recipe'),Object.entries(PlanningCore.catalog).map(([key,r])=>[key,r[state.lang]+(r.status==='planningExample'?' · '+pt('example'):'')]),r)}<div class="pe-fields">${peInput('servings',pe('servings'),item?.servings|| (kind==='event'?container.guests:2),'number','min="0.01" max="10000" step="any" required')}${peSelect('language',pe('language'),[['en','English'],['de','Deutsch']],item?.language||state.lang)}</div>${kind==='event'?peCheck('follow',pe('follow'),item?!!item.followsGuests:true):''}${peSelect('sauce',pe('sauce'),Object.keys(PlanningCore.catalog[r].variants).map(k=>[k,pt(k)]),item?.options?.sauce||Object.keys(PlanningCore.catalog[r].variants)[0])}</div><div data-item-panel="name">${peInput('name',pe('name'),item?pl(item.name):'','text','required')}</div><div data-item-panel="personal"><h3>${pe('ingredients')}</h3><div id="pe-ingredients">${(item?.ingredients||[]).map(peIngredientFields).join('')}</div>${peButton('ingredient-add',pe('addIngredient'))}</div>${kind==='event'?peInput('group',pe('group'),pl(item?.group))+peCheck('contribution',pe('contribution'),!!item?.contribution):''}`,f=>{
  const type=f.get('kind'),values={kind:type};if(kind==='event'){values.group=f.get('group').trim();values.contribution=f.has('contribution');}
  if(type==='dish')Object.assign(values,{recipeId:f.get('recipe'),language:f.get('language'),servings:kind==='event'&&f.has('follow')?container.guests:Number(f.get('servings')),followsGuests:kind==='event'&&f.has('follow'),options:{sauce:f.get('sauce')}});
  else{values.name=f.get('name').trim();if(!values.name)throw Error('name');if(type==='personal')values.ingredients=[...document.querySelectorAll('.pe-ingredient')].map(row=>[row.querySelector('[name="ingredient"]').value,row.querySelector('[name="unit"]').value==='taste'?null:Number(row.querySelector('[name="quantity"]').value),row.querySelector('[name="unit"]').value]);}
  peApply(d=>PlanningCore.savePlannedItem(d,kind,containerId,id||null,values));
 });peSyncItemForm();
}
function peSyncItemForm(recipeChanged=false){
 const form=document.querySelector('#pe-form');if(!form?.elements.kind)return;const type=form.elements.kind.value;
 for(const panel of form.querySelectorAll('[data-item-panel]')){const show=panel.dataset.itemPanel===type||panel.dataset.itemPanel==='name'&&type!=='dish';panel.hidden=!show;for(const control of panel.querySelectorAll('input,select'))control.disabled=!show;}
 if(type==='dish'){if(recipeChanged){const r=PlanningCore.catalog[form.elements.recipe.value];form.elements.sauce.innerHTML=Object.keys(r.variants).map(k=>`<option value="${k}">${pt(k)}</option>`).join('');}form.elements.servings.disabled=!!form.elements.follow?.checked;}
 for(const row of form.querySelectorAll('.pe-ingredient'))row.querySelector('[name="quantity"]').disabled=type!=='personal'||row.querySelector('[name="unit"]').value==='taste';
}
function peTransfer(kind,id,copy){
 const plans=planningStore.data.plans,targets=kind==='meal'?plans.map(p=>[p.id,pl(p.name)]):[...plans.flatMap(p=>p.meals.map(m=>['meal:'+m.id,pl(p.name)+' · '+m.date+' · '+(pl(m.name)||pe('meal'))])),...planningStore.data.events.map(e=>['event:'+e.id,pl(e.name)+' · '+e.date])];
 if(!targets.length)return;
 const sourcePlan=kind==='meal'?plans.find(p=>p.meals.some(m=>m.id===id)):null,source=sourcePlan?.meals.find(m=>m.id===id);
 peOpen(pe(copy?'copy':'move'),`${peSelect('target',pe('destination'),targets,sourcePlan?.id||targets[0][0])}${kind==='meal'?peInput('date',pe('date'),source.date,'date','required'):''}${peInput('position',pe('position'),1,'number','min="1" step="1" required')}`,f=>{const target=f.get('target');peApply(d=>kind==='meal'?PlanningCore.transferMeal(d,id,target,f.get('date'),copy,Number(f.get('position'))-1):PlanningCore.transferItem(d,id,...target.split(':'),copy,Number(f.get('position'))-1));});
}
function bindPlanningEditorEvents(){
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-pe]');if(!button||!planningRoute())return;
  const {pe:action,kind,id,container}=button.dataset;
  if(action==='menu'){peOpenActions(button);return;}
  if(action==='cancel'){document.querySelector('#planning-dialog').close();return;}
  if(action==='filter'){peFilter[kind]=button.dataset.filter;renderPlanning();document.querySelector(`[data-pe="filter"][data-kind="${kind}"][data-filter="${peFilter[kind]}"]`)?.focus();return;}
  if(action==='recipe'){location.hash='#plan/recipe/'+id;return;}
  if(['invalid','conflict'].includes(planningStore.mode)){document.querySelector('#announcement').textContent=pe('changed');return;}
  if(action==='quick-servings'||action==='quick-sauce')peQuickItem(id,action==='quick-servings'?'servings':'sauce');
  if(action==='jump'){
   const plan=planningStore.data.plans.find(p=>p.id===id);
   peOpen(pe('date'),peInput('date',pe('date'),PlanningCore.dateShift(plan.start,planningOffset),'date',`required min="${plan.start}" max="${plan.end}"`),f=>{
    const date=f.get('date');if(date<plan.start||date>plan.end)throw Error('date');
    planningOffset=Math.floor((Date.parse(date)-Date.parse(plan.start))/86400000);
    document.querySelector('#planning-dialog').close();renderPlanning();planningFocusHeading();
   });
  }
  if(action==='owner'||action==='again')peOwnerForm(kind,id,action==='again');
  if(action==='meal')peMealForm(button.dataset.plan,id,button.dataset.date);
  if(action==='item')peItemForm(kind,container,id);
  if(action==='transfer')peTransfer(kind,id,button.dataset.copy==='true');
  if(action==='ingredient-add'){document.querySelector('#pe-ingredients').insertAdjacentHTML('beforeend',peIngredientFields());document.querySelector('#pe-ingredients').lastElementChild.querySelector('select').focus();}
  if(action==='ingredient-remove'){button.closest('.pe-ingredient').remove();document.querySelector('[data-pe="ingredient-add"]').focus();}
  if(action==='undo'&&peUndo?.after===JSON.stringify(planningStore.data)){const undo=peUndo;const ok=planningStore.change(d=>{for(const key of Object.keys(d))delete d[key];Object.assign(d,PlanningCore.clone(undo.before));});if(ok){peUndo=null;clearShoppingTransient();if(location.hash!==undo.route)location.hash=undo.route;else renderPlanning();planningFocusHeading();}else renderPlanning();}
  if(action==='delete'){
   const links=kind==='event'?planningStore.data.plans.filter(p=>p.eventIds.includes(id)):[];
   pePending=null;peApply(d=>PlanningCore.deletePlanningEntity(d,kind,id),{warning:pe('deleteBody')+(kind==='plan'?' '+pe('planDelete'):'')+(links.length?' '+pe('eventLinks')+' '+links.map(p=>peEsc(pl(p.name))).join(', '):''),route:kind==='event'?'#plan/events':kind==='plan'?'#plan':null});
  }
  if(action==='link'){
   const available=planningStore.data.events.filter(e=>!planningStore.data.plans.find(p=>p.id===id).eventIds.includes(e.id));
   peOpen(pe('link'),available.length?peSelect('event',pt('event'),available.map(e=>[e.id,pl(e.name)+' · '+e.date]),available[0].id):`<p>${pe('noTargets')}</p>`,f=>{if(f.get('event'))peApply(d=>PlanningCore.linkEvent(d,id,f.get('event')));});
  }
  if(action==='unlink'){pePending=null;peApply(d=>PlanningCore.linkEvent(d,button.dataset.plan,id,false));}
  if(action==='task'){const e=planningStore.data.events.find(e=>e.id===button.dataset.event),t=e.tasks.find(t=>t.id===id);peOpen(pe('task'),peInput('name',pe('name'),pl(t?.name),'text','required')+peSelect('group',pe('taskGroup'),['earlier','day','serving'].map(g=>[g,pt(g)]),t?.group||button.dataset.group),f=>{if(!f.get('name').trim())throw Error('name');peApply(d=>PlanningCore.saveTask(d,e.id,id||null,{name:f.get('name').trim(),group:f.get('group')}));});}
  if(action==='template-save')peOpen(pe('saveTemplate'),peInput('name',pe('name'),'','text','required'),f=>{if(!f.get('name').trim())throw Error('name');peApply(d=>PlanningCore.saveTemplate(d,kind,id,f.get('name').trim()));});
  if(action==='template-use'){const list=planningStore.data.templates.filter(t=>t.kind===(kind==='event'?'menu':'meal'));peOpen(pe('useTemplate'),`<p>${list.length?pe('templateNote'):pe('none')}</p>`+(list.length?peSelect('template',pe('template'),list.map(t=>[t.id,pl(t.name)]),list[0].id):''),f=>{if(f.get('template'))peApply(d=>PlanningCore.applyTemplate(d,f.get('template'),kind,id));});}
 });
 document.addEventListener('submit',event=>{if(event.target.id!=='pe-form')return;event.preventDefault();if(!pePending)return;try{pePending.submit(new FormData(event.target));}catch{peError(pe('invalid'));}});
 document.addEventListener('change',event=>{
 if(event.target.closest('#pe-form')){
  peSyncItemForm(event.target.name==='recipe');
  const form=document.querySelector('#pe-form');
  if(event.target.name==='follow'&&!form.elements.kind)form.elements.servings.disabled=event.target.checked;
 }
});
 document.querySelector('#planning-dialog').addEventListener('click',event=>{const modal=event.currentTarget;if(event.target!==modal||!modal.classList.contains('pe-actions-dialog'))return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();});
 document.querySelector('#planning-dialog').addEventListener('close',()=>{pePending=null;document.querySelector('#planning-dialog').classList.remove('pe-actions-dialog');if(peReturn?.matches('.pe-menu-trigger'))peReturn.setAttribute('aria-expanded','false');if(peReturn?.isConnected)peReturn.focus();else if(planningRoute())planningFocusHeading();peReturn=null;});
}
