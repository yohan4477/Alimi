// In-memory check of the admin insights aggregate. Never connects remotely.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = name => readFile(new URL(name, import.meta.url), 'utf8');
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);`);
  await db.exec(await sql('../migrations/20261023075137_beauty_game_backend.sql'));
  await db.exec(await sql('../migrations/20261024130000_beauty_game_insights.sql'));
  await db.exec(await sql('../migrations/20261025090000_beauty_game_insights_heard.sql'));
  const a = 'a'.repeat(64), b = 'b'.repeat(64), p1 = '11111111-1111-4111-8111-111111111111', p2 = '22222222-2222-4222-8222-222222222222';
  await db.exec(`insert into beauty_game.sessions(session_hash) values ('${a}'),('${b}');`);
  const ev = (id, s, play, name, step, extra = '') => `('${id}','${s}',jsonb_build_object('play','${play}','name','${name}','step','${step}','test',false${extra}))`;
  await db.exec(`insert into beauty_game.events(id,session_hash,payload) values
    ${ev('00000000-0000-4000-8000-000000000001', a, p1, 'landing_view', 'landing', ",'entry','reddit','country','US','lang','en'")},
    ${ev('00000000-0000-4000-8000-000000000002', a, p1, 'advice_select', 'moist')},
    ${ev('00000000-0000-4000-8000-000000000003', a, p1, 'brand_select', 'CLIO')},
    ${ev('00000000-0000-4000-8000-000000000004', b, p2, 'landing_view', 'landing', ",'country','KR','lang','ko'")},
    ${ev('00000000-0000-4000-8000-000000000005', b, p2, 'brand_select', 'all')},
    ${ev('00000000-0000-4000-8000-000000000006', a, p1, 'heard_from', 'instagram')};
    insert into beauty_game.answers(session_hash,play,character,test,version,product,reason) values
    ('${a}','${p1}','mona',false,'v','64960','{"reasons":["색이 어울려서"],"advice":"moist","note":"private"}');`);
  const {rows:[{r}]} = await db.query(`select public.beauty_game_insights(false,7) r`);
  assert.equal(r.people, 2);
  const step = k => r.funnel.find(f => f.step === k);
  assert.deepEqual([step('landing_view').people, step('advice_select').people, step('answer').people, step('share').people], [2, 1, 1, 0]);
  const seg = (d, v) => r.segments.find(s => s.dimension === d && s.value === v);
  assert.deepEqual([seg('entry','reddit').completed, seg('entry','unknown').people, seg('country','US').started, seg('country','KR').started], [1, 1, 1, 0]);
  assert.deepEqual([seg('heard','instagram').completed, seg('heard','unanswered').people], [1, 1]);
  assert.deepEqual(r.choices, [{character:'mona',advice:'moist',product:'64960',n:1}]);
  assert.deepEqual(r.brands, [{brand:'CLIO',people:1}]);
  assert.deepEqual(r.reasons, [{reason:'색이 어울려서',n:1}]);
  assert.ok(!JSON.stringify(r).includes('private') && !JSON.stringify(r).includes(a));
  const {rows:[{t}]} = await db.query(`select public.beauty_game_insights(true,7) t`);
  assert.equal(t.people, 0);
  console.log('beauty-game-insights: funnel, segments, choices and privacy assertions passed');
} finally { await db.close(); }
