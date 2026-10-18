import test from 'node:test';
import assert from 'node:assert/strict';
import {activeRooms,mentionedProducts} from '../dist/community-home.js';
const now=Date.parse('2026-10-19T00:00:00Z');
const row=(id,author,room,family,time='2026-10-18T23:00:00Z')=>({id,source:'chat',author_tag:author,room_id:room,created_at:time,item:{family_key:family}});
test('mentions rank distinct people and rooms, not a single author repeating a product',()=>{
 const entries=[row(1,'a','r1','A'),row(2,'a','r1','A'),row(3,'a','r1','A'),row(4,'b','r1','B'),row(5,'c','r2','B')];
 const result=mentionedProducts(entries,[],now);assert.equal(result[0].item.family_key,'B');assert.equal(result[0].authors.size,2);assert.equal(result[0].rooms.size,2);
});
test('mentions exclude old and blocked content and duplicate source IDs',()=>{
 const x=row(1,'a','r1','A'); const list=[x,x,row(2,'blocked','r1','A'),row(3,'b','r1','A','2026-10-17T00:00:00Z')];
 const [g]=mentionedProducts(list,['blocked'],now);assert.equal(g.entries.length,1);assert.equal(g.authors.size,1);
});
test('empty rooms never appear as active, input order is not mutated',()=>{
 const rooms=[{id:'quiet',messages_24h:0},{id:'old',messages_24h:30,last_message_at:'2026-10-18T01:00:00Z'},{id:'new',messages_24h:1,last_message_at:'2026-10-18T23:00:00Z'}];
 assert.deepEqual(activeRooms(rooms).map(r=>r.id),['new','old']);assert.equal(rooms[0].id,'quiet');
});
