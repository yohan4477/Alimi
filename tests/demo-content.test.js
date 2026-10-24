import test from 'node:test';
import assert from 'node:assert/strict';
import {isDemoArtifact,cleanDemoMessages} from '../dist/demo-content.js';
import {readSavedMessages} from '../dist/saved-messages.js';
import {readFile} from 'node:fs/promises';
test('repeated long text and QA markers are artifacts; ordinary experience text is not',()=>{
 assert.equal(isDemoArtifact('[가상 UX 검증] 답글 기능 확인'),true);
 assert.equal(isDemoArtifact('입술이 건조해서 다른 제품을 써 봤어요.\n'.repeat(5)),true);
 assert.equal(isDemoArtifact('입술이 건조해서 립밤을 먼저 발랐어요. 점심 먹고 보니 안쪽은 지워졌네요.'),false);
 assert.equal(cleanDemoMessages([{id:1,body:'[가상 UX 검증]',demo:false}]).length,1);
});
test('artifact bookmarks are purged only for demo rooms',()=>{
 const bad={id:1,room_id:'demo-cx-t01',body:'[가상 긴 글 검증]'};
 const real={id:2,room_id:'actual',body:bad.body};let value=JSON.stringify([bad,real]);
 const storage={getItem:()=>value,setItem:(k,v)=>{value=v;}};
 assert.deepEqual(readSavedMessages(storage),[real]);assert.deepEqual(JSON.parse(value),[real]);
});
test('curated sample conversations have no QA artifacts, missing-photo claims or dangling replies',async()=>{
 const data=JSON.parse(await readFile(new URL('../dist/cx-demo-fixtures.json',import.meta.url),'utf8'));
 for(const room of data.rooms){
  const rows=data.messages[room.id],ids=new Set(rows.map(m=>m.id));
  assert.equal(new Set(rows.map(m=>m.body)).size,rows.length);
  for(const m of rows){assert.equal(isDemoArtifact(m.body),false);assert.ok(!m.reply_to||ids.has(m.reply_to));assert.doesNotMatch(m.body,/사진 세 장|브랜드 [ABC]|리미티드 에디션 03/);}
  assert.equal(room.members,new Set(rows.map(m=>m.author_tag)).size);
 }
});

test('sample chat turns are chronological; quotes only recall a topic after intervening discussion',async()=>{
 const data=JSON.parse(await readFile(new URL('../dist/cx-demo-fixtures.json',import.meta.url),'utf8'));
 // These deliberately return to older topics after the conversation has moved on:
 // coverage after application/sensitivity, one-product packing after texture,
 // eye stinging after makeup/reapplication, powder wear after liquid application.
 const delayed=new Map([[980056,980048],[980067,980060],[980074,980070],[980087,980080]]);
 const actual=[];
 for(const room of data.rooms){
  const rows=data.messages[room.id];
  for(const [index,message] of rows.entries()){
   if(index)assert.ok(Date.parse(message.created_at)>=Date.parse(rows[index-1].created_at),`${message.id}: chronological order`);
   assert.equal(message.reply_to,delayed.get(message.id)??null,`${message.id}: ordinary conversation is not a comment thread`);
   if(message.reply_to){
    const parentIndex=rows.findIndex(row=>row.id===message.reply_to);
    assert.ok(parentIndex>=0&&index-parentIndex>=4,`${message.id}: older same-room target with intervening discussion`);
    assert.match(message.body,/처음|아까/);
    actual.push([message.id,message.reply_to]);
   }
  }
 }
 assert.deepEqual(actual,[...delayed], 'preserve meaningful delayed replies, not blanket flattening');
});
