import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateExperiences,createExperienceStore,normalizeExperience,roomProducts} from '../dist/room-experiences.js';
import {demoRoomExperiences,demoRooms,demoMessages} from '../dist/demo-fixtures.js';
import {fetchExperiences,saveExperience} from '../dist/room-experience-api.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}};
test('mixed scenario counts explicit people, periods and differing opinions',()=>{
 const id='demo-experience-mixed',stats=aggregateExperiences(demoRoomExperiences[id],id);
 assert.equal(stats.respondents,8);assert.equal(stats.skins.oily,5);
 assert.deepEqual([stats.products[0].used,stats.products[0].curious,stats.products[0].recommend,stats.products[0].mixed,stats.products[0].regret,stats.products[0].repurchased],[6,2,4,1,1,2]);
 assert.equal(stats.products[0].periods.unknown,1);
});
test('one person across products counted once; revisions replace prior opinion',()=>{
 const id='demo-experience-compare',seed=demoRoomExperiences[id],first=seed[0];
 const stats=aggregateExperiences([...seed,{...first,opinion:'regret',updated_at:'2099-01-01'}],id);
 assert.equal(stats.respondents,8);assert.equal(stats.products.length,2);
 assert.equal(stats.products[0].recommend,3);assert.equal(stats.products[0].regret,2);
 assert.equal(stats.products[1].recommend,3);
 assert.equal(aggregateExperiences(seed,id,[first.author_tag]).respondents,7);
 assert.equal(aggregateExperiences(seed,'online').respondents,0);
});
test('curious users cannot carry previous usage or recommendation',()=>{
 const n=normalizeExperience({status:'curious',period:'months',repeat:'third',opinion:'recommend',reasons:['moisture'],skin:'oily'});
 assert.equal(n.period,'');assert.equal(n.repeat,'');assert.equal(n.opinion,'');assert.deepEqual(n.reasons,[]);
 assert.throws(()=>normalizeExperience({status:'invalid'}));
});
test('save, edit, reopen and delete are isolated from online storage',()=>{
 const s=storage(),store=createExperienceStore(s),id='demo-experience-first';
 store.save(id,'me','a',{status:'using',opinion:'recommend'});
 store.save(id,'me','a',{status:'used',opinion:'mixed'});
 const restored=createExperienceStore(s);assert.equal(restored.rows(id).length,1);assert.equal(restored.rows(id)[0].opinion,'mixed');
 restored.remove(id,'me','a');assert.equal(createExperienceStore(s).rows(id).length,0);
 assert.throws(()=>store.save('online','me','a',{status:'using'}));
 assert.throws(()=>store.rows('online',demoRoomExperiences['demo-experience-mixed']));
});
test('storage failure remains usable but never reports durable save',()=>{
 const store=createExperienceStore({getItem(){throw Error()},setItem(){throw Error()}});
 assert.equal(store.save('demo-1','me','a',{status:'used'}).persisted,false);
 assert.equal(store.rows('demo-1').length,1);
});
test('products come only from explicit subjects or attachments, never text parsing',()=>{
 const r=demoRooms.find(r=>r.id==='demo-experience-compare');
 assert.equal(roomProducts(r,demoMessages[r.id]).length,2);
 assert.deepEqual(roomProducts({id:'empty'},[{body:'I recommend a product'}]),[]);
});
test('online reads page to completion and saves with the established ownership secret',async()=>{
 let n=0;const rows=await fetchExperiences('r',async()=>({ok:true,json:async()=>++n===1?[{room_id:'r'}]:[]}));
 assert.equal(n,2);assert.equal(rows.length,1);
 await saveExperience('secret','r','p',{status:'using'},async(url,opts)=>{assert.ok(url.endsWith('/rpc/set_room_experience'));assert.equal(JSON.parse(opts.body).p_secret,'secret');return {ok:true,status:200,json:async()=>({})}});
});
