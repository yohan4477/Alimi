import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;');
 await db.exec(await readFile(new URL('../migrations/20261023090000_owned_product_polls.sql',import.meta.url),'utf8'));
 const voter='00000000-0000-4000-8000-000000000001';
 await db.query("insert into owned_product_votes(product_id,voter_id,choice,test) values ('64960',$1,'owned',false),('64960',$1,'past',true)",[voter]);
 await db.query("insert into owned_product_votes(product_id,voter_id,choice,test,followup) values ('64960',$1,'want',false,'looks') on conflict(product_id,voter_id,test) do update set choice=excluded.choice,followup=excluded.followup",[voter]);
 const rows=(await db.query('select choice,test,followup from owned_product_votes order by test')).rows;
 assert.equal(rows.length,2);assert.equal(rows[0].choice,'want');assert.equal(rows[1].choice,'past');
 await db.exec('set role anon');await assert.rejects(db.query('select * from owned_product_votes'));
 await db.exec('reset role');
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='owned_product_votes'::regclass")).rows[0].relrowsecurity,true);
 console.log('owned-poll: PostgreSQL upsert, test/live isolation, RLS and anonymous denial passed');
}finally{await db.close();}
