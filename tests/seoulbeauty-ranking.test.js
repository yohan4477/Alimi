import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRetailerRankings,imageEligible} from '../scripts/seoulbeauty-ranking.mjs';
const catalog=[{slug:'cosrx-snail-96-100ml',brand:'COSRX',name:'Advanced Snail 96 Mucin Power Essence',size:'100ml',ean:'8809416470009'}];
test('keeps external source ranks separate and matches existing catalog by EAN',()=>{
 const rows=mergeRetailerRankings([
 {source:'ulta_us',rank:3,observedOn:'2026-10-21',brand:'COSRX',name:'Snail 96',ean:'8809416470009'},
 {source:'oliveyoung_global',rank:5,observedOn:'2026-10-21',brand:'COSRX',name:'Snail 96',ean:'8809416470009'}
 ],catalog);
 assert.equal(rows.length,1);assert.equal(rows[0].catalogSlug,catalog[0].slug);
 assert.deepEqual(rows[0].sources.map(s=>s.market),['US','Global']);
});
test('rejects invalid ranks and sources',()=>{
 assert.throws(()=>mergeRetailerRankings([{source:'unknown',rank:1,observedOn:'2026-10-21'}]));
 assert.throws(()=>mergeRetailerRankings([{source:'ulta_us',rank:0,observedOn:'2026-10-21'}]));
});
test('never assumes Awin image permission from feed availability',()=>{
 assert.equal(imageEligible({catalogSlug:'x'},null),false);
 assert.equal(imageEligible({catalogSlug:'x'},{verified:true,source:'stylevana_awin',scope:['product_page']}),false);
 assert.equal(imageEligible({catalogSlug:'x'},{verified:true,source:'stylevana_awin',scope:['community_onboarding']}),true);
});
