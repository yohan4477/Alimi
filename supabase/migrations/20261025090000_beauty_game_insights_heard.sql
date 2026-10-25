-- Adds the 'heard' segment: each person's own latest answer to "where did you hear about us?"
-- (heard_from events, slug in step), or 'unanswered'. Same output otherwise; still counts only.
begin;
create or replace function public.beauty_game_insights(p_test boolean default false, p_days integer default 7)
returns jsonb language sql stable security invoker set search_path='' as $$
 with period as (select now()-make_interval(days=>greatest(1,least(coalesce(p_days,7),90))) since),
 ev as (
  select e.session_hash, e.payload->>'play' play, e.payload->>'name' name, e.payload->>'step' step,
         coalesce(e.payload->>'entry','unknown') entry, coalesce(e.payload->>'country','unknown') country,
         coalesce(e.payload->>'lang','unknown') lang, e.created_at
  from beauty_game.events e, period where e.created_at>=period.since and e.payload->'test'=to_jsonb(p_test)),
 ans as (select a.session_hash, a.play::text play, a.character, a.product, a.reason
  from beauty_game.answers a, period where a.test=p_test and a.updated_at>=period.since),
 sh as (select s.session_hash, s.play::text play from beauty_game.shares s, period where s.test=p_test and s.created_at>=period.since),
 -- A person is one anonymous game session; their first event of the period says where they came from.
 visit as (select distinct on (session_hash) session_hash, entry, country, lang from ev order by session_hash, created_at),
 steps(ord,key) as (values (1,'landing_view'),(2,'character_view'),(3,'advice_select'),(4,'product_select'),(5,'answer'),
  (6,'result_view'),(7,'share'),(8,'invite_open'),(9,'comparison_view')),
 reached as (select session_hash, play, name key from ev
  union select session_hash, play, 'answer' from ans
  union select session_hash, play, 'share' from sh),
 funnel as (select s.ord, s.key, count(distinct (r.session_hash, r.play)) plays, count(distinct r.session_hash) people
  from steps s left join reached r on r.key=s.key group by s.ord, s.key),
 heard as (select distinct on (session_hash) session_hash, step heard from ev where name='heard_from' order by session_hash, created_at desc),
 people as (select v.*, coalesce((select h.heard from heard h where h.session_hash=v.session_hash),'unanswered') heard, exists(select 1 from ev e where e.session_hash=v.session_hash and e.name='advice_select') started,
  exists(select 1 from ans a where a.session_hash=v.session_hash) completed,
  exists(select 1 from sh where sh.session_hash=v.session_hash) shared from visit v),
 segments as (select d.dim, d.value, count(*) people, count(*) filter (where started) started,
  count(*) filter (where completed) completed, count(*) filter (where shared) shared
  from people cross join lateral (values ('entry',people.entry),('country',people.country),('lang',people.lang),('heard',people.heard)) d(dim,value)
  group by d.dim, d.value),
 choices as (select character, reason->>'advice' advice, product, count(*) n from ans group by 1,2,3),
 reasons as (select r.reason, count(*) n from ans, jsonb_array_elements_text(case when jsonb_typeof(ans.reason->'reasons')='array' then ans.reason->'reasons' else '[]'::jsonb end) r(reason) group by 1),
 brands as (select step brand, count(distinct session_hash) people from ev where name='brand_select' and step<>'all' group by 1)
 select jsonb_build_object(
  'days', greatest(1,least(coalesce(p_days,7),90)),
  'people', (select count(*) from visit),
  'funnel', (select coalesce(jsonb_agg(jsonb_build_object('step',key,'plays',plays,'people',people) order by ord),'[]'::jsonb) from funnel),
  'segments', (select coalesce(jsonb_agg(jsonb_build_object('dimension',dim,'value',value,'people',people,'started',started,'completed',completed,'shared',shared) order by dim, people desc),'[]'::jsonb) from segments),
  'choices', (select coalesce(jsonb_agg(jsonb_build_object('character',character,'advice',advice,'product',product,'n',n) order by n desc),'[]'::jsonb) from choices),
  'reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'n',n) order by n desc),'[]'::jsonb) from reasons),
  'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand',brand,'people',people) order by people desc),'[]'::jsonb) from brands));
$$;
revoke all on function public.beauty_game_insights(boolean,integer) from public,anon,authenticated;
grant execute on function public.beauty_game_insights(boolean,integer) to service_role;
commit;
