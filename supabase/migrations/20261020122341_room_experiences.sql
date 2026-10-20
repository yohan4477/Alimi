-- Structured voluntary room responses. No LLM, no profile copying, no demo inserts.
create table public.room_experiences (
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
revoke all on public.room_experiences from anon,authenticated;
grant select on public.room_experiences to anon,authenticated;
create policy "read voluntary responses in active rooms" on public.room_experiences
  for select to anon,authenticated using(exists(select 1 from public.chat_rooms r where r.id=room_id and r.active));

-- Keep privilege escalation outside the exposed schema. This app uses its existing
-- anonymous device-secret ownership model (chat_tag), not an auth.uid identity.
create schema if not exists room_experience_private;
revoke all on schema room_experience_private from public;
grant usage on schema room_experience_private to anon,authenticated;
create function room_experience_private.set_response(p_secret text,p_room text,p_product text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_tag text:=public.chat_tag(p_secret);
  v_source bigint:=nullif(p_value->>'source_message','')::bigint;
  v_row public.room_experiences;
  v_status text:=p_value->>'status';
begin
  if exists(select 1 from public.chat_bans where author_tag=v_tag) then raise exception 'chat:banned'; end if;
  if not exists(select 1 from public.chat_rooms where id=p_room and active) then raise exception 'chat:room'; end if;
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
  return to_jsonb(v_row);
end;
$$;
create function room_experience_private.delete_response(p_secret text,p_room text,p_product text)
returns void language sql security definer set search_path='' as $$
  delete from public.room_experiences where author_tag=public.chat_tag(p_secret) and room_id=p_room and product_key=p_product;
$$;
create function public.set_room_experience(p_secret text,p_room text,p_product text,p_value jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select room_experience_private.set_response(p_secret,p_room,p_product,p_value);
$$;
create function public.delete_room_experience(p_secret text,p_room text,p_product text)
returns void language sql security invoker set search_path='' as $$
  select room_experience_private.delete_response(p_secret,p_room,p_product);
$$;
revoke all on function room_experience_private.set_response(text,text,text,jsonb),room_experience_private.delete_response(text,text,text),
  public.set_room_experience(text,text,text,jsonb),public.delete_room_experience(text,text,text) from public;
grant execute on function room_experience_private.set_response(text,text,text,jsonb),room_experience_private.delete_response(text,text,text),
  public.set_room_experience(text,text,text,jsonb),public.delete_room_experience(text,text,text) to anon,authenticated;
