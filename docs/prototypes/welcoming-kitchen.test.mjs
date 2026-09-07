import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Check the prototype's declarative copy and verification gate without a DOM.
const source=fs.readFileSync(new URL('./welcoming-kitchen.js',import.meta.url),'utf8');
new vm.Script(source);
const context=vm.createContext({});
vm.runInContext(source.slice(0,source.indexOf('const categoryIds=')),context);
const read=expression=>JSON.parse(vm.runInContext(`JSON.stringify(${expression})`,context));
assert.deepEqual(read('Object.keys(strings.en).sort()'),read('Object.keys(strings.de).sort()'));
for(const creatorCooked of [false,true]){
  for(const imageCompared of [false,true]){
    const keys=read(`verificationKeys(${JSON.stringify({creatorCooked,imageCompared})})`);
    assert.equal(keys[0],creatorCooked?'cookedLabel':'notConfirmed');
    assert.equal(keys[1],creatorCooked&&imageCompared?'verifiedLabel':'imagePending');
  }
}
assert.deepEqual(read('verificationKeys(recipeVerification)'),['cookedLabel','imagePending']);
assert.equal(read('recipeVerification.dishSlug'),'lentil-bolognese');
assert.equal(read('recipeVerification.version'),'basic');
assert.ok(source.includes('modal.showModal()'));
assert.ok(!source.includes('<span class="photo-credit">'));
console.log('PASS: EN/DE parity, all four verification states, scoped sample status, native disclosure dialog and clickable photo credits.');

const networkSource=fs.readFileSync(new URL('./welcoming-network.js',import.meta.url),'utf8');
new vm.Script(networkSource);
vm.runInContext(networkSource,context);
assert.deepEqual(read('Object.keys(networkStrings.en).sort()'),read('Object.keys(networkStrings.de).sort()'));
assert.equal(read('kitchenNetwork.nodes.length'),11);
assert.equal(read('new Set(kitchenNetwork.nodes.map(n=>n.id)).size'),11);
assert.equal(read('kitchenNetwork.nodes.filter(n=>n.kind==="dish").length'),10);
assert.deepEqual(read('connectedNodes("pasta")'),['tomato','pesto','cream']);
assert.deepEqual(read('connectedNodes("tomato")'),['pasta','lentils','tomatoVeg','creamyTomato']);
assert.deepEqual(read('connectedNodes("lentils")'),['tomato']);
assert.deepEqual(read('connectedNodes("creamyTomato")'),['tomato','cream']);
assert.deepEqual(read('branchChildren("tomato").map(n=>n.id)'),['lentils','tomatoVeg']);
// Relationships work in both directions and allow shared nodes/cycles, no parent or unlock flags.
assert.deepEqual(read('connectedNodes("pasta",{edges:[...kitchenNetwork.edges,{from:"lentils",to:"pasta"}]})'),['tomato','pesto','cream','lentils']);
assert.equal(read('selectedNetworkNode("#explore/tomato").id'),'tomato');
assert.equal(vm.runInContext('selectedNetworkNode("#explore/missing")',context),undefined);
assert.equal(vm.runInContext('selectedNetworkNode("#explore")',context),undefined);
for(const node of read('kitchenNetwork.nodes')){
  if(node.image){assert.ok(fs.existsSync(new URL(`./kitchen-assets/${node.image}.png`,import.meta.url)));assert.ok(read(`networkStrings.de.${node.id}Alt`));}
  if(node.status==='pending'){assert.ok(!node.image);assert.ok(!node.components);}
  assert.ok(read(`networkStrings.en.${node.id}Title`));
  assert.ok(read(`networkStrings.de.${node.id}Title`));
  assert.ok(!('unlocked' in node));
}
for(const edge of read('kitchenNetwork.edges')){
  assert.ok(read(`networkNode("${edge.from}")`));assert.ok(read(`networkNode("${edge.to}")`));
}
assert.equal(read('networkStrings.en.guideSteps.length'),4);
assert.equal(read('networkStrings.de.guideSteps.length'),4);
assert.equal(read('kitchenNetwork.nodes.filter(n=>n.status==="pending").length'),8);
assert.equal(read('kitchenNetwork.nodes.filter(n=>n.image).length'),3);
for(const [hash,previous,expected] of [
  ['#explore/branch/pesto','tomato','pesto'],['#explore/creamPeas','tomato','cream'],
  ['#explore/creamyTomato','cream','cream'],['#explore/creamyTomato','pesto','tomato'],
  ['#explore/branch/invalid','cream','tomato'],['#explore/missing','cream','tomato'],
])assert.equal(read(`branchForNetwork(${JSON.stringify(hash)},${JSON.stringify(previous)})`),expected);
vm.runInContext('const state={lang:"en"};const t=key=>strings[state.lang][key];const location={hash:"#explore"};',context);
for(const lang of ['en','de']){
  vm.runInContext(`state.lang="${lang}"`,context);
  for(const node of read('kitchenNetwork.nodes')){
    const markup=read(`networkDetail(networkNode("${node.id}"))`);
    assert.ok(!markup.includes('undefined'));
    assert.equal(markup.includes('network-recipe-action'),['lentils','tomato'].includes(node.id));
    if(['lentils','tomato'].includes(node.id)){
      assert.ok(markup.includes(`href="${node.recipeHref}"`));
      assert.ok(markup.includes(read('networkStrings[state.lang].openRecipe')));
      assert.ok(markup.indexOf('network-recipe-action')<markup.indexOf('network-detail-intro'));
    }
    if(node.status==='pending'){
      assert.ok(markup.includes(read('networkStrings[state.lang].pendingBody')));
      assert.ok(!markup.includes('<img'));
      assert.ok(!markup.includes('network-components'));
      assert.ok(!markup.includes('network-method'));
    }
  }
}
console.log('PASS: 11 graph nodes, 8 empty placeholders, three images, branch/deep-link resolution, shared connections, EN/DE details without invented recipes.');

