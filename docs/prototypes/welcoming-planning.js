'use strict';
// Increment 1: reviewable views and local persistence, not production planning.
const planningStrings={
  en:{nav:'Plan',plans:'Meal plans',events:'Events',shopping:'Shopping preview',shop:'View shopping',days:'days',meals:'meals',event:'event',guests:'guests',servings:'servings',
    emptyDay:'Leave a little room.',emptyDayBody:'Nothing planned. That’s fine, too.',free:'Open day',openEvent:'Open menu',menu:'Menu',prep:'Preparation',earlier:'Earlier',day:'On the day',serving:'Before serving',
    personal:'Personal item',contribution:'Brought by someone else',example:'Planning example',exampleNote:'Sample quantities for exploring the planner. No cooking instructions or verified recipe yet.',
    drafts:'Recipe drafts',ideas:'A different dinner, same starting point',ideasBody:'Two lentil ideas to explore in the next planning round.',preview:'Preview',recipe:'View recipe draft',
    jar:'Jarred sauce',tomatoes:'Tomatoes & herbs',local:'Drafts stay in this browser, not in your account.',dismiss:'Got it',rename:'Edit title',title:'Title',save:'Save title',cancel:'Cancel',close:'Close',
    reset:'Reset demo',resetTitle:'Reset the planning demo?',resetBody:'This replaces only this browser’s planning draft with the sample plan. Recipes, cooking attempts and account data are untouched.',
    confirmReset:'Restore sample plan',recovery:'Download saved draft',reload:'Reload draft',invalid:'This saved draft cannot be read. It has not been overwritten. Download a copy before resetting.',
    conflict:'This draft changed in another tab. Reload it before making more changes.',unavailable:'Changes are only in memory: browser storage is unavailable.',
    cupboard:'Cupboard',produce:'Fruit & vegetables',bakery:'Bakery',count:'items',tsp:'tsp',taste:'to taste',sources:'Needed for',scope:'Shopping for',
    shoppingNote:'A read-only preview from the sample dishes. Shopping controls and pack sizes come in later increments.',
    emptyPlans:'No meal plans yet',emptyPlansBody:'This is where your days and meals will come together.',emptyEvents:'No events yet',emptyEventsBody:'A dinner with friends or a meal for a special occasion.',
    emptyShopping:'Nothing to shop for',emptyShoppingBody:'This selection has no ingredients to buy.',missing:'This draft is not here',back:'Back to meal plans',linked:'Also in',
    draftInfo:'About this draft',draftBody:'Increment 1 of 7: review the layout and navigation. Edit titles, try preparation checkboxes and refresh to check local saving. Meal editing, pack sizes and connected suggestions follow after this review.',
    ai:'AI image',aiNote:'Existing AI illustrations show the dish idea, not a verified result.',prev:'Previous days',next:'Next days',showing:'Showing',of:'of',taskNote:'Personal reminders, not an automatically generated cooking schedule.'},
  de:{nav:'Planen',plans:'Essenspläne',events:'Anlässe',shopping:'Einkaufsvorschau',shop:'Einkauf ansehen',days:'Tage',meals:'Mahlzeiten',event:'Anlass',guests:'Gäste',servings:'Portionen',
    emptyDay:'Ein bisschen Platz lassen.',emptyDayBody:'Nichts geplant. Das ist auch okay.',free:'Freier Tag',openEvent:'Menü öffnen',menu:'Menü',prep:'Vorbereitung',earlier:'Im Voraus',day:'Am Tag selbst',serving:'Vor dem Servieren',
    personal:'Eigener Eintrag',contribution:'Wird mitgebracht',example:'Planungsbeispiel',exampleNote:'Beispielmengen zum Ausprobieren der Planung. Noch keine Kochanleitung oder geprüftes Rezept.',
    drafts:'Rezeptentwürfe',ideas:'Ein anderes Essen, die gleiche Basis',ideasBody:'Zwei Linsenideen für die nächste Planungsrunde.',preview:'Vorschau',recipe:'Rezeptentwurf ansehen',
    jar:'Fertige Sauce',tomatoes:'Tomaten & Kräuter',local:'Entwürfe bleiben in diesem Browser, nicht in deinem Konto.',dismiss:'Verstanden',rename:'Titel bearbeiten',title:'Titel',save:'Titel speichern',cancel:'Abbrechen',close:'Schließen',
    reset:'Demo zurücksetzen',resetTitle:'Planungsdemo zurücksetzen?',resetBody:'Nur der Planungsentwurf in diesem Browser wird durch den Beispielplan ersetzt. Rezepte, Kochversuche und Kontodaten bleiben unverändert.',
    confirmReset:'Beispielplan wiederherstellen',recovery:'Gespeicherten Entwurf herunterladen',reload:'Entwurf neu laden',invalid:'Dieser gespeicherte Entwurf ist nicht lesbar und wurde nicht überschrieben. Lade vor dem Zurücksetzen eine Kopie herunter.',
    conflict:'Dieser Entwurf wurde in einem anderen Tab geändert. Lade ihn vor weiteren Änderungen neu.',unavailable:'Änderungen bleiben nur im Arbeitsspeicher: Der Browserspeicher ist nicht verfügbar.',
    cupboard:'Vorratsschrank',produce:'Obst & Gemüse',bakery:'Bäckerei',count:'Stück',tsp:'TL',taste:'nach Geschmack',sources:'Benötigt für',scope:'Einkauf für',
    shoppingNote:'Eine schreibgeschützte Vorschau der Beispielgerichte. Einkaufsfunktionen und Packungsgrößen folgen später.',
    emptyPlans:'Noch keine Essenspläne',emptyPlansBody:'Hier finden deine Tage und Mahlzeiten zusammen.',emptyEvents:'Noch keine Anlässe',emptyEventsBody:'Ein Abend mit Freunden oder ein Essen zu einem besonderen Anlass.',
    emptyShopping:'Nichts einzukaufen',emptyShoppingBody:'Für diese Auswahl sind keine Zutaten einzukaufen.',missing:'Dieser Entwurf ist nicht vorhanden',back:'Zurück zu den Essensplänen',linked:'Auch in',
    draftInfo:'Über diesen Entwurf',draftBody:'Schritt 1 von 7: Layout und Navigation prüfen. Titel bearbeiten, Vorbereitungen abhaken und durch Neuladen das lokale Speichern testen. Mahlzeiten bearbeiten, Packungsgrößen und verknüpfte Vorschläge folgen nach dieser Rückmeldung.',
    ai:'KI-Bild',aiNote:'Die vorhandenen KI-Bilder zeigen die Gerichtidee, kein überprüftes Ergebnis.',prev:'Vorherige Tage',next:'Nächste Tage',showing:'Angezeigt',of:'von',taskNote:'Eigene Erinnerungen, kein automatisch erstellter Kochzeitplan.'}
};
const pt=key=>planningStrings[state.lang][key];
const pl=value=>PlanningCore.label(value,state.lang);
let planningStore=null;
let planningOffset=0;
const shoppingRoute=()=>location.hash.split('/')[0]==='#shopping'||location.hash.startsWith('#plan/shopping/');
const planningRoute=()=>location.hash.split('/')[0]==='#plan'||shoppingRoute();
function initPlanning(){
  if(planningStore)return;
  planningStore=PlanningCore.store({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
  if(planningStore.mode==='ready'&&planningStore.raw===null)planningStore.change(()=>{});
}
function planningIcon(kind){
  const shapes={calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',table:'<ellipse cx="12" cy="9" rx="9" ry="5"/><path d="M5 13v8m14-8v8m-7-7v5"/>',bag:'<path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',bowl:'<path d="M3 11h18c0 6-4 10-9 10S3 17 3 11Zm5-7v3m4-5v5m4-3v3"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'};
  if(kind==='chevron')shapes.chevron='<path d="m9 5 7 7-7 7"/>';
  return `<svg class="planning-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[kind]||shapes.bowl}</svg>`;
}
function planningDate(date,options={weekday:'short',day:'numeric',month:'short'}){return new Intl.DateTimeFormat(state.lang,{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}
function planningQuantity(amount,unit,ingredientId){
  if(amount===null)return pt('taste');
  const names=unit==='count'?PlanningCore.ingredients[ingredientId]?.countUnit?.[state.lang]:null;
  const suffix=names?names[amount>0&&amount<=1?0:1]:unit==='count'&&amount===1&&state.lang==='en'?'item':['tsp','count'].includes(unit)?pt(unit):unit;
  return new Intl.NumberFormat(state.lang,{maximumFractionDigits:2}).format(amount)+' '+suffix;
}
function planningAction(action,text,attrs='',classes='text-link'){return `<button type="button" class="${classes}" data-planning-action="${action}" ${attrs}>${text}</button>`;}
function planningEmpty(title,body){return `<section class="planning-empty"><h2>${pt(title)}</h2><p>${pt(body)}</p></section>`;}
function planningNotFound(){return `${planningEmpty('missing','emptyPlansBody')}<a class="text-link" href="#plan">← ${pt('back')}</a>`;}
function planningStatus(){
  const mode=planningStore.mode;
  if(mode!=='ready')return `<aside class="planning-notice" role="alert"><p>${pt(mode)}</p><div class="row">${mode==='conflict'?planningAction('reload',pt('reload')):''}${mode==='invalid'?planningAction('download',pt('recovery'))+planningAction('reset',pt('reset')):''}</div></aside>`;
  if(planningStore.data.preferences.noticeDismissed)return '';
  return `<aside class="planning-local"><span>${pt('local')}</span>${planningAction('dismiss',pt('dismiss'))}</aside>`;
}
function planningHeading(name,meta,kind,id,shopHref){
  const blocked=['invalid','conflict'].includes(planningStore.mode);
  return `<div class="planning-heading"><div><div class="planning-title"><h1>${escapeHTML(pl(name))}</h1>${planningAction('rename',planningIcon('edit'),`data-kind="${kind}" data-id="${id}" aria-label="${pt('rename')}" ${blocked?'disabled':''}`,'planning-edit')}</div><p>${meta}</p></div>${shopHref?`<a class="button" href="${shopHref}">${planningIcon('bag')}${pt('shop')}</a>`:''}</div>`;
}
function planningItem(item){
  if(item.kind==='note')return `<p class="planning-note">${escapeHTML(pl(item.name))}</p>`;
  const recipe=item.kind==='dish'?PlanningCore.catalog[item.recipeId]:null;
  const title=recipe?recipe[state.lang]:pl(item.name);
  const description=recipe?`${item.servings} ${pt('servings')} · ${pt(item.options.sauce==='example'?'example':item.options.sauce)}`:pt(item.contribution?'contribution':'personal');
  return `<article class="planning-dish">${recipe?.image?`<figure class="planning-thumb"><img src="kitchen-assets/${recipe.image}.png" width="80" height="80" alt="${escapeHTML(title)}" loading="lazy">${aiLink(pt('ai'),'planning-photo-credit')}</figure>`:`<span class="planning-thumb planning-placeholder">${planningIcon('bowl')}</span>`}<div>${recipe?`<button type="button" class="planning-dish-title" data-planning-action="dish" data-recipe="${item.recipeId}" data-item="${item.id}">${escapeHTML(title)}</button>`:`<h3>${escapeHTML(title)}</h3>`}<p>${escapeHTML(description)}</p></div></article>`;
}
function planningAgenda(plan){
  if(!plan)return planningStore.data.plans.length?planningNotFound():planningEmpty('emptyPlans','emptyPlansBody');
  const count=PlanningCore.dayCount(plan.start,plan.end);
  planningOffset=Math.max(0,Math.min(planningOffset,Math.max(0,count-3)));
  const visible=PlanningCore.days(plan.start,plan.end,planningOffset,3);
  const events=planningStore.data.events.filter(e=>plan.eventIds.includes(e.id)&&e.date>=plan.start&&e.date<=plan.end);
  const meta=`${planningDate(plan.start,{day:'numeric',month:'short'})} – ${planningDate(plan.end,{day:'numeric',month:'short',year:'numeric'})} · ${count} ${pt('days')}`;
  return `${planningHeading(plan.name,meta,'plan',plan.id,`#shopping/plan/${plan.id}`)}
    <div class="planning-range"><span>${plan.meals.length} ${pt('meals')} · ${events.length} ${pt('event')}</span>${count>3?`<div>${planningAction('prev','←',`aria-label="${pt('prev')}" ${planningOffset===0?'disabled':''}`,'planning-page-button')}<span>${planningOffset+1}–${Math.min(planningOffset+3,count)} / ${count}</span>${planningAction('next','→',`aria-label="${pt('next')}" ${planningOffset+3>=count?'disabled':''}`,'planning-page-button')}</div>`:''}</div>
    <div class="planning-days">${visible.map(date=>{
      const meals=plan.meals.filter(m=>m.date===date),linked=events.filter(e=>e.date===date);
      return `<section class="planning-day"><header><span>${planningDate(date,{weekday:'long'})}</span><strong>${planningDate(date,{day:'numeric',month:'short'})}</strong></header><div class="planning-day-content">${meals.map(meal=>`<section class="planning-meal"><h2>${escapeHTML(pl(meal.name))}${meal.time?` <span>${meal.time}</span>`:''}</h2>${meal.items.map(planningItem).join('')}</section>`).join('')}${linked.map(event=>`<a class="planning-event-link" href="#plan/event/${event.id}">${planningIcon('table')}<span class="planning-event-label">${pt('events')} · ${event.time}</span><h2>${escapeHTML(pl(event.name))}</h2><span>${event.guests} ${pt('guests')} · ${event.items.length} ${pt('count')}</span><strong>${pt('openEvent')} →</strong></a>`).join('')}${!meals.length&&!linked.length?`<div class="planning-free"><span class="planning-free-line" aria-hidden="true"></span><h2>${pt('emptyDay')}</h2><p>${pt('emptyDayBody')}</p></div>`:''}</div></section>`;
    }).join('')}</div><section class="planning-ideas"><div><h2>${pt('ideas')}</h2><p>${pt('ideasBody')}</p></div><div class="planning-idea-links">${['soup','salad'].map(id=>`<button type="button" data-planning-action="dish" data-recipe="${id}">${planningIcon('bowl')}<span><strong>${PlanningCore.catalog[id][state.lang]}</strong><small>${pt('example')}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div></section>`;
}
function planningEvents(){
  const events=planningStore.data.events;
  return `<div class="planning-heading"><h1>${pt('events')}</h1></div>${events.length?`<div class="planning-event-grid">${events.map(e=>`<a class="planning-event-card" href="#plan/event/${e.id}">${planningIcon('table')}<p>${planningDate(e.date)}</p><h2>${escapeHTML(pl(e.name))}</h2><span>${e.guests} ${pt('guests')} · ${e.time}</span><strong>${pt('openEvent')} →</strong></a>`).join('')}</div>`:planningEmpty('emptyEvents','emptyEventsBody')}`;
}
function planningEvent(event,preparation){
  if(!event)return planningNotFound();
  const links=planningStore.data.plans.filter(p=>p.eventIds.includes(event.id));
  return `${planningHeading(event.name,`${planningDate(event.date)} · ${event.time} · ${event.guests} ${pt('guests')}`,'event',event.id,`#shopping/event/${event.id}`)}<div class="planning-event-tabs"><a href="#plan/event/${event.id}" ${!preparation?'aria-current="page"':''}>${pt('menu')}</a><a href="#plan/event/${event.id}/prep" ${preparation?'aria-current="page"':''}>${pt('prep')}</a></div>
    ${preparation?`<p class="planning-caption">${pt('taskNote')}</p><div class="planning-tasks">${['earlier','day','serving'].map(group=>`<section><h2>${pt(group)}</h2>${event.tasks.filter(task=>task.group===group).map(task=>`<label><input type="checkbox" data-planning-task="${task.id}" data-event="${event.id}" ${task.done?'checked':''} ${['invalid','conflict'].includes(planningStore.mode)?'disabled':''}><span>${escapeHTML(pl(task.name))}</span></label>`).join('')}</section>`).join('')}</div>`:`<div class="planning-menu"><section class="planning-menu-main"><h2>${pt('menu')}</h2>${event.items.filter(i=>i.kind==='dish').map(planningItem).join('')}</section><section class="planning-menu-sides">${event.items.filter(i=>i.kind!=='dish').map(planningItem).join('')}</section></div>`}
    ${links.length?`<p class="planning-linked">${pt('linked')}: ${links.map(p=>`<a href="#plan/plans/${p.id}">${escapeHTML(pl(p.name))}</a>`).join(', ')}</p>`:''}`;
}
function planningShopping(kind,id){
  return renderShopping(kind,id);
}
function renderPlanning(){
  initPlanning();
  const parts=location.hash.split('/'),area=parts[1]||'plans',id=parts[2];
  let content;
  const editorContent=typeof renderPlanningEditorRoute==='function'&&!shoppingRoute()?renderPlanningEditorRoute(parts):null;
  if(shoppingRoute())content=renderShoppingDestination();
  else if(editorContent!==null)content=editorContent;
  else if(area==='plans'&&parts.length<=3)content=planningAgenda(id?planningStore.data.plans.find(p=>p.id===id):planningStore.data.plans[0]);
  else if(area==='events'&&!id)content=planningEvents();
  else if(area==='event'&&parts.length<=4&&(!parts[3]||parts[3]==='prep'))content=planningEvent(planningStore.data.events.find(e=>e.id===id),parts[3]==='prep');
  else if(area==='shopping'&&parts.length===4)content=planningShopping(id,parts[3]);
  else content=planningNotFound();
  const eventArea=['event','events'].includes(area)||area==='shopping'&&id==='event';
  app.innerHTML=`<main id="content" class="shell planning-page ${editorContent!==null?'pe-compact':''}">${shoppingRoute()?'':`<nav class="planning-nav" aria-label="${pt('nav')}"><a href="#plan" ${!eventArea?'aria-current="page"':''}>${planningIcon('calendar')}${pt('plans')}</a><a href="#plan/events" ${eventArea?'aria-current="page"':''}>${planningIcon('table')}${pt('events')}</a></nav>`}${planningStatus()}${content}<footer class="planning-foot"><details><summary>${pt('draftInfo')}</summary><p>${pt('draftBody')}</p></details>${planningAction('reset',pt('reset'))}</footer></main>`;
  if(typeof shoppingApplyMixed==='function'&&typeof document!=='undefined'&&document.querySelectorAll)shoppingApplyMixed();
  if(typeof peUndoMarkup==='function')app.querySelector('main').insertAdjacentHTML('beforeend',peUndoMarkup());
}
function planningModal(title,body){
  const modal=document.querySelector('#planning-dialog');
  document.querySelector('#planning-dialog-title').textContent=title;
  document.querySelector('#planning-close').textContent=pt('close');
  document.querySelector('#planning-dialog-body').innerHTML=body;
  modal.showModal();
}
function planningFindItem(id){return [...planningStore.data.plans.flatMap(p=>p.meals.flatMap(m=>m.items)),...planningStore.data.events.flatMap(e=>e.items)].find(i=>i.id===id);}
function planningFocusHeading(){const heading=document.querySelector('#content h1');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});}
function bindPlanningEvents(){
  document.querySelector('#planning-close').addEventListener('click',()=>document.querySelector('#planning-dialog').close());
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-planning-action]');if(!trigger||!planningRoute())return;
    const action=trigger.dataset.planningAction;
    if(action==='prev'||action==='next'){planningOffset+=action==='next'?3:-3;renderPlanning();const target=document.querySelector(`[data-planning-action="${action}"]:not(:disabled)`);if(target)target.focus();else planningFocusHeading();}
    if(action==='dismiss'){planningStore.change(d=>d.preferences.noticeDismissed=true);renderPlanning();planningFocusHeading();}
    if(action==='reload'){planningStore.reload();clearShoppingTransient();if(typeof clearPlanningEditorTransient==='function')clearPlanningEditorTransient();renderPlanning();planningFocusHeading();}
    if(action==='download'){
      const blob=new Blob([planningStore.raw||''],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='planning-draft-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    if(action==='reset')planningModal(pt('resetTitle'),`<p>${pt('resetBody')}</p><div class="row planning-modal-actions">${planningAction('confirm-reset',pt('confirmReset'),'','button')}${planningAction('cancel',pt('cancel'),'','button secondary')}</div>`);
    if(action==='cancel')document.querySelector('#planning-dialog').close();
    if(action==='confirm-reset'){if(planningStore.reset()){clearShoppingTransient();if(typeof clearPlanningEditorTransient==='function')clearPlanningEditorTransient();}planningOffset=0;document.querySelector('#planning-dialog').close();renderPlanning();planningFocusHeading();}
    if(action==='rename'){
      const {kind,id}=trigger.dataset,owner=(kind==='plan'?planningStore.data.plans:planningStore.data.events).find(o=>o.id===id);if(!owner)return;
      planningModal(pt('rename'),`<form id="planning-title-form" data-kind="${kind}" data-id="${id}"><label for="planning-title-input">${pt('title')}</label><input id="planning-title-input" name="title" maxlength="200" required value="${escapeHTML(pl(owner.name))}"><div class="row planning-modal-actions"><button class="button" type="submit">${pt('save')}</button>${planningAction('cancel',pt('cancel'),'','button secondary')}</div></form>`);
      document.querySelector('#planning-title-input').focus();
    }
    if(action==='dish'){
      const id=trigger.dataset.recipe,recipe=PlanningCore.catalog[id];if(!recipe)return;
      const item=planningFindItem(trigger.dataset.item)||{kind:'dish',recipeId:id,servings:2,options:{sauce:Object.keys(recipe.variants)[0]}};
      const rows=PlanningCore.itemRows(item);
      planningModal(recipe[state.lang],`<p class="planning-caption">${item.servings} ${pt('servings')} · ${pt(recipe.status==='planningExample'?'example':'drafts')}</p>${recipe.image?`<figure class="planning-detail-image"><img src="kitchen-assets/${recipe.image}.png" alt="${recipe[state.lang]}" width="240" height="240"><figcaption>${pt('ai')}</figcaption></figure>`:''}<ul class="planning-detail-ingredients">${rows.map(([i,q,u])=>`<li><span>${PlanningCore.ingredients[i][state.lang]}</span><strong>${planningQuantity(q,u,i)}</strong></li>`).join('')}</ul><p class="planning-caption">${pt(recipe.status==='planningExample'?'exampleNote':'aiNote')}</p>`);
    }
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='planning-title-form')return;event.preventDefault();
    const input=document.querySelector('#planning-title-input'),name=input.value.trim();if(!name){input.setCustomValidity(pt('title'));input.reportValidity();return;}input.setCustomValidity('');
    const {kind,id}=event.target.dataset;
    planningStore.change(data=>{(kind==='plan'?data.plans:data.events).find(o=>o.id===id).name=name;});
    document.querySelector('#planning-dialog').close();renderPlanning();document.querySelector('[data-planning-action="rename"]')?.focus();
  });
  document.addEventListener('input',event=>{if(event.target.id==='planning-title-input')event.target.setCustomValidity('');});
  document.addEventListener('change',event=>{
    const id=event.target.dataset.planningTask;if(!id)return;
    const checked=event.target.checked,eventId=event.target.dataset.event;
    planningStore.change(data=>data.events.find(e=>e.id===eventId).tasks.find(task=>task.id===id).done=checked);
    renderPlanning();document.querySelector(`[data-planning-task="${id}"]`)?.focus();
  });
  window.addEventListener('hashchange',()=>{document.querySelector('#planning-dialog').close();planningOffset=0;});
  window.addEventListener('storage',event=>{
    if(!planningStore||(event.key!==PlanningCore.KEY&&event.key!==null))return;
    planningStore.external(event.newValue);
    if(planningRoute()){document.querySelector('#planning-dialog').close();renderPlanning();}
  });
}
