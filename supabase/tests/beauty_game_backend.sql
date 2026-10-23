-- Local PostgreSQL/PGlite regression suite. No external resources; rolls back fixture data.
-- psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/beauty_game_backend.sql
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
do $$
declare t text;
begin
  assert not has_function_privilege('anon','public.beauty_game_command(text,text,jsonb)','execute');
  assert not has_function_privilege('authenticated','public.beauty_game_command(text,text,jsonb)','execute');
  assert has_function_privilege('service_role','public.beauty_game_command(text,text,jsonb)','execute');
  assert (select not prosecdef from pg_proc where oid='public.beauty_game_command(text,text,jsonb)'::regprocedure);
  foreach t in array array['session_creation_budget','sessions','events','answers','experiences','reflections','shares'] loop
    assert not has_table_privilege('anon','beauty_game.'||t,'select');
    assert not has_table_privilege('authenticated','beauty_game.'||t,'insert');
    assert (select relrowsecurity from pg_class where oid=('beauty_game.'||t)::regclass);
  end loop;
  assert not has_table_privilege('service_role','beauty_game.shares','update'), 'immutable share ACL';
end $$;
set local role service_role;
do $$
declare
  a text := repeat('a',64); b text := repeat('b',64); c text := repeat('c',64);
  play text := '10000000-0000-4000-8000-000000000001';
  p jsonb; q jsonb; r jsonb; sid text; sid2 text; d text; action text; sealed timestamptz;
