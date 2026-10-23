import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROOM_LIFECYCLE_ENABLED,ROOM_EXPERIENCES_ENABLED,roomRpcAllowed} from '../dist/room-feature-release.js';
import {rpc} from '../dist/supabase.js';
import {chatSecret} from '../dist/chat-api.js';
test('room capabilities default OFF and all privileged client RPCs fail without network I/O',async()=>{
 assert.equal(ROOM_LIFECYCLE_ENABLED,false);assert.equal(ROOM_EXPERIENCES_ENABLED,false);
 for(const name of ['room_actions','leave_room','delete_room','delete_chat_message','set_room_experience','delete_room_experience']){
  assert.equal(roomRpcAllowed(name),false);let sent=false;
  await assert.rejects(rpc(name,{},async()=>{sent=true;}),/chat:unavailable/);assert.equal(sent,false);
 }
 for(const name of ['create_region_room','create_room','post_chat','like_chat','report_chat'])assert.equal(roomRpcAllowed(name),true);
 const native=readFileSync(new URL('../ios/Alimi/RoomTopics.swift',import.meta.url),'utf8');
 assert.match(native,/static let lifecycle = false/);assert.match(native,/static let experiences = false/);
 const api=readFileSync(new URL('../ios/Alimi/Chat.swift',import.meta.url),'utf8');assert.match(api,/guard RoomFeatureRelease.allowsRPC\(name\)/);
});
test('new device ownership proof is random UUID-v4 and not a public author tag',()=>{
 const make=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}};
 const secrets=Array.from({length:64},()=>chatSecret(make()));
 for(const secret of secrets)assert.match(secret,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(new Set(secrets).size,64);
});
test('message and room deletion require explicit in-app confirmation in web and native',()=>{
 const web=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8');
 assert.match(web,/if \(!confirm\(t\(action === 'delete' \? 'room.deleteConfirm' : 'room.leaveConfirm'\)\)\) return/);
 assert.match(web,/!confirm\(t\('chat.deleteConfirm'\)\)/);
 const native=readFileSync(new URL('../ios/Alimi/Chat.swift',import.meta.url),'utf8');assert.match(native,/confirmationDialog\(L\("chat.deleteConfirm"\)/);
 const community=readFileSync(new URL('../ios/Alimi/Community.swift',import.meta.url),'utf8');assert.match(community,/confirmationDialog\(L\(pendingAction == "delete"/);
});
