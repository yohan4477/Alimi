-- Additive readiness migration. Apply only after verifying the existing project ledger.
begin;
alter table public.owned_product_votes add column if not exists test boolean not null default false;
alter table public.owned_product_votes add column if not exists option_id text;
alter table public.owned_product_votes drop constraint if exists owned_product_votes_product_id_voter_id_key;
create unique index if not exists owned_product_votes_product_voter_test_idx on public.owned_product_votes(product_id,voter_id,test);
alter table public.owned_product_votes enable row level security;
revoke all on public.owned_product_votes from public,anon,authenticated;
grant select,insert,update on public.owned_product_votes to service_role;
create table beauty_game.ownership_events (
 id uuid primary key, voter_id uuid not null, run uuid not null,
 product_id text not null check (length(product_id) between 1 and 80),
 name text not null check (name in ('view','explore','skip_followup')),
 test boolean not null, created_at timestamptz not null default now()
);
alter table beauty_game.ownership_events enable row level security;
revoke all on beauty_game.ownership_events from public,anon,authenticated;
grant select,insert on beauty_game.ownership_events to service_role;
create index ownership_events_period on beauty_game.ownership_events(test,created_at);
create function public.record_owned_poll_event(p_id uuid,p_voter uuid,p_run uuid,p_product text,p_name text,p_test boolean)
returns jsonb language sql security invoker set search_path='' as $$
 with inserted as (insert into beauty_game.ownership_events(id,voter_id,run,product_id,name,test)
 values(p_id,p_voter,p_run,p_product,p_name,p_test) on conflict do nothing returning id)
 select jsonb_build_object('ok',true);
$$;
revoke all on function public.record_owned_poll_event(uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_owned_poll_event(uuid,uuid,uuid,text,text,boolean) to service_role;
create function public.beauty_operations_metrics(p_test boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
 with events as (select * from beauty_game.events where created_at>=now()-interval '7 days' and payload->'test'=to_jsonb(p_test)),
 answers as (select * from beauty_game.answers where test=p_test and updated_at>=now()-interval '7 days'),
 shares as (select * from beauty_game.shares where test=p_test and created_at>=now()-interval '7 days'),
 votes as (select * from public.owned_product_votes where test=p_test and updated_at>=now()-interval '7 days'),
 poll_events as (select * from beauty_game.ownership_events where test=p_test and created_at>=now()-interval '7 days'),
 repeat_voters as (select voter_id from votes group by voter_id having count(distinct product_id)>1)
 select jsonb_build_object(
 'game',jsonb_build_object('observations',(select count(*) from events)+(select count(*) from answers)+(select count(*) from shares),
 'started',(select count(distinct(session_hash,payload->>'play')) from events where payload->>'name'='game_start'),
 'completed',(select count(*) from answers),'shared',(select count(distinct(session_hash,play)) from shares),
 'inviteOpened',(select count(distinct(session_hash,payload->>'play')) from events where payload->>'name'='invite_open'),
 'compared',(select count(distinct(session_hash,payload->>'play')) from events where payload->>'name'='comparison_view')),
 'ownership',jsonb_build_object('responses',(select count(*) from votes),'participants',(select count(distinct voter_id) from votes),
 'followups',(select count(*) from votes where followup is not null),'multiProductParticipants',(select count(*) from repeat_voters),
 'visits',(select count(distinct(voter_id,run)) from poll_events where name='view'),
 'exploredVisits',(select count(distinct(e.voter_id,e.run)) from poll_events e where e.name='explore' and exists(select 1 from poll_events v where v.name='view' and v.voter_id=e.voter_id and v.run=e.run))));
$$;
revoke all on function public.beauty_operations_metrics(boolean) from public,anon,authenticated;
grant execute on function public.beauty_operations_metrics(boolean) to service_role;
commit;
