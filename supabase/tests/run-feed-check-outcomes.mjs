// Isolated in-memory SQL regression test. Never connects to the live project.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated;');
  await db.exec(await readFile(new URL('../migrations/20261018040000_feed_checks.sql', import.meta.url), 'utf8'));
  await db.exec("insert into public.feed_checks(feed_id,changed,downloaded,last_imported) values('111294',true,true,'old-unverified');");
  await db.exec(await readFile(new URL('../migrations/20261023085020_feed_check_outcomes.sql', import.meta.url), 'utf8'));
  const historical = (await db.query('select * from public.feed_checks')).rows[0];
  assert.equal(historical.downloaded, true);
  assert.equal(historical.import_status, null);
  assert.equal(historical.check_succeeded, null);
  assert.equal(historical.completed_at, null);
  await db.exec("insert into public.feed_checks(feed_id,changed,downloaded,check_succeeded,import_status) values('111294',true,false,true,'pending');");
  await db.exec("update public.feed_checks set import_status='failed',completed_at=now() where id=2;");
  assert.equal((await db.query("select count(*)::int n from public.feed_checks where import_status='succeeded'")).rows[0].n, 0);
  await db.exec("insert into public.feed_checks(feed_id,changed,downloaded,check_succeeded,import_status,completed_at) values('111294',true,true,true,'succeeded',now());");
  assert.equal((await db.query("select count(*)::int n from public.feed_checks where import_status='succeeded'")).rows[0].n, 1);
  await assert.rejects(db.exec("insert into public.feed_checks(feed_id,changed,downloaded,import_status) values('111294',true,true,'invented');"));
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.feed_checks'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) assert.equal((await db.query(`select has_table_privilege('${role}','public.feed_checks','SELECT') permitted`)).rows[0].permitted, false);
  console.log('feed-check-outcomes: preserves unverified history, validates outcomes and retains server-only RLS');
} finally { await db.close(); }
