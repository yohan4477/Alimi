-- Forward integration for PR #143, after 20261023084934_room_lifecycle_and_tags.sql.
begin;
-- Structured voluntary room responses. No LLM, no profile copying, no demo inserts.
create table if not exists public.room_experiences (
  room_id text not null references public.chat_rooms(id),
  product_key text not null check(char_length(product_key) between 1 and 200),
  author_tag text not null,
  status text not null check(status in ('using','used','curious')),
  period text not null default '' check(period in ('','trial','short','weeks','months')),
  repeat text not null default '' check(repeat in ('','first','again','third')),
  skin text not null default '' check(skin in ('','oily','dry','combination','sensitive','normal')),
  opinion text not null default '' check(opinion in ('','recommend','mixed','regret')),
  reasons text[] not null default '{}' check(reasons <@ array['moisture','light','lasting','sticky','heavy','irritation']::text[] and cardinality(reasons)<=6),
  concerns text[] not null default '{}' check(concerns <@ array['dry','acne','pores','sensitive','base','lip']::text[] and cardinality(concerns)<=6),
  source_message bigint references public.chat_messages(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(room_id,product_key,author_tag),
  check(status <> 'curious' or (period='' and repeat='' and opinion='' and cardinality(reasons)=0))
);
alter table public.room_experiences enable row level security;
revoke all on public.room_experiences from public,anon,authenticated;
-- Only these deliberately public, voluntarily submitted fields may be read.
-- Existing/private future columns never inherit a blanket SELECT grant.
grant select(room_id,product_key,author_tag,status,period,repeat,skin,opinion,reasons,concerns,source_message,updated_at) on public.room_experiences to anon,authenticated;
create index if not exists room_experiences_read_idx on public.room_experiences(room_id,author_tag,product_key);
create index if not exists room_experiences_author_idx on public.room_experiences(author_tag);
do $policy$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='room_experiences' and policyname='read voluntary responses in active rooms') then
    create policy "read voluntary responses in active rooms" on public.room_experiences
      for select to anon,authenticated using(exists(select 1 from public.chat_rooms r where r.id=room_id and r.active));
  end if;
end $policy$;
-- Preserve existing policies while ensuring no other permissive policy reveals inactive rooms.
drop policy if exists room_experience_visibility_guard on public.room_experiences;
create policy room_experience_visibility_guard on public.room_experiences as restrictive for select to anon,authenticated
  using(exists(select 1 from public.chat_rooms r where r.id=room_id and r.active));

