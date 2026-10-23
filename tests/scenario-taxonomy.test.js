import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scenarioGroups,scenarioMetadata,scenarioFor,scenarioMembers} from '../web/beauty-play/scenario-taxonomy.js';
const read=name=>JSON.parse(readFileSync(new URL('../web/beauty-play/'+name,import.meta.url),'utf8'));
test('every current story has one primary group, concrete story identity and explicit artwork fit',()=>{
 const scenarios=read('scenarios.json');
 assert.deepEqual(Object.keys(scenarioMetadata).sort(),Object.keys(scenarios).sort());
 for(const [id,m] of Object.entries(scenarioMetadata)){assert(scenarioGroups.some(g=>g.id===m.groupId));assert(m.scenarioId&&m.artCueKo&&m.storyLinkKo&&m.artCueEn&&m.storyLinkEn);assert.equal(m.fictionalCondition,true);assert(scenarioMembers(m.groupId).includes(id));}
 assert.deepEqual(scenarioMembers('important_plans'),['mona','madame']);assert.equal(scenarioFor('missing'),null);assert.deepEqual(scenarioMembers('missing'),[]);
});
test('two school-life identities remain unpublished until confirmed artworks are bound and all choices reference real products',()=>{
 const drafts=read('character-drafts.json').profiles,products=[...read('product-data.json').products,...read('scenario-products.json')];
 assert.equal(drafts.length,2);
 for(const d of drafts){assert.equal(d.status,'draft_artwork_unassigned');assert.equal(d.artworkId,null);assert(scenarioGroups.some(g=>g.id===d.groupId));assert(d.title.ko.includes('\n'));for(const choice of d.choices){assert(choice.reply.ko&&choice.reply.en);for(const id of choice.productIds)assert(products.some(p=>p.id===id&&p.options.length));}}
});
