import test from 'node:test';
import assert from 'node:assert/strict';
import {productRoomGroups,findProductRooms} from '../dist/room-search.js';
import {demoRooms,demoMessages,demoProducts,createDemoProductRoom} from '../dist/demo-fixtures.js';

test('the demo lists 12 explicit products and two rooms per product with separate conversations',()=>{
 assert.equal(demoProducts.length,12);
 const coreRooms=demoRooms.filter(r=>!r.id.startsWith('demo-experience-'));
 assert.equal(coreRooms.length,60);
 const groups=productRoomGroups(coreRooms);
 assert.equal(groups.length,12);
 assert.ok(groups.every(g=>g.rooms.length===2));
 assert.equal(coreRooms.reduce((n,r)=>n+demoMessages[r.id].length,0),1440);
 assert.ok(groups.every(g=>g.rooms.every(r=>demoMessages[r.id].some(m=>m.body.includes(r.topic_product.name)))));
});

test('incidental mentions do not create product groups; known catalog subjects do',()=>{
 const catalog=[{family_key:'serum',brand:'토리든',base_name:'다이브인 세럼'}];
 const rooms=[{id:'one',kind:'topic',title_ko:'토리든 다이브인 세럼 사용 후기'},
 {id:'two',kind:'topic',title_ko:'고민 나눔',intro_ko:'다이브인 세럼 언급'},
 {id:'brand',kind:'brand',title_ko:'토리든 다이브인 세럼'}];
 assert.deepEqual(productRoomGroups(rooms,catalog).map(g=>g.rooms.map(r=>r.id)),[['one']]);
 assert.deepEqual(productRoomGroups([rooms[1]],catalog),[]);
});

test('an absent product can be created as an empty session-only demo room and appears in the list',()=>{
 const productName='새 제품 테스트';
 assert.equal(findProductRooms(demoRooms,productName).length,0);
 const room=createDemoProductRoom({title:productName+' 사용 후기',productName});
 assert.equal(room.demo,true);assert.equal(room.members,0);assert.equal(room.messages_24h,0);
 assert.deepEqual(demoMessages[room.id],[]);
 assert.ok(productRoomGroups(demoRooms).find(g=>g.name===productName)?.rooms.includes(room));
 assert.equal(findProductRooms(demoRooms,productName).length,1);
});
