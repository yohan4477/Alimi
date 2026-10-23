import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateExperiences,createExperienceStore,normalizeExperience,roomProducts} from '../dist/room-experiences.js';
import {demoRoomExperiences,demoRooms,demoMessages} from '../dist/demo-fixtures.js';
import {fetchExperiences as gatedFetchExperiences,readExperiencePages as fetchExperiences,saveExperience} from '../dist/room-experience-api.js';
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
 let n=0;const rows=await fetchExperiences('r',async()=>({ok:true,json:async()=>++n===1?[{room_id:'r',author_tag:'a',product_key:'p'}]:[]}));
 assert.equal(n,2);assert.equal(rows.length,1);
 let sent=false;await assert.rejects(saveExperience('secret','r','p',{status:'using'},async()=>{sent=true;}),/chat:unavailable/);
 assert.equal(sent,false);await assert.rejects(gatedFetchExperiences('r',async()=>{sent=true;}),/chat:unavailable/);assert.equal(sent,false);
});
test('keyset reads more than the API row cap, escapes cursor keys, and rejects partial or looping data',async()=>{
 const source=Array.from({length:1005},(_,i)=>({room_id:'r',author_tag:String(i).padStart(6,'0'),product_key:i===499?'quoted"product':'p'}));
 const queries=[];let offset=0;
 const rows=await fetchExperiences('r',async url=>{queries.push(new URL(url));const page=source.slice(offset,offset+=500);return {ok:true,json:async()=>page};});
 assert.equal(rows.length,1005);assert.equal(queries.length,4);
 assert.equal(queries[0].searchParams.get('select').includes('*'),false);
 assert.match(queries[1].searchParams.get('or'),/quoted\\"product/);
 await assert.rejects(fetchExperiences('r',async()=>({ok:true,json:async()=>[source[0]]})),/experience:pagination/);
 await assert.rejects(fetchExperiences('r',async()=>({ok:true,json:async()=>[{...source[0],room_id:'other'}]})),/experience:response/);
 await assert.rejects(fetchExperiences('r',async()=>({ok:true,json:async()=>null})),/experience:response/);
});
test('closed rooms allow withdrawal of old responses even when their product is outside the current chat page',async()=>{
 const {mountRoomExperiences}=await import('../dist/room-experience-ui.js');
 const host={isConnected:true,innerHTML:''};const id='demo-old-experience';
 const local=storage();createExperienceStore(local).save(id,'me','old-product',{status:'used',skin:'dry'});
 const controller=mountRoomExperiences(host,{room:{id,demo:true,status:'closed'},messages:[],author:'me',secret:'unused',storage:local});
 assert.match(host.innerHTML,/data-exp-action="edit"/);
 const click=dataset=>host.onclick({target:{closest:()=>({dataset})}});
 await click({expAction:'edit'});
 assert.match(host.innerHTML,/data-exp-action="delete"/);
 assert.doesNotMatch(host.innerHTML,/data-exp-action="save"/);
 await click({expAction:'delete'});
 assert.equal(createExperienceStore(local).rows(id).length,0);
 controller.updateMessages([]);
 assert.doesNotMatch(host.innerHTML,/data-exp-action="edit"/);
});
