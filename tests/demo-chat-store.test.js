import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoChatStore} from '../dist/demo-chat-store.js';
test('demo messages survive reopening and stay separated by room', () => {
  const data = new Map(); const storage = {getItem: k => data.get(k), setItem: (k,v) => data.set(k,v)};
  const store = createDemoChatStore(storage);
  const {message, persisted} = store.send('demo-1', ' hello ', null, 900001, 'me');
  assert.equal(persisted, true); assert.equal(message.body, 'hello'); assert.equal(message.reply_to, 900001);
  assert.deepEqual(createDemoChatStore(storage).messages('demo-1'), [message]);
  assert.deepEqual(store.messages('demo-2'), []);
  assert.throws(() => store.send('production', 'hello', null, null, 'me'));
  assert.throws(() => store.send('demo-1', ' ', null, null, 'me'));
});
test('unavailable storage keeps the current session usable and reports persistence failure', () => {
  const store = createDemoChatStore({getItem(){throw Error();},setItem(){throw Error();}});
  const a=store.send('demo-1','a',null,null,'me'); const b=store.send('demo-1','b',null,a.message.id,'me');
  assert.equal(a.persisted,false); assert.notEqual(a.message.id,b.message.id); assert.equal(store.messages('demo-1').length,2);
});

test('previous QA spam is removed from demo storage without changing other records', () => {
 const data=new Map(); const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const bad={id:1,room_id:'demo-cx-t01',demo:true,body:'[가상 긴 글 검증] 같은 말 반복'};
 const good={id:2,room_id:'demo-cx-t01',demo:true,body:'바르고 한 시간 지나니까 입술 안쪽만 지워졌어요.',reply_to:1};
 const real={id:3,room_id:'real-room',body:'[가상 UX 검증] 실제 글은 보존'};
 data.set('seoulbeauty-demo-chat-v1',JSON.stringify({'demo-cx-t01':[bad,good],'real-room':[real]}));
 const store=createDemoChatStore(storage);
 assert.deepEqual(store.messages('demo-cx-t01'),[{...good,reply_to:null}]);
 assert.deepEqual(JSON.parse(data.get('seoulbeauty-demo-chat-v1'))['real-room'],[real]);
 assert.throws(()=>store.send('demo-cx-t01','[가상 UX 검증] 반복 시험',null,null,'me'),/Artificial/);
});