-- Keep privilege escalation outside the exposed schema. This app uses its existing
-- anonymous device-secret ownership model (chat_tag), not an auth.uid identity.
create schema if not exists room_experience_private;
revoke all on schema room_experience_private from public;
grant usage on schema room_experience_private to anon,authenticated;
create table if not exists room_experience_private.write_budgets (
  author_tag text primary key, minute_start timestamptz not null,
  minute_count integer not null, day_start timestamptz not null, day_count integer not null
);
alter table room_experience_private.write_budgets enable row level security;
revoke all on room_experience_private.write_budgets from public,anon,authenticated;
create or replace function room_experience_private.set_response(p_secret text,p_room text,p_product text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_tag text:=public.room_ownership_tag(p_secret);
  v_source bigint;
  v_row public.room_experiences;
  v_status text:=p_value->>'status';
  v_budget room_experience_private.write_budgets;
begin
  if exists(select 1 from public.chat_bans where author_tag=v_tag) then raise exception 'chat:banned'; end if;
  -- Same room lock as close/delete/participation: an upsert cannot bypass closure.
  perform 1 from public.chat_rooms where id=p_room and active and status='active' for update;
  if not found then raise exception 'chat:room'; end if;
  if p_product is null or char_length(p_product) not between 1 and 200 then raise exception 'chat:item'; end if;
  if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text)>4096 then raise exception 'chat:long'; end if;
  if v_status is null or v_status not in ('using','used','curious') then raise exception 'chat:experience'; end if;
  if jsonb_typeof(coalesce(p_value->'reasons','[]'))<>'array' or jsonb_typeof(coalesce(p_value->'concerns','[]'))<>'array' then raise exception 'chat:experience'; end if;
  if jsonb_array_length(coalesce(p_value->'reasons','[]'))>6 or jsonb_array_length(coalesce(p_value->'concerns','[]'))>6 then raise exception 'chat:experience'; end if;
  if nullif(p_value->>'source_message','') is not null and (p_value->>'source_message') !~ '^[0-9]{1,18}$' then raise exception 'chat:reply'; end if;
  v_source:=nullif(p_value->>'source_message','')::bigint;
  -- Persisted per-device write limits serialize across rooms and include replacements.
  insert into room_experience_private.write_budgets values(v_tag,now(),0,now(),0) on conflict do nothing;
  select * into v_budget from room_experience_private.write_budgets where author_tag=v_tag for update;
  if v_budget.minute_start <= now()-interval '1 minute' then v_budget.minute_start:=now();v_budget.minute_count:=0;end if;
  if v_budget.day_start <= now()-interval '24 hours' then v_budget.day_start:=now();v_budget.day_count:=0;end if;
  if v_budget.minute_count>=12 or v_budget.day_count>=240 then raise exception 'chat:slow'; end if;
  update room_experience_private.write_budgets set minute_start=v_budget.minute_start,minute_count=v_budget.minute_count+1,
    day_start=v_budget.day_start,day_count=v_budget.day_count+1 where author_tag=v_tag;
  if not exists(select 1 from public.room_experiences where room_id=p_room and product_key=p_product and author_tag=v_tag) then
    if (select count(*) from public.room_experiences where author_tag=v_tag)>=100 or
       (select count(*) from public.room_experiences where room_id=p_room)>=10000 then raise exception 'chat:slow'; end if;
  end if;
  -- A product must actually have been attached in this room; arbitrary labels cannot become products.
  if not exists(select 1 from public.chat_messages m where m.room_id=p_room and not m.hidden
    and coalesce(m.item->>'family_key',(m.item->>'retailer')||':'||(m.item->>'market')||':'||(m.item->>'sku'))=p_product)
    then raise exception 'chat:item'; end if;
  -- Evidence links must be the caller's own visible message, in this room, about this product.
  if v_source is not null and not exists(select 1 from public.chat_messages m
    where m.id=v_source and m.room_id=p_room and m.author_tag=v_tag and not m.hidden
      and coalesce(m.item->>'family_key',(m.item->>'retailer')||':'||(m.item->>'market')||':'||(m.item->>'sku'))=p_product)
    then raise exception 'chat:reply'; end if;
  insert into public.chat_members(room_id,author_tag) values(p_room,v_tag) on conflict do nothing;
  insert into public.room_experiences(room_id,product_key,author_tag,status,period,repeat,skin,opinion,reasons,concerns,source_message)
    values(p_room,p_product,v_tag,v_status,
      case when v_status='curious' then '' else coalesce(p_value->>'period','') end,
      case when v_status='curious' then '' else coalesce(p_value->>'repeat','') end,
      coalesce(p_value->>'skin',''),
      case when v_status='curious' then '' else coalesce(p_value->>'opinion','') end,
      case when v_status='curious' then '{}' else array(select distinct jsonb_array_elements_text(coalesce(p_value->'reasons','[]'))) end,
      array(select distinct jsonb_array_elements_text(coalesce(p_value->'concerns','[]'))),v_source)
    on conflict(room_id,product_key,author_tag) do update set
      status=excluded.status,period=excluded.period,repeat=excluded.repeat,skin=excluded.skin,
      opinion=excluded.opinion,reasons=excluded.reasons,concerns=excluded.concerns,
      source_message=excluded.source_message,updated_at=now()
    returning * into v_row;
  return jsonb_build_object('room_id',v_row.room_id,'product_key',v_row.product_key,'author_tag',v_row.author_tag,
    'status',v_row.status,'period',v_row.period,'repeat',v_row.repeat,'skin',v_row.skin,'opinion',v_row.opinion,
    'reasons',v_row.reasons,'concerns',v_row.concerns,'source_message',v_row.source_message,'updated_at',v_row.updated_at);
end;
$$;
create or replace function room_experience_private.delete_response(p_secret text,p_room text,p_product text)
returns void language sql security definer set search_path='' as $$
  delete from public.room_experiences where author_tag=public.room_ownership_tag(p_secret) and room_id=p_room and product_key=p_product;
$$;
create or replace function public.set_room_experience(p_secret text,p_room text,p_product text,p_value jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select room_experience_private.set_response(p_secret,p_room,p_product,p_value);
$$;
create or replace function public.delete_room_experience(p_secret text,p_room text,p_product text)
returns void language sql security invoker set search_path='' as $$
  select room_experience_private.delete_response(p_secret,p_room,p_product);
$$;
revoke all on function room_experience_private.set_response(text,text,text,jsonb),room_experience_private.delete_response(text,text,text),
  public.set_room_experience(text,text,text,jsonb),public.delete_room_experience(text,text,text) from public;
grant execute on function room_experience_private.set_response(text,text,text,jsonb),room_experience_private.delete_response(text,text,text),
  public.set_room_experience(text,text,text,jsonb),public.delete_room_experience(text,text,text) to anon,authenticated;

notify pgrst, 'reload schema';
commit;
