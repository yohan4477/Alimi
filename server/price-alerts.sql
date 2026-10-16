-- Reviewed schema proposal, NOT applied. Generate a Supabase migration after project selection.
-- Never apply to an unrelated project. All worker functions are service_role-only, SECURITY INVOKER.
create table public.alimi_quotes (
  product_id text primary key check (product_id = '2'),
  amount_cents integer not null check (amount_cents between 1 and 1000000),
  collected_at timestamptz not null,
  in_stock boolean not null
);
create table public.alimi_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null check (token ~ '^[a-f0-9]+$' and length(token) between 32 and 256),
  environment text not null check (environment in ('sandbox','production')),
  time_zone text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.alimi_watches (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.alimi_quotes(product_id),
  enabled boolean not null default true,
  baseline_cents integer,
  primary key(user_id, product_id)
);
create table public.alimi_delivery_state (
  user_id uuid not null,
  product_id text not null,
  last_accepted_cents integer,
  pending_cents integer,
  claim_id uuid,
  lease_until timestamptz,
  status text not null default 'idle' check(status in ('idle','sending','accepted','failed','unknown')),
  updated_at timestamptz not null default now(),
  primary key(user_id,product_id),
  foreign key(user_id,product_id) references public.alimi_watches(user_id,product_id) on delete cascade
);
alter table public.alimi_quotes enable row level security;
alter table public.alimi_devices enable row level security;
alter table public.alimi_watches enable row level security;
alter table public.alimi_delivery_state enable row level security;
revoke all on public.alimi_quotes,public.alimi_devices,public.alimi_watches,public.alimi_delivery_state from anon,authenticated;
grant select on public.alimi_quotes to authenticated;
grant select,insert,update,delete on public.alimi_devices to authenticated;
grant select,delete on public.alimi_watches to authenticated;
grant insert(user_id,product_id,enabled),update(enabled) on public.alimi_watches to authenticated;
grant all on public.alimi_quotes,public.alimi_devices,public.alimi_watches,public.alimi_delivery_state to service_role;
create policy quotes_read on public.alimi_quotes for select to authenticated using(true);
create policy device_owner on public.alimi_devices for all to authenticated
  using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy watch_owner on public.alimi_watches for all to authenticated
  using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
-- No client policy/grant for delivery state; clients cannot forge accepted prices or claims.
create function public.alimi_watch_baseline() returns trigger language plpgsql security invoker
set search_path='' as $$
begin
  select q.amount_cents into new.baseline_cents from public.alimi_quotes q where q.product_id=new.product_id;
  return new;
end $$;
revoke execute on function public.alimi_watch_baseline() from public,anon,authenticated;
create trigger watch_baseline before insert on public.alimi_watches for each row execute function public.alimi_watch_baseline();

create function public.alimi_claim_alerts() returns table(
  user_id uuid, product_id text, token text, environment text, time_zone text,
  amount_cents integer, baseline_cents integer, last_accepted_cents integer, claim_id uuid)
language plpgsql security invoker set search_path='' as $$
begin
  -- Serializes workers even if invoked outside the Actions concurrency group.
  perform pg_advisory_xact_lock(3125007,111294);
  return query
  with eligible as (
    select w.user_id,w.product_id,d.token,d.environment,d.time_zone,q.amount_cents,w.baseline_cents,
      s.last_accepted_cents
    from public.alimi_watches w
    join public.alimi_devices d on d.user_id=w.user_id
    join public.alimi_quotes q on q.product_id=w.product_id
    left join public.alimi_delivery_state s on s.user_id=w.user_id and s.product_id=w.product_id
    where w.enabled and d.enabled and q.in_stock
      and q.collected_at between now()-interval '2 hours' and now()+interval '1 minute'
      and q.amount_cents::bigint*100 <= coalesce(s.last_accepted_cents,w.baseline_cents)::bigint*95
      and exists(select 1 from pg_timezone_names z where z.name=d.time_zone)
      and extract(hour from now() at time zone case when exists(select 1 from pg_timezone_names z where z.name=d.time_zone) then d.time_zone else 'UTC' end) between 8 and 21
      and (s.status is null or s.status in ('idle','accepted','failed'))
    order by w.user_id,w.product_id limit 100
  ), claimed as (
    insert into public.alimi_delivery_state as state(user_id,product_id,pending_cents,claim_id,lease_until,status)
      select e.user_id,e.product_id,e.amount_cents,gen_random_uuid(),now()+interval '10 minutes','sending' from eligible e
    on conflict on constraint alimi_delivery_state_pkey do update
      set pending_cents=excluded.pending_cents,claim_id=excluded.claim_id,lease_until=excluded.lease_until,
        status='sending',updated_at=now()
    returning state.*
  )
  select e.user_id,e.product_id,e.token,e.environment,e.time_zone,e.amount_cents,e.baseline_cents,
    e.last_accepted_cents,c.claim_id from eligible e join claimed c using(user_id,product_id);
  -- Expired sending/unknown claims intentionally require operator reconciliation: no blind duplicate retry.
end $$;
revoke all on function public.alimi_claim_alerts() from public,anon,authenticated;
grant execute on function public.alimi_claim_alerts() to service_role;

create function public.alimi_finish_alert(p_user uuid,p_product text,p_claim uuid,p_status text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('accepted','failed','unknown') then raise exception 'Invalid result'; end if;
  update public.alimi_delivery_state set status=p_status,
    last_accepted_cents=case when p_status='accepted' then pending_cents else last_accepted_cents end,
    updated_at=now()
    where user_id=p_user and product_id=p_product and claim_id=p_claim and status='sending';
end $$;
revoke all on function public.alimi_finish_alert(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.alimi_finish_alert(uuid,text,uuid,text) to service_role;

create function public.alimi_ingest_quote(p_quote jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_quote->>'product_id' <> '2' or (p_quote->>'collected_at')::timestamptz not between now()-interval '2 hours' and now()+interval '1 minute' then
    raise exception 'Invalid quote identity or time';
  end if;
  insert into public.alimi_quotes as q(product_id,amount_cents,collected_at,in_stock)
  values(p_quote->>'product_id',(p_quote->>'amount_cents')::integer,(p_quote->>'collected_at')::timestamptz,(p_quote->>'in_stock')::boolean)
  on conflict(product_id) do update set amount_cents=excluded.amount_cents,collected_at=excluded.collected_at,in_stock=excluded.in_stock
  where excluded.collected_at > q.collected_at;
end $$;
revoke all on function public.alimi_ingest_quote(jsonb) from public,anon,authenticated;
grant execute on function public.alimi_ingest_quote(jsonb) to service_role;
