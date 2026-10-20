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