const tomatoSource=fs.readFileSync(new URL('./welcoming-tomato.js',import.meta.url),'utf8');
new vm.Script(tomatoSource);
vm.runInContext(tomatoSource,context);
vm.runInContext('const escapeHTML=value=>String(value);',context);
assert.deepEqual(read('Object.keys(tomatoStrings.en).sort()'),read('Object.keys(tomatoStrings.de).sort()'));
for(const lang of ['en','de']){
  vm.runInContext(`state.lang="${lang}"`,context);
  for(const sauce of ['jar','tomatoes']){
    const recipe=read(`resolveTomatoRecipe("${lang}","${sauce}")`);
    assert.equal(recipe.steps.length,4);
    assert.equal(recipe.sauceIngredients.length,sauce==='jar'?1:2);
    const hero=read(`tomatoHero(resolveTomatoRecipe("${lang}","${sauce}"))`);
    assert.equal((hero.match(/class="tomato-fact"/g)||[]).length,2);
    assert.equal((hero.match(/<h1>/g)||[]).length,1);
    assert.ok(hero.includes(recipe.duration));
    assert.ok(hero.includes(read('tomatoStrings[state.lang].estimatedTime')));
    assert.ok(!hero.includes('eyebrow'));
    assert.ok(!hero.includes(read('tomatoStrings[state.lang].intro')));
    assert.equal((hero.match(/data-action="tomato-photo"/g)||[]).length,3);
    assert.equal((hero.match(/class="tomato-fact-icon"/g)||[]).length,2);
    assert.equal((hero.match(/focusable="false"/g)||[]).length,2);
    assert.equal((hero.match(/tomato-image-credit/g)||[]).length,3);
    assert.ok(!hero.includes('tomato-story-credit'));
    assert.ok(!hero.includes(read('tomatoStrings[state.lang].storyNote')));
    assert.ok(hero.includes('class="tomato-overview"'));
    for(const [title] of recipe.steps)assert.ok(hero.includes(`<li>${title}</li>`));
    for(const photo of read(`tomatoStoryImages("${sauce}")`)){
      assert.ok(fs.existsSync(new URL(`./kitchen-assets/${photo.file}`,import.meta.url)));
      assert.ok(read(`tomatoStrings.${lang}.${photo.alt}`));
    }
    const markup=read(`tomatoIngredients(resolveTomatoRecipe("${lang}","${sauce}"),true)`);
    assert.ok(!markup.includes('undefined'));
    assert.ok(markup.includes(recipe.water[0]));
    assert.ok(markup.includes(recipe.water[1]));
    const equipment=read('tomatoEquipment()');
    assert.ok(equipment.includes('<h2 id="tomato-equipment-title">'));
    assert.equal((equipment.match(/<li>/g)||[]).length,4);
    for(const item of read('tomatoStrings[state.lang].equipmentItems'))assert.ok(equipment.includes(item));
    assert.equal((markup.match(/data-action="tomato-change"/g)||[]).length,1);
    assert.ok(markup.includes(read('tomatoStrings[state.lang].changeLabel')));
    const cookMarkup=read(`tomatoIngredients(resolveTomatoRecipe("${lang}","${sauce}"))`);
    assert.ok(!cookMarkup.includes('tomato-change'));
    assert.ok(!cookMarkup.includes('tomato-editor'));
  }
}
assert.throws(()=>vm.runInContext('resolveTomatoRecipe("en","invalid")',context));
assert.throws(()=>vm.runInContext('resolveTomatoRecipe("fr","jar")',context));
vm.runInContext('tomatoState.attempt=createTomatoAttempt("jar");tomatoState.sauce="tomatoes";tomatoState.pending="tomatoes";',context);
assert.equal(read('tomatoState.attempt.recipes.en.sauce'),'jar');
assert.equal(read('tomatoState.attempt.recipes.de.sauce'),'jar');
assert.equal(read('tomatoState.sauce'),'tomatoes');
vm.runInContext('tomatoState.attempt.recipes.en.steps[0][0]="attempt-only";',context);
assert.notEqual(read('resolveTomatoRecipe("en","jar").steps[0][0]'),'attempt-only');
for(const hash of ['#recipe/tomato','#cook/tomato','#complete/tomato'])assert.equal(read(`tomatoRoute("${hash}")`),true);
for(const hash of ['#recipe','#recipe/unknown','#cook','#explore/tomato'])assert.equal(read(`tomatoRoute("${hash}")`),false);
assert.ok(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\s*[.(]/.test(tomatoSource));
assert.equal(read('networkNode("tomato").recipeHref'),'#recipe/tomato');
assert.ok(!tomatoSource.includes('class="recipe-context"'));
assert.ok(!tomatoSource.includes("tt('draft')"));
assert.ok(!source.includes("tt('draft')"));
assert.ok(!tomatoSource.includes("tt('equipmentBody')"));
assert.notEqual(read('tomatoStoryImages("jar")[0].file'),read('tomatoStoryImages("tomatoes")[0].file'));
assert.deepEqual(read('tomatoStoryImages("jar").map(p=>p.phase)'),['before','during','final']);
assert.throws(()=>vm.runInContext('tomatoStoryImages("invalid")',context));
console.log('PASS: tomato EN/DE parity, both coherent sauce variants, single Change action, read-only cooking ingredients, isolated attempt copies, strict routes and zero personal writes.');
