-- Server-only API. No anonymous table reads; invitation IDs disclose only opt-in snapshots.
create table public.you_too_answers (
 owner text not null check(owner ~ '^[a-f0-9]{64}$'),
 product text not null check(product in ('romand-tint','torriden-serum','laneige-lip')),
 choice text not null check(choice in ('own','past','never')),
 detail text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(owner,product),
 check(detail is null or
  (choice='own' and detail in ('often','sometimes','rarely','unopened')) or
  (choice='past' and detail in ('finished','part','unused','unsure')) or
  (choice='never' and detail in ('want','unsure','no')))
);
create table public.you_too_invites (
 id uuid primary key default gen_random_uuid(),
 owner text not null,
 product text not null,
 choice text not null,
 detail text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days',
 foreign key(owner,product) references public.you_too_answers(owner,product) on delete cascade
);
create table public.you_too_events (
 id bigint generated always as identity primary key,
 owner text,
 product text,
 event text not null,
 invite uuid,
 created_at timestamptz not null default now()
);
create index you_too_answers_product on public.you_too_answers(product);
create index you_too_invites_owner on public.you_too_invites(owner,created_at desc);
alter table public.you_too_answers enable row level security;
alter table public.you_too_invites enable row level security;
alter table public.you_too_events enable row level security;
revoke all on public.you_too_answers, public.you_too_invites, public.you_too_events from public,anon,authenticated;
grant select,insert,update,delete on public.you_too_answers,public.you_too_invites,public.you_too_events to service_role;
grant usage,select on sequence public.you_too_events_id_seq to service_role;

create function public.you_too_action(p_action text,p_owner text,p_product text,p_choice text,p_detail text,p_invite uuid,p_include_detail boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare answer public.you_too_answers; invitation public.you_too_invites; counts jsonb; details jsonb; old_answer public.you_too_answers;
begin
 if p_action='invite' then
  select * into invitation from public.you_too_invites where id=p_invite and expires_at>now();
  if not found then return null; end if;
  insert into public.you_too_events(owner,product,event,invite) values(p_owner,invitation.product,'invite_open',p_invite);
  return jsonb_build_object('id',invitation.id,'product',invitation.product,'choice',invitation.choice,'detail',invitation.detail);
 end if;
 if p_owner is null or p_owner !~ '^[a-f0-9]{64}$' or p_product is null or p_product not in ('romand-tint','torriden-serum','laneige-lip') then raise exception 'invalid input'; end if;
 -- Serialize mutations per participant to avoid duplicate first-answer events.
 perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
 if p_action='vote' then
  select * into old_answer from public.you_too_answers where owner=p_owner and product=p_product;
  insert into public.you_too_answers(owner,product,choice,detail) values(p_owner,p_product,p_choice,p_detail)
  on conflict(owner,product) do update set choice=excluded.choice,detail=excluded.detail,updated_at=now();
  if p_invite is not null and not exists(select 1 from public.you_too_invites where id=p_invite and product=p_product and expires_at>now()) then p_invite:=null; end if;
  if old_answer.owner is null then
   insert into public.you_too_events(owner,product,event,invite) values(p_owner,p_product,'first_answer',p_invite);
  end if;
  if p_detail is not null and (old_answer.detail is null or old_answer.choice<>p_choice) then
   insert into public.you_too_events(owner,product,event,invite) values(p_owner,p_product,'followup_answer',p_invite);
  end if;
 elsif p_action='share' then
  select * into answer from public.you_too_answers where owner=p_owner and product=p_product;
  if not found then return null; end if;
  -- Reuse identical recent snapshots; retries do not create unlimited links.
  select * into invitation from public.you_too_invites where owner=p_owner and product=p_product and choice=answer.choice
   and detail is not distinct from (case when p_include_detail then answer.detail else null end)
   and expires_at>now()+interval '29 days' order by created_at desc limit 1;
  if not found then
   insert into public.you_too_invites(owner,product,choice,detail)
    values(p_owner,p_product,answer.choice,case when p_include_detail then answer.detail else null end) returning * into invitation;
   insert into public.you_too_events(owner,product,event,invite) values(p_owner,p_product,'share_created',invitation.id);
  end if;
  return jsonb_build_object('id',invitation.id);
 elsif p_action='read' then
  insert into public.you_too_events(owner,product,event) values(p_owner,p_product,'product_view');
 else raise exception 'invalid action';
 end if;
 select * into answer from public.you_too_answers where owner=p_owner and product=p_product;
 select coalesce(jsonb_object_agg(c,n),'{}'::jsonb) into counts from (
  select choice c,count(*) n from public.you_too_answers where product=p_product group by choice) s;
 select coalesce(jsonb_object_agg(c,d),'{}'::jsonb) into details from (
  select c,jsonb_object_agg(k,n) d from (
   select choice c,detail k,count(*) n from public.you_too_answers where product=p_product and detail is not null group by choice,detail
  ) s group by c
 ) s;
 return jsonb_build_object('mine',case when answer.owner is null then null else jsonb_build_object('choice',answer.choice,'detail',answer.detail) end,'counts',counts,'details',details);
end $$;
revoke all on function public.you_too_action(text,text,text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.you_too_action(text,text,text,text,text,uuid,boolean) to service_role;
