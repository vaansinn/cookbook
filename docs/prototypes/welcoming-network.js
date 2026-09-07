'use strict';
// Discovery is a graph, independent of recipe versions, access and cook state.
// Missing recipes are empty, selectable placeholders, never locked content.
const kitchenNetwork = {
  nodes: [
    {id:'pasta',kind:'guide',image:'network-pasta',components:['pasta'],branches:[],status:'guide'},
    {id:'tomato',kind:'dish',image:'network-tomato',components:['pasta','tomato'],branches:['tomato'],status:'recipeDraft',recipeHref:'#recipe/tomato'},
    {id:'lentils',kind:'dish',image:'network-lentils',components:['pasta','tomato','lentils'],branches:['tomato'],status:'recipeDraft',recipeHref:'#recipe'},
    {id:'tomatoVeg',kind:'dish',branches:['tomato'],status:'pending'},
    {id:'pesto',kind:'dish',branches:['pesto'],status:'pending'},
    {id:'pestoPeas',kind:'dish',branches:['pesto'],status:'pending'},
    {id:'pestoVeg',kind:'dish',branches:['pesto'],status:'pending'},
    {id:'cream',kind:'dish',branches:['cream'],status:'pending'},
    {id:'creamMushrooms',kind:'dish',branches:['cream'],status:'pending'},
    {id:'creamPeas',kind:'dish',branches:['cream'],status:'pending'},
    {id:'creamyTomato',kind:'dish',branches:['tomato','cream'],status:'pending'},
  ],
  edges: [
    {from:'pasta',to:'tomato',label:'addTomato'},
    {from:'pasta',to:'pesto',label:'addPesto'},
    {from:'pasta',to:'cream',label:'addCream'},
    {from:'tomato',to:'lentils',label:'addLentils'},
    {from:'tomato',to:'tomatoVeg',label:'addVeg'},
    {from:'pesto',to:'pestoPeas',label:'addPeas'},
    {from:'pesto',to:'pestoVeg',label:'addVeg'},
    {from:'cream',to:'creamMushrooms',label:'addMushrooms'},
    {from:'cream',to:'creamPeas',label:'addPeas'},
    {from:'tomato',to:'creamyTomato',label:'addCream',shared:true},
    {from:'cream',to:'creamyTomato',label:'addTomato',shared:true},
  ],
};
const networkBranches=['tomato','pesto','cream'];
const networkStrings = {
  en:{
    nav:'Explore',eyebrow:'Good things start with something simple',title:'See where pasta takes you.',
    intro:'One familiar ingredient. A few connected ideas. Start wherever you like.',
    mapLabel:'Connected pasta ideas',base:'Starting with',baseName:'Pasta',count:'1 guide · 10 dish ideas',
    overview:'Overview only',recipeDraft:'Recipe draft',pending:'No recipe yet',
    pendingBody:'This space is ready for a recipe. Ingredients, instructions and an image haven’t been added yet.',
    tomatoBranch:'Tomato',pestoBranch:'Pesto',creamBranch:'Cream',branchLabel:'Sauce directions',
    tomatoVegTitle:'Tomato pasta with roasted vegetables',pestoTitle:'Pesto pasta',pestoPeasTitle:'Pesto pasta with peas',pestoVegTitle:'Pesto pasta with roasted vegetables',creamTitle:'Cream sauce pasta',creamMushroomsTitle:'Cream pasta with mushrooms',creamPeasTitle:'Cream pasta with peas',creamyTomatoTitle:'Creamy tomato pasta',
    lentilsShort:'With lentils',tomatoVegShort:'With roasted vegetables',pestoPeasShort:'With peas',pestoVegShort:'With roasted vegetables',creamMushroomsShort:'With mushrooms',creamPeasShort:'With peas',
    addPesto:'Add pesto',addCream:'Add cream',addVeg:'Add roasted vegetables',addPeas:'Add peas',addMushrooms:'Add mushrooms',
    shared:'Connects tomato & cream',alsoIn:'Also connected to',
    guide:'The basics',dish:'A dish to make',openGuide:'How to cook pasta',openDish:'Explore this dish',
    pastaTitle:'Just pasta',tomatoTitle:'Pasta with tomato sauce',lentilsTitle:'Pasta with tomato sauce & lentils',
    pastaDesc:'A useful little skill, with or without a sauce.',tomatoDesc:'The same pasta, with a simple tomato sauce.',lentilsDesc:'Keep the pasta and tomato sauce. Add lentils.',
    pastaAlt:'AI illustration of plain cooked spaghetti in a blue-rimmed bowl',tomatoAlt:'AI illustration of spaghetti coated in tomato sauce in a blue-rimmed bowl',lentilsAlt:'AI illustration of spaghetti with tomato sauce and lentils in a blue-rimmed bowl',
    addTomato:'Add tomato sauce',addLentils:'Add lentils',connections:'Connected ideas',back:'Back to connections',
    selectHint:'Select an idea to take a closer look.',mapNote:'Blank spaces are recipes to add, not recipes to unlock.',
    guideIntro:'You can learn this on its own. No sauce or full meal needed.',
    needTitle:'What you need',need:'Dry pasta, water and salt. A pot with room for the pasta, a spoon and a colander.',
    guideSteps:[
      ['Bring the water to a boil','Use the amount of water suggested on your pasta packet, leaving room in the pot so it won’t overflow. Add salt.'],
      ['Add the pasta and stir','Keep the water boiling and stir so the strands separate. Use the packet’s cooking time as your starting point.'],
      ['Try a piece','Near the end of that time, lift out a piece with a spoon. Let it cool before tasting. Still too firm for you? Cook a little longer and check again.'],
      ['Drain the pasta','Turn off the heat. Set the colander securely in the sink, then carefully pour in the pasta and water, keeping clear of the hot steam.'],
    ],
    components:'What makes this dish',pastaComponent:'Pasta',tomatoComponent:'Tomato sauce',lentilsComponent:'Lentils',
    tomatoOverview:'A simple meal built on cooking pasta. Choose a ready-made sauce or tomatoes and herbs inside the recipe. The ingredients and method change together.',
    lentilsOverview:'The same pasta-and-tomato base, with lentils added. How you prepare each component will be a choice inside the recipe.',
    nextRound:'Recipe steps and component choices are the next design round.',
    tomatoRecipeNote:'Tomato pasta · try changing the sauce',tomatoReady:'Open the recipe to choose your sauce. Both versions are unverified recipe proposals.',
    openRecipe:'Open recipe',recipeNote:'Existing lentil recipe draft',imageStatus:'These three AI illustrations show the connected ideas, not verified recipe versions. They have not yet been compared with the creator’s finished dishes.',
  },
  de:{
    nav:'Entdecken',eyebrow:'Etwas Einfaches ist ein guter Anfang',title:'Was aus Pasta werden kann.',
    intro:'Eine vertraute Zutat. Ein paar verbundene Ideen. Fang an, wo du möchtest.',
    mapLabel:'Verbundene Pasta-Ideen',base:'Ausgangspunkt',baseName:'Pasta',count:'1 Anleitung · 10 Gerichtideen',
    overview:'Nur eine Übersicht',recipeDraft:'Rezeptentwurf',pending:'Noch kein Rezept',
    pendingBody:'Hier ist Platz für ein Rezept. Zutaten, Anleitung und Bild wurden noch nicht ergänzt.',
    tomatoBranch:'Tomate',pestoBranch:'Pesto',creamBranch:'Sahne',branchLabel:'Sauce auswählen',
    tomatoVegTitle:'Tomatenpasta mit Ofengemüse',pestoTitle:'Pasta mit Pesto',pestoPeasTitle:'Pestopasta mit Erbsen',pestoVegTitle:'Pestopasta mit Ofengemüse',creamTitle:'Pasta mit Sahnesauce',creamMushroomsTitle:'Sahnepasta mit Pilzen',creamPeasTitle:'Sahnepasta mit Erbsen',creamyTomatoTitle:'Pasta mit Tomaten-Sahne-Sauce',
    lentilsShort:'Mit Linsen',tomatoVegShort:'Mit Ofengemüse',pestoPeasShort:'Mit Erbsen',pestoVegShort:'Mit Ofengemüse',creamMushroomsShort:'Mit Pilzen',creamPeasShort:'Mit Erbsen',
    addPesto:'Pesto dazu',addCream:'Sahne dazu',addVeg:'Ofengemüse dazu',addPeas:'Erbsen dazu',addMushrooms:'Pilze dazu',
    shared:'Verbindet Tomate & Sahne',alsoIn:'Auch verbunden mit',
    guide:'Die Grundlagen',dish:'Ein Gericht zum Kochen',openGuide:'So kochst du Pasta',openDish:'Gericht entdecken',
    pastaTitle:'Einfach Pasta',tomatoTitle:'Pasta mit Tomatensauce',lentilsTitle:'Pasta mit Tomatensauce & Linsen',
    pastaDesc:'Ein hilfreicher Handgriff. Mit oder ohne Sauce.',tomatoDesc:'Dieselbe Pasta, mit einer einfachen Tomatensauce.',lentilsDesc:'Pasta und Tomatensauce bleiben. Linsen kommen dazu.',
    pastaAlt:'KI-Illustration von gekochten Spaghetti ohne Sauce in einer Schale mit blauem Rand',tomatoAlt:'KI-Illustration von Spaghetti mit Tomatensauce in einer Schale mit blauem Rand',lentilsAlt:'KI-Illustration von Spaghetti mit Tomatensauce und Linsen in einer Schale mit blauem Rand',
    addTomato:'Tomatensauce dazu',addLentils:'Linsen dazu',connections:'Verbundene Ideen',back:'Zurück zu den Verbindungen',
    selectHint:'Wähle eine Idee und schau genauer hin.',mapNote:'Leere Plätze sind für neue Rezepte, nicht zum Freischalten.',
    guideIntro:'Das kannst du auch für sich lernen. Ohne Sauce oder ganzes Gericht.',
    needTitle:'Das brauchst du',need:'Trockene Pasta, Wasser und Salz. Einen Topf mit Platz für die Pasta, einen Löffel und ein Sieb.',
    guideSteps:[
      ['Wasser zum Kochen bringen','Nimm die auf der Pastapackung empfohlene Wassermenge. Lass oben im Topf Platz, damit nichts überläuft. Gib Salz dazu.'],
      ['Pasta hineingeben und umrühren','Halte das Wasser am Kochen und rühre um, damit sich die Nudeln voneinander lösen. Orientiere dich zunächst an der Kochzeit auf der Packung.'],
      ['Ein Stück probieren','Hole gegen Ende dieser Zeit ein Stück mit einem Löffel heraus. Lass es vor dem Probieren abkühlen. Noch zu fest für dich? Koche etwas weiter und prüfe erneut.'],
      ['Pasta abgießen','Schalte den Herd aus. Stelle das Sieb sicher ins Spülbecken und gieße Pasta und Wasser vorsichtig hinein. Halte Abstand zum heißen Dampf.'],
    ],
    components:'Daraus besteht das Gericht',pastaComponent:'Pasta',tomatoComponent:'Tomatensauce',lentilsComponent:'Linsen',
    tomatoOverview:'Ein einfaches Gericht auf der Grundlage von gekochter Pasta. Wähle im Rezept eine fertige Sauce oder Tomaten und Kräuter. Zutaten und Zubereitung ändern sich gemeinsam.',
    lentilsOverview:'Dieselbe Grundlage aus Pasta und Tomatensauce, ergänzt um Linsen. Wie du die einzelnen Bestandteile zubereitest, wählst du später im Rezept.',
    nextRound:'Rezeptschritte und die Auswahl der Bestandteile folgen in der nächsten Designrunde.',
    tomatoRecipeNote:'Tomatenpasta · Sauce austauschen',tomatoReady:'Öffne das Rezept und wähle deine Sauce. Beide Varianten sind ungeprüfte Rezeptvorschläge.',
    openRecipe:'Rezept öffnen',recipeNote:'Bestehender Linsen-Rezeptentwurf',imageStatus:'Diese drei KI-Illustrationen zeigen die verbundenen Ideen, keine geprüften Rezeptversionen. Sie wurden noch nicht mit den fertig gekochten Gerichten des Erstellers abgeglichen.',
  },
};
const networkText=key=>networkStrings[state.lang][key];
function networkNode(id){return kitchenNetwork.nodes.find(node=>node.id===id);}
function connectedNodes(id,graph=kitchenNetwork){
  return [...new Set(graph.edges.flatMap(edge=>edge.from===id?[edge.to]:edge.to===id?[edge.from]:[]))];
}
function selectedNetworkNode(hash=location.hash){return networkNode(hash.split('/')[1]);}
function branchForNetwork(hash=location.hash,previous='tomato'){
  const parts=hash.split('/');
  if(parts[1]==='branch')return networkBranches.includes(parts[2])?parts[2]:'tomato';
  const branches=selectedNetworkNode(hash)?.branches||[];
  return branches.includes(previous)?previous:branches[0]||'tomato';
}
function branchChildren(id){return kitchenNetwork.edges.filter(edge=>edge.from===id&&!edge.shared).map(edge=>networkNode(edge.to));}
function networkPhoto(node){return node.image?`<img src="kitchen-assets/${node.image}.png" width="1254" height="1254" alt="${networkText(node.id+'Alt')}" decoding="async">`:'<span class="network-image-blank" aria-hidden="true"></span>';}
function networkCard(node,short=false){
  const selected=selectedNetworkNode()?.id===node.id;
  return `<article class="network-node" data-network-node="${node.id}"><a class="network-card ${node.status==='pending'?'network-placeholder':''}" href="#explore/${node.id}" aria-label="${networkText(node.id==='pasta'?'openGuide':node.id+'Title')} · ${networkText(node.status)}" ${selected?'aria-current="location"':''}><div class="network-photo">${networkPhoto(node)}</div><div class="network-card-copy"><h2>${networkText(short?node.id+'Short':node.id==='pasta'?'openGuide':node.id+'Title')}</h2><span class="network-status">${networkText(node.status)}</span></div></a></article>`;
}
function networkDetail(node){
  const body=node.status==='pending'?`<p class="network-detail-intro network-empty">${networkText('pendingBody')}</p>`:node.kind==='guide'?`<p class="network-detail-intro">${networkText('guideIntro')}</p><section class="network-kit"><h3>${networkText('needTitle')}</h3><p>${networkText('need')}</p></section><ol class="network-method">${networkText('guideSteps').map(([title,body])=>`<li><h3>${title}</h3><p>${body}</p></li>`).join('')}</ol>`:
    `<p class="network-detail-intro">${networkText(node.id+'Overview')}</p><h3>${networkText('components')}</h3><ul class="network-components">${node.components.map(id=>`<li>${networkText(id+'Component')}</li>`).join('')}</ul><p class="small">${networkText(node.id==='tomato'?'tomatoReady':'nextRound')}</p>`;
  const recipeAction=node.recipeHref?`<div class="network-recipe-action"><a class="button" href="${node.recipeHref}">${networkText('openRecipe')} <span aria-hidden="true">→</span></a><span class="small">${networkText(node.id==='tomato'?'tomatoRecipeNote':'recipeNote')}</span></div>`:'';
  return `<section class="network-detail" id="network-detail" aria-labelledby="network-detail-title"><div class="network-detail-top"><p class="eyebrow">${networkText(node.status)}</p><a class="text-link" href="#explore/branch/${activeNetworkBranch}">↑ ${networkText('back')}</a></div><div class="network-detail-heading"><div class="network-photo">${networkPhoto(node)}</div><h2 id="network-detail-title" tabindex="-1">${networkText(node.kind==='guide'?'openGuide':node.id+'Title')}</h2></div>${recipeAction}${body}<div class="network-related"><h3>${networkText('connections')}</h3><div class="row">${connectedNodes(node.id).map(id=>`<a class="button secondary" href="#explore/${id}">${networkText(id+'Title')} →</a>`).join('')}</div></div></section>`;
}
let activeNetworkBranch='tomato';
function renderNetwork(){
  const selected=selectedNetworkNode();
  activeNetworkBranch=branchForNetwork(location.hash,activeNetworkBranch);
  app.innerHTML=`<main id="content" class="shell network-page"><section class="network-intro"><div><p class="eyebrow">${networkText('eyebrow')}</p><h1>${networkText('title')}</h1></div><p>${networkText('count')}</p></section><div class="network-branch-picker" role="group" aria-label="${networkText('branchLabel')}">${networkBranches.map(id=>`<a href="#explore/branch/${id}" data-network-branch="${id}" aria-current="${activeNetworkBranch===id}">${networkText(id+'Branch')}</a>`).join('')}</div><section class="network-map" data-branch="${activeNetworkBranch}" aria-label="${networkText('mapLabel')}"><svg class="network-lines" aria-hidden="true" focusable="false"></svg><div class="network-root">${networkCard(networkNode('pasta'))}</div><div class="network-branches">${networkBranches.map(id=>`<section class="network-branch" data-branch="${id}" aria-label="${networkText(id+'Branch')}">${networkCard(networkNode(id))}<div class="network-variations">${branchChildren(id).map(node=>networkCard(node,true)).join('')}</div></section>`).join('')}</div><div class="network-shared"><p>${networkText('shared')}</p>${networkCard(networkNode('creamyTomato'))}<div class="network-shared-links">${networkBranches.filter(id=>id!=='pesto').map(id=>`<a class="text-link" href="#explore/branch/${id}">${networkText(id+'Branch')} ↗</a>`).join('')}</div></div><ul class="sr-only">${kitchenNetwork.edges.map(edge=>`<li>${networkText(edge.from+'Title')} — ${networkText(edge.label)} — ${networkText(edge.to+'Title')}</li>`).join('')}</ul></section><div class="network-caption"><p>${networkText('mapNote')}</p>${aiLink(t('ai'))}</div>${selected?networkDetail(selected):`<p class="network-select-hint">${networkText('selectHint')}</p>`}${footer()}</main>`;
  observeNetwork();
}
// Measure actual card positions, so connectors survive translation and reflow.
function drawNetwork(){
  const map=document.querySelector('.network-map');if(!map)return;
  const bounds=map.getBoundingClientRect();
  const paths=[];
  const selected=selectedNetworkNode()?.id;
  const rect=id=>{const el=map.querySelector(`[data-network-node="${id}"]`);if(!el?.getClientRects().length)return null;const r=el.getBoundingClientRect();return {left:r.left-bounds.left,right:r.right-bounds.left,top:r.top-bounds.top,bottom:r.bottom-bounds.top,cx:r.left-bounds.left+r.width/2,cy:r.top-bounds.top+r.height/2};};
  for(const edge of kitchenNetwork.edges){
    const a=rect(edge.from),b=rect(edge.to);if(!a||!b)continue;
    let d;
    if(edge.from==='pasta'){const y=a.bottom+20;d=`M${a.cx},${a.bottom} V${y} H${b.cx} V${b.top}`;}
    else if(edge.shared){const right=edge.from==='cream',x=right?bounds.width-6:6;d=`M${right?a.right:a.left},${a.cy} H${x} V${b.cy} H${right?b.right:b.left}`;}
    else{const x=a.left+12;d=`M${x},${a.bottom} V${b.cy} H${b.left}`;}
    paths.push(`<path data-edge="${edge.from}:${edge.to}" class="${edge.shared?'shared-edge':''} ${selected&&(edge.from===selected||edge.to===selected)?'related-edge':''}" d="${d}"/>`);
  }
  const svg=map.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);svg.innerHTML=paths.join('');
  const active=document.activeElement;
  if(active?.closest('.network-page')&&!active.getClientRects().length){const heading=document.querySelector('.network-intro h1');heading.setAttribute('tabindex','-1');heading.focus();}
}
let networkObserver;
function observeNetwork(){
  networkObserver?.disconnect();
  networkObserver=new ResizeObserver(drawNetwork);
  document.querySelectorAll('.network-map,.network-node').forEach(el=>networkObserver.observe(el));
  drawNetwork();
}
