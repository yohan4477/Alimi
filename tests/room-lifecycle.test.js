import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {ROOM_TAGS, offeredTags, canonicalTags, toggleRoomTag} from '../dist/room-policy.js';
import {createRoom, errorKey, leaveRoom, deleteRoom, roomActions} from '../dist/chat-api.js';

const root = new URL('../supabase/migrations/', import.meta.url);
const owner='11111111-1111-4111-a111-111111111111', other='22222222-2222-4222-a222-222222222222';
const fixture = async () => {
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema analytics;
 create table app_events(name text constraint app_events_name_check check(name in ('home_view')));
 create table catalog_items(retailer text,market text,sku text,brand text,brand_ko text,name text,price_minor integer,image_url text,family_key text,active boolean);
 create table brand_logos(brand text,logo_url text);
 create table catalog_brands(brand text,brand_ko text,families bigint);
 grant select on brand_logos,catalog_items to anon,authenticated;`);
 for(const file of ['20261018090000_chat.sql','20261018110000_chat_room_kinds.sql','20261019010000_community.sql','20261019050000_user_rooms.sql','20261019060000_concern_keywords.sql',readdirSync(root).find(f=>f.endsWith('_room_lifecycle_and_tags.sql'))]) await db.exec(readFileSync(new URL(file,root),'utf8'));
 return db;
};
const value=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0]?.v;
const create=(db,title='Test room',secret=owner,tags=[]) => value(db,'select public.create_room($1,$2,\'\',\'talk\',$3::text[]) as v',[secret,title,tags]);

test('room tag choices: 19 specific tags, aliases merge, fourth selection blocked and removable',()=>{
 assert.equal(ROOM_TAGS.length,19);
 assert.deepEqual(canonicalTags(['trouble','acne','cushion','base']),['acne','base']);
 assert.deepEqual(toggleRoomTag(['acne','dry','lip'],'sun'),['acne','dry','lip']);
 assert.deepEqual(toggleRoomTag(['acne','dry','lip'],'dry'),['acne','lip']);
 assert.ok(offeredTags('skin').some(t=>t.id==='sun'));
 assert.ok(!offeredTags('skin').some(t=>t.id==='lip'));
});
test('missing create RPC is surfaced as server update, never a successful creation',async()=>{
 await assert.rejects(createRoom(owner,{title:'Test room'},async()=>({ok:false,status:404,json:async()=>({code:'PGRST202',message:'Could not find the function public.create_room'})})),e=>errorKey(e.message)==='chat.err.unavailable');
});
test('management API never sends a claimed owner, only the caller proof and target',async()=>{
 for(const [fn,name] of [[leaveRoom,'leave_room'],[deleteRoom,'delete_room'],[roomActions,'room_actions']]) {
  let seen; await fn(owner,'u-test',async(url,o)=>{seen={url,body:JSON.parse(o.body)};return {ok:true,status:200,json:async()=>null};});
  assert.ok(seen.url.endsWith('/'+name));assert.deepEqual(seen.body,{p_secret:owner,p_room:'u-test'});
 }
});
test('database rules under anon: creation, ownership, participation history, messages, closure and archive',async()=>{
 const db=await fixture();
 try {
  await db.exec('set role anon');
  const a=await create(db,'Tagless room');
  await assert.rejects(value(db,'select delete_room($1,$2) as v',[other,a]),/chat:owner/);
  assert.equal((await value(db,'select room_actions($1,$2) as v',[owner,a])).can_delete,true);
  await value(db,'select join_chat($1,$2) as v',[other,a]);
  await value(db,'select leave_room($1,$2) as v',[other,a]);
  await assert.rejects(value(db,'select delete_room($1,$2) as v',[owner,a]),/chat:participated/);
  const b=await create(db,'Solo room',owner,['trouble','acne','cushion']);
  assert.deepEqual((await db.query('select concerns from chat_room_list where id=$1',[b])).rows[0].concerns.sort(),['acne','base']);
  const m=await value(db,'select post_chat($1,$2,$3) as v',[owner,b,'hello']);
  await assert.rejects(value(db,'select delete_chat_message($1,$2) as v',[other,m.id]),/chat:owner/);
  await value(db,'select delete_chat_message($1,$2) as v',[owner,m.id]);
  assert.equal((await db.query('select body from chat_messages where id=$1',[m.id])).rows[0].body,'');
  await assert.rejects(value(db,'select like_chat($1,$2) as v',[other,m.id]),/chat:message/);
  await value(db,'select delete_room($1,$2) as v',[owner,b]);
  assert.equal((await db.query('select id from chat_room_list where id=$1',[b])).rows.length,0);
  assert.equal((await db.query('select id from chat_messages where room_id=$1',[b])).rows.length,0);
  await assert.rejects(value(db,'select join_chat($1,$2) as v',[owner,b]),/chat:room/);
  await assert.rejects(create(db,'Bad tag',other,['invented']),/chat:tag/);
  await assert.rejects(create(db,'Too many',other,['acne','dry','lip','sun']),/chat:tags/);
  const c=await create(db,'Quota room');
  await assert.rejects(create(db,'Fourth room'),/chat:slow/); // deleted rooms still count
  await assert.rejects(db.query("update chat_rooms set had_other_participant=false"),/permission denied/);
  await assert.rejects(value(db,'select close_room($1,$2) as v',[a,'reviewed']),/permission denied/);
  await assert.rejects(value(db,'select archive_empty_rooms() as v'),/permission denied/);
  await db.exec('reset role');
  await value(db,'select close_room($1,$2) as v',[a,'Reviewed by operator']);
  await db.exec('set role anon');
  await assert.rejects(value(db,'select post_chat($1,$2,$3) as v',[owner,a,'closed']),/chat:room/);
  await db.exec('reset role');
  await db.query("update chat_rooms set created_at=now()-interval '8 days' where id=$1",[c]);
  assert.equal(await value(db,'select archive_empty_rooms() as v'),1);
  assert.equal((await db.query('select status from chat_rooms where id=$1',[c])).rows[0].status,'archived');
 }finally{await db.close();}
});