begin
  assert public.beauty_game_command('answer',a,'{}')->>'status' = '401';
  assert public.beauty_game_command('session','unsigned-device','{}')->>'status' = '400';
  r := public.beauty_game_command('session',a,'{}'); d := r->>'device_id';
  assert r->>'ok' = 'true' and d is not null;
  assert public.beauty_game_command('session',a,'{}')->>'device_id' = d;
  assert public.beauty_game_command('session',b,'{}')->>'device_id' <> d;
  p := jsonb_build_object('play',play,'character','muse','test',false,'version','v1','product','serum','reason','{"reasons":["calming","light"],"shade":"pink","advice":"dab","note":"PRIVATE SECRET","extra":"SECRET EXTRA"}');
  assert public.beauty_game_command('answer',a,p)->>'ok' = 'true';
  assert public.beauty_game_command('answer',a,p)->>'ok' = 'true';
  assert (select count(*) = 1 from beauty_game.answers), 'answer upsert';
  assert public.beauty_game_command('answer',a,p || '{"reason":"not-json"}')->>'status' = '400';
  assert (select reason->>'note' = 'PRIVATE SECRET' from beauty_game.answers);
  assert public.beauty_game_command('answer',a,p || jsonb_build_object('reason','{"reasons":[{"note":"secret"}]}'))->>'status' = '400', 'structured reason cannot leak data';
  q := jsonb_build_object('play',play,'character','muse','test',false,'snapshot',jsonb_build_object('title','Story'),'channel','copy');
  assert public.beauty_game_command('share',b,q)->>'status' = '409', 'cannot share someone else answer';
  r := public.beauty_game_command('share',a,q); sid := r->>'id';
  assert sid is not null;
  assert public.beauty_game_command('share',a,q || '{"channel":"native"}')->>'id' = sid, 'same content reuses share';
  r := public.beauty_game_command('invite',b,jsonb_build_object('id',sid));
  assert not (r ? 'product') and not (r ? 'reason') and r->'snapshot' = q->'snapshot';
  assert public.beauty_game_command('invite',b,jsonb_build_object('id',sid,'play',play,'reveal',true))->>'status' = '403';
  assert public.beauty_game_command('answer',b,p || '{"character":"other"}')->>'ok' = 'true';
  assert public.beauty_game_command('invite',b,jsonb_build_object('id',sid,'play',play,'reveal',true))->>'status' = '403', 'character gate';
  assert public.beauty_game_command('answer',b,p || '{"test":true}')->>'ok' = 'true';
  assert public.beauty_game_command('invite',b,jsonb_build_object('id',sid,'play',play,'reveal',true))->>'status' = '403', 'test cohort gate';
  assert public.beauty_game_command('answer',b,p)->>'ok' = 'true';
  r := public.beauty_game_command('invite',b,jsonb_build_object('id',sid,'play',play,'reveal',true));
  assert r->>'product' = 'serum' and r->>'reason' = 'calming, light' and r->>'shade' = 'pink';
  assert r::text not like '%SECRET%', 'private note/unknown field excluded';
  assert public.beauty_game_command('answer',a,p || '{"product":"cream"}')->>'ok' = 'true';
  assert public.beauty_game_command('invite',b,jsonb_build_object('id',sid,'play',play,'reveal',true))->>'product' = 'serum', 'share frozen';
  sid2 := public.beauty_game_command('share',a,q)->>'id';
  assert sid2 <> sid, 'changed answer new share';
  r := public.beauty_game_command('stats',a,'{"characters":["muse"],"test":false}');
  assert jsonb_array_length(r->'answers') = 2, 'exact stats cohort';
  insert into beauty_game.answers(session_hash,play,character,test,version,product,reason)
    select a,gen_random_uuid(),'large-cohort',false,'v1','serum','{}'::jsonb from generate_series(1,1005);
  r := public.beauty_game_command('stats',a,'{"characters":["large-cohort"],"test":false}');
  assert jsonb_array_length(r->'answers') = 1005, 'stats not silently truncated at 1000';
  q := p || '{"id":"20000000-0000-4000-8000-000000000001","name":"complete","step":"done","source":"game"}';
  assert public.beauty_game_command('event',a,q)->>'ok' = 'true';
  assert public.beauty_game_command('event',a,q)->>'ok' = 'true';
  assert public.beauty_game_command('event',a,q || '{"name":"other"}')->>'status' = '409';
  assert public.beauty_game_command('event',b,q)->>'status' = '409';
  assert (select count(*) = 1 from beauty_game.events);
  assert public.beauty_game_command('experience',a,p || '{"character":"not-answered","experience":"yes"}')->>'status' = '409', 'no orphan experiences';
  assert public.beauty_game_command('experience',a,p || '{"experience":"yes"}')->>'ok' = 'true';
  assert public.beauty_game_command('experience',a,p || '{"experience":"no"}')->>'ok' = 'true';
  assert (select count(*) = 1 from beauty_game.experiences);
  r := public.beauty_game_command('stats',a,'{"characters":["muse"],"test":false}');
  assert (select count(*) = 1 from jsonb_array_elements(r->'answers') value where value->>'experience' = 'no'), 'experience joined on complete owned answer key';
  -- Current answer was changed to cream above. Same-product reason edits keep experience.
  assert public.beauty_game_command('answer',a,p || '{"product":"cream","reason":"{\"reasons\":[\"new reason\"],\"note\":\"edited\"}"}')->>'ok' = 'true';
  assert (select experience = 'no' from beauty_game.experiences where session_hash=a and character='muse'), 'same-product edits preserve experience';
  assert public.beauty_game_command('answer',a,p || '{"product":"new-product"}')->>'ok' = 'true';
  assert not exists (select 1 from beauty_game.experiences where session_hash=a and character='muse'), 'product change clears stale experience';
  r := public.beauty_game_command('stats',a,'{"characters":["muse"],"test":false}');
  assert (select value->'experience' = 'null'::jsonb from jsonb_array_elements(r->'answers') value where value->>'product'='new-product'), 'new product not counted as previously experienced';
  q := p || '{"mode":"reflect","body":"private text","criteria":["fit"],"language":"ko"}';
  assert public.beauty_game_command('reflection',a,q)->>'ok' = 'true';
  assert public.beauty_game_command('reflection',a,q || '{"body":"changed"}')->>'ok' = 'true';
  assert (select count(*) = 1 from beauty_game.reflections);
  assert public.beauty_game_command('link',a,'{"user_id":"00000000-0000-4000-8000-000000000001","consent":false}')->>'status' = '400';
  assert public.beauty_game_command('link',a,'{"user_id":"00000000-0000-4000-8000-000000000099","consent":true}')->>'status' = '400', 'link unknown auth user fails without raw FK detail';
  assert public.beauty_game_command('link',a,'{"user_id":"00000000-0000-4000-8000-000000000001","consent":true}')->>'ok' = 'true';
  assert public.beauty_game_command('link',a,'{"user_id":"00000000-0000-4000-8000-000000000002","consent":true}')->>'status' = '409';
  select sealed_at into sealed from beauty_game.sessions where session_hash=a;
  assert sealed is not null, 'successful link seals historical session';
  assert public.beauty_game_command('session',a,'{}') = '{"ok":true,"rotate":true}'::jsonb, 'sealed session requests rotation without identity';
  foreach action in array array['answer','experience','event','share','reflection','stats','invite'] loop
    assert public.beauty_game_command(action,a,p)->>'status' = '401', 'sealed session rejects ' || action;
  end loop;
  assert public.beauty_game_command('link',a,'{"user_id":"00000000-0000-4000-8000-000000000001","consent":true}')->>'ok' = 'true', 'same account linkage retry idempotent';
  assert (select sealed_at = sealed and user_id = '00000000-0000-4000-8000-000000000001'::uuid from beauty_game.sessions where session_hash=a), 'retry preserves seal and owner';
  assert public.beauty_game_command('link',a,'{"user_id":"00000000-0000-4000-8000-000000000002","consent":true}')->>'status' = '409', 'another account cannot reclaim sealed history';
  assert (select product = 'new-product' from beauty_game.answers where session_hash=a and character='muse' and not test), 'sealed history unchanged';
  assert (select user_id is null from beauty_game.sessions where session_hash=b), 'link session-scoped';
  assert public.beauty_game_command('answer',b,p || '{"product":"later-anonymous-product"}')->>'ok' = 'true', 'new anonymous session remains writable';
  assert (select user_id is null from beauty_game.sessions where session_hash=b), 'later anonymous play not attributed to linked account';
  perform public.beauty_game_command('session',c,'{}');
  for i in 1..239 loop perform public.beauty_game_command('answer',c,'{"play":"bad"}'); end loop;
  assert public.beauty_game_command('session',c,'{}')->>'status' = '429', 'invalid requests consume persisted quota';
  update beauty_game.sessions set rate_started_at = clock_timestamp() - interval '61 seconds' where session_hash=c;
  assert public.beauty_game_command('session',c,'{}')->>'ok' = 'true', 'quota window resets';
  assert (select rate_count = 1 from beauty_game.sessions where session_hash=c);
  update beauty_game.session_creation_budget set creations=300, window_started_at=clock_timestamp() where singleton;
  assert public.beauty_game_command('session',repeat('d',64),'{}')->>'status' = '429', 'global creation budget';
  assert public.beauty_game_command('session',c,'{}')->>'ok' = 'true', 'existing session unaffected';
  update beauty_game.session_creation_budget set window_started_at=clock_timestamp()-interval '61 seconds' where singleton;
  assert public.beauty_game_command('session',repeat('d',64),'{}')->>'ok' = 'true', 'global creation budget reset';
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.beauty_game_command('session',repeat('e',64),'{}');
    raise exception 'unexpected anonymous RPC access';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from beauty_game.answers;
    raise exception 'unexpected anonymous raw access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'beauty_game_backend: all checks passed' as result;
rollback;
