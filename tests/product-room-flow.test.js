import './fixtures/en-locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {findProductRooms} from '../dist/room-search.js';
import {sharedTarget,shareUrl} from '../dist/share.js';

test('product search matches room subjects across languages but ignores message mentions and brand rooms',()=>{
 const rooms=[{id:'a',title_ko:'롬앤 틴트 사용 후기',title_en:'Romand tint experiences',kind:'topic'},
 {id:'b',title_ko:'여드름 고민',intro_ko:'롬앤 틴트 이야기',messages:[{body:'롬앤 틴트'}],kind:'topic'},
 {id:'c',title_ko:'롬앤 틴트',kind:'brand'}];
 assert.deepEqual(findProductRooms(rooms,' 롬앤  틴트 ').map(r=>r.id),['a']);
 assert.deepEqual(findProductRooms(rooms,'ROMAND tint').map(r=>r.id),['a']);
 assert.deepEqual(findProductRooms(rooms,''),[]);
 assert.deepEqual(findProductRooms(rooms,'클리오'),[]);
});
test('a UUID room invitation can reopen the same room',()=>{
 const room='01234567-89ab-4cde-8fab-0123456789ab';
 const url=shareUrl({room},'https://example.com/live?region=kr&lang=ko#old');
 assert.deepEqual(sharedTarget(new URL(url).search),{room});
 assert.equal(sharedTarget('?room='+ 'a'.repeat(65)),null);
 assert.equal(sharedTarget('?room=%3Cscript%3E'),null);
});

test('onboarding stores a button-selected age and completes into browsing without joining a room',async()=>{
 const listeners=new Map(), saved=new Map();
 const box={hidden:true,innerHTML:'',contains:()=>true};
 globalThis.document={addEventListener:(name,fn)=>listeners.set(name,fn),getElementById:()=>box,querySelector:()=>({focus(){}}),body:{classList:{add(){},remove(){}}}};
 globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
 let closed=0,joined=0;
 const {openOnboarding,readInterests}=await import('../dist/onboarding.js?interaction');
 openOnboarding({step:'choose',onClose:()=>closed++,onRoom:()=>joined++});
 const click=dataset=>listeners.get('click')({target:{closest:()=>({dataset})}});
 click({onbGroup:'skincare'});click({onb:'next'});
 assert.match(box.innerHTML,/data-onb-profile="ageRange"/);assert.doesNotMatch(box.innerHTML,/<select data-onb-profile="ageRange"/);
 click({onbProfile:'ageRange',onbValue:'25–29'});assert.match(box.innerHTML,/data-onb-value="25–29" aria-pressed="true"/);
 click({onb:'profile-next'});
 assert.match(box.innerHTML,/data-onb="products-browse"/);
 assert.equal(closed,0);
 click({onb:'products-browse'});
 assert.equal(closed,1);assert.equal(joined,0);assert.equal(box.hidden,true);
 assert.equal(readInterests().ageRange,'25–29');assert.equal(readInterests().done,true);
});

test('demo conversations expose all twelve attached products within the recent sample',async()=>{
 const {demoRooms,demoMessages,demoEntries}=await import('../dist/demo-fixtures.js');
 const {mentionedProducts}=await import('../dist/community-home.js');
 assert.equal(demoRooms.length,60);
 assert.equal(Object.values(demoMessages).flat().length,24); // Only one question/answer pair per product; no repeated filler
 assert.ok(Object.values(demoMessages).flat().every(message=>message.reply_to===null), 'immediate product question/answer turns are ordinary chat');
 const products=mentionedProducts(demoEntries());
 assert.equal(products.length,12);
 assert.ok(products.every(g=>g.rooms.size===1 && g.entries.length>0 && g.item.demo && /^https:\/\//.test(g.item.image_url)));
});
