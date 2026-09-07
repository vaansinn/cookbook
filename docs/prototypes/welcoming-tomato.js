'use strict';
// Standalone prototype only: no account, API, storage or production recipe writes.
const tomatoStrings = {
  en: {
    title:'Pasta with tomato sauce', intro:'A familiar bowl of pasta. Let a jar do some of the work, or make the sauce yourself.',
    change:'Change', changeLabel:'Change tomato sauce', choose:'How would you like to make it?',
    jar:'Ready-made', tomatoes:'Tomatoes & herbs', component:'Tomato sauce', apply:'Use this sauce', cancel:'Cancel',
    jarImpact:'Warm a ready-made sauce. No chopping or sauce-making step.',
    tomatoesImpact:'Replaces the jar with two ingredients. Simmer the sauce first, then cook the pasta. Same equipment; allow about 10–15 minutes more.',
    jarTime:'About 20–25 min', tomatoesTime:'About 30–40 min', pasta:'Dry spaghetti', jarIngredient:'Tomato sauce (jar)',
    servingsLabel:'Servings', estimatedTime:'Estimated time', jarDuration:'20–25 min', tomatoesDuration:'30–40 min',
    overviewLabel:'Recipe at a glance', storyLabel:'From ingredients to dinner', before:'Ingredients', during:'Ready to combine', final:'The finished dish', viewPhoto:'Enlarge image:',
    storyNote:'AI illustrations · use the written recipe for quantities and doneness.',
    jarBeforeAlt:'Dry spaghetti, a jar of tomato sauce and a small bowl of salt, before cooking.',
    tomatoesBeforeAlt:'Dry spaghetti, tinned chopped tomatoes, dried herbs and salt, before cooking.',
    duringAlt:'Drained cooked spaghetti in a pot beside tomato sauce in a separate saucepan, ready to combine.',
    finalAlt:'Illustration of spaghetti coated in tomato sauce in a cream bowl with a blue rim.',
    tomatoesIngredient:'Tinned chopped tomatoes', herbs:'Dried Italian herbs', salt:'Salt', toTaste:'to taste', tsp:'tsp',
    equipment:'Equipment', equipmentItems:['Pot','Small saucepan','Colander','Spoon'], waterIngredient:'Water', forBoiling:'for boiling', imageLabel:'AI image',
    updated:'Ingredients, time estimate and method updated. Equipment unchanged.',
    imageNote:'AI illustrations of ingredients, preparation and the dish idea; not checked against a cooked recipe version. They are not quantity or doneness guides.',
    previewOnly:'Prototype only. Refreshing resets this recipe choice and cooking preview.',
    jarSteps:[
      ['Cook the pasta','Bring a pot of water to the boil. Add salt and the spaghetti. Stir, then cook for the time on the packet.'],
      ['Taste, then drain','Let a strand cool a little and taste it. When it is tender enough for you, carefully drain through a colander and return the pasta to the pot, off the heat.'],
      ['Warm the sauce','Put the jarred sauce in the saucepan. Warm it following the jar’s hob instructions, stirring as directed.'],
      ['Bring it together','Pour the hot sauce over the pasta. Stir to coat, taste and serve.']
    ],
    tomatoesSteps:[
      ['Make the sauce','Put the tomatoes and herbs in the saucepan. Heat until small bubbles appear, then lower the heat. Simmer gently for about 12–15 minutes, stirring now and then, until slightly thickened. Turn off the heat.'],
      ['Cook the pasta','Bring a pot of water to the boil. Add salt and the spaghetti. Stir, then cook for the time on the packet. Let a strand cool a little and taste for tenderness.'],
      ['Drain and combine','Carefully drain the pasta through a colander and return it to the pot. Add the tomato sauce and stir to coat.'],
      ['Warm and taste','Stir over a low heat until hot throughout. Taste a cooled spoonful, add salt if needed and serve.']
    ]
  },
  de: {
    title:'Pasta mit Tomatensauce', intro:'Ein vertrauter Teller Pasta. Lass dir vom Glas etwas Arbeit abnehmen oder bereite die Sauce selbst zu.',
    change:'Ändern', changeLabel:'Tomatensauce ändern', choose:'Wie möchtest du sie zubereiten?',
    jar:'Fertige Sauce', tomatoes:'Tomaten & Kräuter', component:'Tomatensauce', apply:'Diese Sauce verwenden', cancel:'Abbrechen',
    jarImpact:'Eine fertige Sauce erwärmen. Kein Schneiden und kein eigener Schritt zum Saucenkochen.',
    tomatoesImpact:'Zwei Zutaten ersetzen das Glas. Erst die Sauce köcheln lassen, dann die Pasta kochen. Gleiches Kochgeschirr; etwa 10–15 Minuten zusätzlich einplanen.',
    jarTime:'Etwa 20–25 Min.', tomatoesTime:'Etwa 30–40 Min.', pasta:'Spaghetti, trocken', jarIngredient:'Tomatensauce (Glas)',
    servingsLabel:'Portionen', estimatedTime:'Geschätzte Zeit', jarDuration:'20–25 Min.', tomatoesDuration:'30–40 Min.',
    overviewLabel:'Rezept auf einen Blick', storyLabel:'Von den Zutaten zum Essen', before:'Zutaten', during:'Bereit zum Vermengen', final:'Das fertige Gericht', viewPhoto:'Bild vergrößern:',
    storyNote:'KI-Illustrationen · Mengen und Garpunkte stehen in der Anleitung.',
    jarBeforeAlt:'Trockene Spaghetti, ein Glas Tomatensauce und eine kleine Schale Salz vor dem Kochen.',
    tomatoesBeforeAlt:'Trockene Spaghetti, gehackte Dosentomaten, getrocknete Kräuter und Salz vor dem Kochen.',
    duringAlt:'Abgegossene Spaghetti im Topf neben Tomatensauce in einem separaten Saucentopf, bereit zum Vermengen.',
    finalAlt:'Illustration von Spaghetti mit Tomatensauce in einer cremefarbenen Schale mit blauem Rand.',
    tomatoesIngredient:'Gehackte Dosentomaten', herbs:'Getrocknete italienische Kräuter', salt:'Salz', toTaste:'nach Geschmack', tsp:'TL',
    equipment:'Kochgeschirr', equipmentItems:['Topf','Kleiner Saucentopf','Sieb','Löffel'], waterIngredient:'Wasser', forBoiling:'zum Kochen', imageLabel:'KI-Bild',
    updated:'Zutaten, Zeitschätzung und Zubereitung aktualisiert. Kochgeschirr unverändert.',
    imageNote:'KI-Illustrationen von Zutaten, Vorbereitung und Gerichtidee; noch nicht mit einer gekochten Rezeptversion abgeglichen. Keine Mengen- oder Garpunkt-Anleitung.',
    previewOnly:'Nur ein Prototyp. Beim Neuladen werden Rezeptauswahl und Kochvorschau zurückgesetzt.',
    jarSteps:[
      ['Pasta kochen','Wasser in einem Topf zum Kochen bringen. Salz und Spaghetti zugeben. Umrühren und nach der Zeitangabe auf der Packung kochen.'],
      ['Probieren und abgießen','Eine Nudel kurz abkühlen lassen und probieren. Ist sie für dich weich genug, vorsichtig durch ein Sieb abgießen. Die Pasta zurück in den Topf geben und vom Herd nehmen.'],
      ['Sauce erwärmen','Die fertige Sauce in den kleinen Saucentopf geben. Nach der Herdanleitung auf dem Glas erwärmen und wie angegeben umrühren.'],
      ['Vermengen','Die heiße Sauce über die Pasta geben. Gut vermengen, probieren und servieren.']
    ],
    tomatoesSteps:[
      ['Sauce zubereiten','Tomaten und Kräuter in den Saucentopf geben. Erhitzen, bis kleine Blasen erscheinen, dann die Hitze reduzieren. Etwa 12–15 Minuten sanft köcheln lassen und gelegentlich umrühren, bis die Sauce etwas dicker ist. Herd ausschalten.'],
      ['Pasta kochen','Wasser in einem Topf zum Kochen bringen. Salz und Spaghetti zugeben. Umrühren und nach der Zeitangabe auf der Packung kochen. Eine Nudel kurz abkühlen lassen und den Garpunkt probieren.'],
      ['Abgießen und vermengen','Pasta vorsichtig durch ein Sieb abgießen und zurück in den Topf geben. Tomatensauce zugeben und gut vermengen.'],
      ['Erwärmen und abschmecken','Bei niedriger Hitze unter Rühren vollständig erhitzen. Einen Löffel etwas abkühlen lassen und probieren. Bei Bedarf salzen und servieren.']
    ]
  }
};
const tomatoState={sauce:'jar',pending:'jar',editor:false,attempt:null};
const tomatoRoute=(hash=location.hash)=>['#recipe/tomato','#cook/tomato','#complete/tomato'].includes(hash);
const tt=key=>tomatoStrings[state.lang][key];
function resolveTomatoRecipe(lang,sauce){
  if(!['en','de'].includes(lang)||!['jar','tomatoes'].includes(sauce))throw new Error('Unsupported tomato recipe choice');
  const copy=tomatoStrings[lang];
  return {
    sauce,title:copy.title,label:copy[sauce],time:copy[sauce+'Time'],duration:copy[sauce+'Duration'],servings:2,
    sauceIngredients:sauce==='jar'?[[copy.jarIngredient,'350 g']]:[[copy.tomatoesIngredient,'400 g'],[copy.herbs,'1 '+copy.tsp]],
    pasta:[copy.pasta,'200 g'],salt:[copy.salt,copy.toTaste],water:[copy.waterIngredient,copy.forBoiling],
    steps:copy[sauce+'Steps'].map(step=>[...step])
  };
}
function createTomatoAttempt(sauce){
  // Copy both languages once; later recipe choices cannot rewrite this cook.
  return {step:0,recipes:{en:resolveTomatoRecipe('en',sauce),de:resolveTomatoRecipe('de',sauce)}};
}
function tomatoIngredientRows(rows){return rows.map(([name,amount])=>`<li><span>${escapeHTML(name)}</span><span class="tomato-amount">${escapeHTML(amount)}</span></li>`).join('');}
function tomatoEditorMarkup(){
  const pending=resolveTomatoRecipe(state.lang,tomatoState.pending);
  return `<div class="tomato-editor" id="tomato-editor" ${tomatoState.editor?'':'hidden'}><fieldset><legend>${tt('choose')}</legend>${['jar','tomatoes'].map(value=>`<label><input type="radio" name="tomato-sauce" value="${value}" ${tomatoState.pending===value?'checked':''}>${tt(value)}</label>`).join('')}</fieldset><div class="tomato-breakout"><strong>${tt('component')}</strong><ul>${tomatoIngredientRows(pending.sauceIngredients)}</ul></div><p class="small">${tt(tomatoState.pending+'Impact')}</p><div class="row"><button class="button" type="button" data-action="tomato-apply">${tt('apply')}</button><button class="button secondary" type="button" data-action="tomato-cancel">${tt('cancel')}</button></div></div>`;
}
function tomatoIngredients(recipe,editable=false){
  return `<div class="tomato-ingredients ${editable?'tomato-editable':''}"><ul class="tomato-fixed">${tomatoIngredientRows([recipe.pasta])}</ul><div class="tomato-component"><div class="tomato-component-row"><ul>${tomatoIngredientRows(recipe.sauceIngredients)}</ul>${editable?`<button type="button" class="text-link tomato-change" data-action="tomato-change" aria-label="${tt('changeLabel')}" aria-controls="tomato-editor" aria-expanded="${tomatoState.editor}">${tt('change')}</button>`:''}</div>${editable?tomatoEditorMarkup():''}</div><ul class="tomato-fixed">${tomatoIngredientRows([recipe.salt,recipe.water])}</ul></div>`;
}
function tomatoEquipment(){
  return `<section class="tomato-equipment" aria-labelledby="tomato-equipment-title"><h2 id="tomato-equipment-title">${tt('equipment')}</h2><ul>${tt('equipmentItems').map(item=>`<li>${escapeHTML(item)}</li>`).join('')}</ul></section>`;
}
function tomatoFactIcon(kind){
  const shape=kind==='servings'?'<circle cx="12" cy="12" r="6"/><path d="M3 3v5c0 2 3 2 3 0V3M4.5 3v18M21 21V3c-2 2-2 7 0 8"/>':'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>';
  return `<svg class="tomato-fact-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
}
function tomatoStoryImages(sauce){
  if(!['jar','tomatoes'].includes(sauce))throw new Error('Unsupported story variant');
  return [
    {phase:'before',file:`tomato-story-${sauce}-before.png`,alt:sauce+'BeforeAlt'},
    {phase:'during',file:'tomato-story-during.png',alt:'duringAlt'},
    {phase:'final',file:'network-tomato.png',alt:'finalAlt'}
  ];
}
function tomatoHero(recipe){
  return `<section class="tomato-hero"><div class="tomato-heading"><h1>${escapeHTML(recipe.title)}</h1><ol class="tomato-overview" aria-label="${tt('overviewLabel')}">${recipe.steps.map(([title])=>`<li>${escapeHTML(title)}</li>`).join('')}</ol></div><dl class="tomato-facts"><div class="tomato-fact"><dt>${tomatoFactIcon('servings')}${tt('servingsLabel')}</dt><dd>${recipe.servings}</dd></div><div class="tomato-fact"><dt>${tomatoFactIcon('time')}${tt('estimatedTime')}</dt><dd>${escapeHTML(recipe.duration)}</dd></div></dl><div class="tomato-story-wrap"><ol class="tomato-story" aria-label="${tt('storyLabel')}">${tomatoStoryImages(recipe.sauce).map(({phase,file,alt})=>`<li><div class="tomato-story-frame"><button type="button" class="tomato-story-photo" data-action="tomato-photo" data-phase="${phase}" aria-label="${tt('viewPhoto')} ${tt(phase)}"><img src="kitchen-assets/${file}" width="1254" height="1254" alt="${tt(alt)}" decoding="async"></button>${aiLink(`<span>${tt('imageLabel')}</span>`,'tomato-image-credit')}</div><p class="tomato-story-caption">${tt(phase)}</p></li>`).join('')}</ol></div></section>`;
}
function renderTomatoRecipe(){
  const recipe=resolveTomatoRecipe(state.lang,tomatoState.sauce);
  app.innerHTML=`<main id="content" class="tomato-page"><div class="shell"><a class="back" href="#explore/tomato">← ${networkText('back')}</a>${tomatoHero(recipe)}</div><div class="recipe-bar"><div class="shell"><div class="tabs" aria-label="${t('overview')}"><button type="button" id="tab-ingredients" data-section="ingredients">${t('ingredients')}</button><button type="button" id="tab-method" data-section="method">${t('steps')}</button></div><button class="button" type="button" data-action="tomato-start">${t('start')} →</button></div></div><div class="shell recipe-body"><section id="panel-ingredients" class="recipe-panel ingredients-panel"><h2>${t('ingredients')}</h2><div id="tomato-ingredient-host">${tomatoIngredients(recipe,true)}</div>${tomatoEquipment()}</section><section id="panel-method" class="recipe-panel"><h2>${t('steps')}</h2><ol class="method-list">${recipe.steps.map(([title,body])=>`<li><div><h3>${title}</h3><p>${body}</p></div></li>`).join('')}</ol></section></div><div class="shell">${footer()}</div></main>`;
  applyTabs();
}
function renderTomatoCook(){
  if(!tomatoState.attempt)tomatoState.attempt=createTomatoAttempt(tomatoState.sauce);
  const attempt=tomatoState.attempt,recipe=attempt.recipes[state.lang],i=attempt.step;
  app.innerHTML=`<div class="cook-head"><div class="shell"><a href="#recipe/tomato" class="button quiet">← ${t('overview')}</a><div><span class="cook-heading">${recipe.title}</span><span class="small">${recipe.label}</span></div><button class="button secondary cook-mobile-ingredients" type="button" data-action="tomato-ingredients">${t('ingredients')}</button></div></div><main id="content" class="shell cook-layout tomato-page"><aside class="cook-sidebar"><div class="section-title"><h2>${t('ingredients')}</h2><span class="small">2 ${t('servings')}</span></div>${tomatoIngredients(recipe)}</aside><section class="cook-step"><div class="step-progress" aria-hidden="true">${recipe.steps.map((_,n)=>`<span class="${n<=i?'done':''}"></span>`).join('')}</div><p class="eyebrow">${t('step')} ${i+1} ${t('of')} ${recipe.steps.length} · ${recipe.label}</p><h1>${recipe.steps[i][0]}</h1><p class="instruction">${recipe.steps[i][1]}</p><p class="small">${tt('previewOnly')}</p></section></main><footer class="cook-actions"><div class="shell"><button class="button secondary" type="button" data-action="tomato-previous" ${i===0?'disabled':''}>${t('previous')}</button><button class="button" type="button" data-action="tomato-next">${t(i===recipe.steps.length-1?'finish':'next')}</button></div></footer>`;
}
function renderTomatoComplete(){app.innerHTML=`<main id="content" class="shell"><section class="complete"><p class="eyebrow">${t('welcome')}</p><h1>${t('doneTitle')}</h1><p>${t('doneBody')}</p><a class="button" href="#recipe/tomato">${t('again')} →</a></section></main>`;}
function closeTomatoEditor(){
  tomatoState.editor=false;tomatoState.pending=tomatoState.sauce;
  document.querySelector('#tomato-editor').hidden=true;
  const trigger=document.querySelector('[data-action="tomato-change"]');
  trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});
}
function bindTomatoEvents(){
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(!tomatoRoute()||!action?.startsWith('tomato-'))return;
    if(action==='tomato-photo'){
      const phase=event.target.closest('[data-phase]')?.dataset.phase;
      const photo=tomatoStoryImages(tomatoState.sauce).find(item=>item.phase===phase);if(!photo)return;
      document.querySelector('#dialog-title').textContent=tt(phase);document.querySelector('#close-dialog').textContent=t('close');
      document.querySelector('#dialog-content').innerHTML=`<img class="tomato-story-large" src="kitchen-assets/${photo.file}" width="1254" height="1254" alt="${tt(photo.alt)}"><p class="small">${tt('storyNote')}</p>`;
      dialog.showModal();
    }
    if(action==='tomato-change'){
      if(tomatoState.editor){closeTomatoEditor();return;}
      tomatoState.editor=true;tomatoState.pending=tomatoState.sauce;
      document.querySelector('#tomato-ingredient-host').innerHTML=tomatoIngredients(resolveTomatoRecipe(state.lang,tomatoState.sauce),true);
      document.querySelector('input[name="tomato-sauce"]:checked').focus({preventScroll:true});
    }
    if(action==='tomato-cancel')closeTomatoEditor();
    if(action==='tomato-apply'){
      tomatoState.sauce=tomatoState.pending;tomatoState.editor=false;
      const scroll=window.scrollY;renderTomatoRecipe();
      document.querySelector('[data-action="tomato-change"]').focus({preventScroll:true});window.scrollTo(0,scroll);announce(tt('updated'));
    }
    if(action==='tomato-start'){
      tomatoState.editor=false;tomatoState.pending=tomatoState.sauce;
      tomatoState.attempt=createTomatoAttempt(tomatoState.sauce);location.hash='cook/tomato';
    }
    if(action==='tomato-ingredients'){
      document.querySelector('#dialog-title').textContent=t('ingredients');document.querySelector('#close-dialog').textContent=t('close');
      document.querySelector('#dialog-content').innerHTML=`<p class="small">2 ${t('servings')}</p>${tomatoIngredients(tomatoState.attempt.recipes[state.lang])}`;dialog.showModal();
    }
    if(action==='tomato-previous'||action==='tomato-next'){
      const attempt=tomatoState.attempt;if(!attempt)return;
      if(action==='tomato-next'&&attempt.step===attempt.recipes[state.lang].steps.length-1){tomatoState.attempt=null;location.hash='complete/tomato';}
      else{attempt.step=Math.max(0,attempt.step+(action==='tomato-next'?1:-1));render(true);}
    }
  });
  document.addEventListener('change',event=>{
    if(!event.target.matches('input[name="tomato-sauce"]'))return;
    if(!['jar','tomatoes'].includes(event.target.value))return;
    tomatoState.pending=event.target.value;
    document.querySelector('#tomato-editor').outerHTML=tomatoEditorMarkup();
    document.querySelector('input[name="tomato-sauce"]:checked').focus({preventScroll:true});
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.closest('#tomato-editor')){event.preventDefault();closeTomatoEditor();}});
  window.addEventListener('hashchange',()=>{
    tomatoState.editor=false;tomatoState.pending=tomatoState.sauce;
    if(tomatoRoute()){
      state.section='ingredients';state.sectionScroll={ingredients:0,method:0};
      state.timerEnd=null;state.timerStarted=false;state.timerRemaining=720;
    }
  });
}
