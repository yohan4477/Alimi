// Install @electric-sql/pglite@0.3.14 in a disposable local directory, then:
// PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/run-beauty-game-pglite.mjs
// Uses only an isolated in-memory PostgreSQL instance. Never connects remotely.
import { readFile } from 'node:fs/promises';
const modulePath = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = await import(modulePath);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);`);
  await db.exec(await readFile(new URL('../migrations/20261023075137_beauty_game_backend.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('./beauty_game_backend.sql', import.meta.url), 'utf8'));
  console.log('beauty_game_backend: PostgreSQL regression assertions passed');
} finally { await db.close(); }
