import test from 'node:test';
import assert from 'node:assert/strict';
import {roomFixture,sqlFile,migrations} from '../supabase/tests/room-fixture.mjs';
const owner='11111111-1111-4111-a111-111111111111',other='22222222-2222-4222-a222-222222222222';
const value=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0]?.v;
const run=async(db,name,args) => value(db,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args);
const save=(db,who,room,product,input)=>run(db,'set_room_experience',[who,room,product,JSON.stringify(input)]);
test('forward migrations preserve current regional columns, dependencies, RLS and rows',async()=>{
 const db=await roomFixture();try{
  const before=(await db.query("select attname from pg_attribute where attrelid='chat_room_list'::regclass and attnum>0 and not attisdropped order by attnum")).rows.map(r=>r.attname);
  const count=await value(db,'select count(*) as v from chat_rooms');
  for(let i=0;i<2;i++) for(const file of migrations) await db.exec(await sqlFile(file));
  assert.equal(await value(db,'select count(*) as v from chat_rooms'),count);
  const after=(await db.query("select attname from pg_attribute where attrelid='chat_room_list'::regclass and attnum>0 and not attisdropped order by attnum")).rows.map(r=>r.attname);
  assert.deepEqual(after.slice(0,before.length),before);
  assert.equal(await value(db,'select integration_marker as v from chat_room_list limit 1'),'kept');
  assert.ok((await db.query('select * from room_list_dependency')).rows.length);
  await db.exec('set role anon');
  const us=await run(db,'create_room',[owner,'Identical title','','talk',['sun','cushion','trouble']]);
  const kr=await run(db,'create_region_room',[other,'Identical title','','skin',['redness'],'kr']);
  assert.equal(await value(db,'select service_region as v from chat_room_list where id=$1',[us]),'us');
  assert.equal(await value(db,'select service_region as v from chat_room_list where id=$1',[kr]),'kr');
  await assert.rejects(run(db,'create_region_room',[other,'Identical title','','skin',[],'kr']),/chat:duplicate/);
  const legacyTags=['acne','dry','sensitive','pores','spots','firmness','sebum','toneup','trouble','lip','base','cushion','longwear','shade'];
  const canonicalLegacy=[...new Set(legacyTags.map(tag=>tag==='trouble'?'acne':tag==='cushion'?'base':tag))].sort();
  const legacyUs=await run(db,'create_room',[owner,'Cached US client','','talk',legacyTags]);
  const legacyKr=await run(db,'create_region_room',[other,'Cached KR client','','skin',legacyTags,'kr']);
  for(const id of [legacyUs,legacyKr])assert.deepEqual((await value(db,'select concerns as v from chat_room_list where id=$1',[id])).sort(),canonicalLegacy,'cached clients may submit every previously offered concern');
  await assert.rejects(run(db,'create_region_room',[other,'Invalid tags','','skin',['invented'],'kr']),/chat:tag/);
  await assert.rejects(run(db,'create_region_room',[other,'Invalid region','','skin',[],'xx']),/chat:region/);
  await assert.rejects(db.query('select * from room_experience_private.write_budgets'),/permission denied/);
  await assert.rejects(db.query("insert into room_experiences(room_id,product_key,author_tag,status) values($1,'x','forged','used')",[us]),/permission denied/);
 }finally{await db.close();}
});
test('experience RPCs enforce ownership, source evidence, public disclosure, closure, withdrawal and persistent limits',async()=>{
 const db=await roomFixture();try{
  for(const file of migrations) await db.exec(await sqlFile(file));
  await db.exec("insert into catalog_items(retailer,market,sku,family_key,active) values('test','US','sku','fixture-product',true);alter table room_experiences add column private_future_column text default 'not-public';");
  await db.exec('set role anon');
  const room=await run(db,'create_region_room',[owner,'Experience room','','skin',[],'kr']);
  const msg=await run(db,'post_chat',[owner,room,'My explicit product','test','US','sku']);
  const first=await save(db,owner,room,'fixture-product',{status:'used',period:'months',opinion:'recommend',skin:'dry',source_message:msg.id});
  assert.ok(!Object.hasOwn(first,'private_future_column'));
  await assert.rejects(db.query('select private_future_column from room_experiences'),/permission denied/);
  await assert.rejects(save(db,other,room,'fixture-product',{status:'used',source_message:msg.id}),/chat:reply/);
  await assert.rejects(save(db,other,room,'made-up-product',{status:'used'}),/chat:item/);
  await assert.rejects(save(db,other,room,'fixture-product',{status:'used',reasons:Array(7).fill('light')}),/chat:experience/);
  const curious=await save(db,owner,room,'fixture-product',{status:'curious',period:'months',repeat:'third',opinion:'recommend',reasons:['light']});
  assert.deepEqual([curious.period,curious.repeat,curious.opinion,curious.reasons],['','','',[]]);
  await run(db,'delete_room_experience',[other,room,'fixture-product']);
  assert.equal(await value(db,'select count(room_id) as v from room_experiences'),1);
  await save(db,other,room,'fixture-product',{status:'using'});
  await run(db,'leave_room',[other,room]);
  await assert.rejects(run(db,'delete_room',[owner,room]),/chat:participated/);
  await db.exec('reset role');await run(db,'close_room',[room,'Operator-reviewed closure']);await db.exec('set role anon');
  await assert.rejects(save(db,owner,room,'fixture-product',{status:'used'}),/chat:room/);
  assert.equal(await value(db,'select count(room_id) as v from room_experiences'),2,'closed remains readable');
  await run(db,'delete_room_experience',[owner,room,'fixture-product']);
  assert.equal(await value(db,'select count(room_id) as v from room_experiences'),1,'withdrawal works after closure');
  await db.exec('reset role');await db.query("update chat_rooms set active=false where id=$1",[room]);await db.exec('set role anon');
  assert.equal(await value(db,'select count(room_id) as v from room_experiences'),0);
  assert.equal(await value(db,'select count(room_id) as v from chat_members where room_id=$1',[room]),0);
  await run(db,'delete_room_experience',[other,room,'fixture-product']);
  await db.exec('reset role');await db.query("update chat_rooms set active=true,status='active' where id=$1",[room]);await db.query('delete from room_experience_private.write_budgets');await db.exec('set role anon');
  for(let i=0;i<12;i++) await save(db,owner,room,'fixture-product',{status:'used'});
  await assert.rejects(save(db,owner,room,'fixture-product',{status:'used'}),/chat:slow/);
  await run(db,'delete_room_experience',[owner,room,'fixture-product']);
  await assert.rejects(save(db,owner,room,'fixture-product',{status:'used'}),/chat:slow/,'delete does not reset write budget');
 }finally{await db.close();}
});
test('new ownership RPCs reject malformed proofs and never accept a public tag or another device',async()=>{
 const db=await roomFixture();try{
  for(const file of migrations)await db.exec(await sqlFile(file));
  const tag=await value(db,'select chat_tag($1) as v',[owner]);
  await db.exec('set role anon');
  const room=await run(db,'create_room',[owner,'Proof test','','talk',[]]);
  const msg=await run(db,'post_chat',[owner,room,'Keep my original content']);
  for(const secret of [null,'','not-a-secret',tag,'-'.repeat(36),'0'.repeat(36),owner.toUpperCase()]){
   await assert.rejects(run(db,'delete_chat_message',[secret,msg.id]),/chat:secret/);
   await assert.rejects(run(db,'delete_room',[secret,room]),/chat:secret/);
   await assert.rejects(run(db,'delete_room_experience',[secret,room,'x']),/chat:secret/);
  }
  await assert.rejects(run(db,'delete_chat_message',[other,msg.id]),/chat:owner/);
  assert.equal(await value(db,'select body as v from chat_messages where id=$1',[msg.id]),'Keep my original content');
  await assert.rejects(run(db,'room_ownership_tag',[owner]),/permission denied/);
  await run(db,'delete_chat_message',[owner,msg.id]);
  assert.equal(await value(db,'select body as v from chat_messages where id=$1',[msg.id]),'');
 }finally{await db.close();}
});
