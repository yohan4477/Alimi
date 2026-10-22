import test from 'node:test';
import assert from 'node:assert/strict';
import {readSavedMessages,toggleSavedMessage} from '../dist/saved-messages.js';

test('message bookmarks distinguish the same message id in different rooms and survive rereads',()=>{
  const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const a={id:1,room_id:'a',body:'First'},b={id:1,room_id:'b',body:'Second'};
  assert.equal(toggleSavedMessage(a,storage),true);
  assert.equal(toggleSavedMessage(b,storage),true);
  assert.deepEqual(readSavedMessages(storage).map(m=>m.body),['Second','First']);
  assert.equal(toggleSavedMessage(a,storage),false);
  assert.deepEqual(readSavedMessages(storage).map(m=>m.room_id),['b']);
});

test('unavailable or malformed storage does not break the saved list',()=>{
  assert.deepEqual(readSavedMessages({getItem:()=>'{invalid'}),[]);
  assert.deepEqual(readSavedMessages({getItem:()=>JSON.stringify([null,{id:1}, {id:2,room_id:'a'}])}),[{id:2,room_id:'a'}]);
});
