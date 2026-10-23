import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=JSON.parse(fs.readFileSync(new URL('../dist/cx-demo-fixtures.json',import.meta.url)));
const en=JSON.parse(fs.readFileSync(new URL('../dist/cx-demo-fixtures.en.json',import.meta.url)));
test('English sample sidecar covers exactly the cleaned Korean rooms and messages',()=>{
 assert.equal(source.rooms.length,13);
 assert.deepEqual(Object.keys(en.rooms).sort(),source.rooms.map(r=>r.id).sort());
 const messages=Object.values(source.messages).flat();
 assert.equal(messages.length,80);
 assert.deepEqual(Object.keys(en.messages).sort(),messages.map(m=>String(m.id)).sort());
 for(const room of source.rooms){
  assert.equal(room.demo,true);
  assert.ok(en.rooms[room.id].title.trim());
  assert.equal(en.rooms[room.id].intro,en.messages[source.messages[room.id][0].id].body);
 }
 for(const message of messages){
  assert.equal(message.demo,true);
  assert.ok(en.messages[message.id].body.trim());
  assert.ok(en.messages[message.id].nickname.trim());
 }
 assert.doesNotMatch(JSON.stringify(en),/[가-힣]/);
});
test('Translation preserves explicit uncertainty, personal attribution, and Korean currency',()=>{
 assert.match(en.messages['980028'].body,/everyone's skin is different/);
 assert.match(en.messages['980029'].body,/consult a dermatologist/);
 assert.match(en.messages['980033'].body,/still don't know the exact cause/);
 assert.match(en.messages['980074'].body,/varies by product/);
 assert.match(en.messages['980089'].body,/on my skin/);
 assert.match(en.messages['980118'].body,/KRW 6,000.*KRW 30,000/);
});
