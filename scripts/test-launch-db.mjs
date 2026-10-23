// Disposable PostgreSQL (WASM) verification. No production URL or credentials are used.
// npm install --prefix /tmp/seoul-db-test --no-save @electric-sql/pglite@0.3.14
// PGLITE_MODULE=/tmp/seoul-db-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-launch-db.mjs
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite} = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const root = new URL('../', import.meta.url);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const [migration, test] of [
    ['20261023031824_affiliate_order_ledger.sql','affiliate_ledger.test.sql'],
    ['20261023031813_private_beauty_drafts.sql','private_beauty_drafts.test.sql']
  ]) {
    await db.exec(await readFile(new URL('supabase/migrations/' + migration, root), 'utf8'));
    await db.exec(await readFile(new URL('supabase/tests/' + test, root), 'utf8'));
    console.log(test + ': PostgreSQL migration and security assertions passed');
  }
} finally { await db.close(); }
