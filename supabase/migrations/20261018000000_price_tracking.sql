-- Price tracking core: products, offers, change-only observation history.
-- Public price data is readable by anyone; all writes go through the
-- service-role collector via ingest_observation(). See docs/architecture-1000-dau.md §4.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  brand text not null,
  name text not null,
  size text,
  created_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  retailer text not null,
  market char(2) not null,
  currency char(3) not null,
  external_id text not null,
  ean text,
  url text not null check (url like 'https://%'),
  affiliate_url text check (affiliate_url like 'https://%'),
  image_url text check (image_url like 'https://%'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (retailer, market, external_id)
);
create index offers_product_id_idx on public.offers (product_id);

-- One row per observed change. Identical re-collections only touch offer_current.
create table public.price_observations (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.offers (id) on delete cascade,
  observed_at timestamptz not null,
  amount_minor bigint not null check (amount_minor > 0),
  delivery_minor bigint check (delivery_minor >= 0),
  availability text not null check (availability in ('in_stock', 'out_of_stock', 'unknown')),
  fingerprint text not null,
  source text not null,
  unique (offer_id, observed_at)
);
create index price_observations_offer_time_idx on public.price_observations (offer_id, observed_at desc);

-- Last successful price is kept apart from the last attempt so stale data stays visible.
create table public.offer_current (
  offer_id uuid primary key references public.offers (id) on delete cascade,
  amount_minor bigint not null,
  delivery_minor bigint,
  availability text not null,
  fingerprint text not null,
  changed_at timestamptz not null,
  last_success_at timestamptz not null,
  last_attempt_at timestamptz not null,
  last_error text
);

alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.price_observations enable row level security;
alter table public.offer_current enable row level security;

revoke all on public.products, public.offers, public.price_observations, public.offer_current from anon, authenticated;
grant select on public.products, public.offers, public.price_observations, public.offer_current to anon, authenticated;

create policy "public read" on public.products for select using (true);
create policy "public read" on public.offers for select using (active);
create policy "public read" on public.price_observations for select using (true);
create policy "public read" on public.offer_current for select using (true);

-- Atomic ingest: refresh offer_current, append history only when the fingerprint changed.
-- Older collections never overwrite a newer latest price.
create function public.ingest_observation(
  p_offer_id uuid,
  p_observed_at timestamptz,
  p_amount_minor bigint,
  p_delivery_minor bigint,
  p_availability text,
  p_fingerprint text,
  p_source text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cur public.offer_current;
begin
  select * into cur from public.offer_current where offer_id = p_offer_id for update;
  if found and p_observed_at < cur.last_success_at then
    raise exception 'Older collection cannot replace latest';
  end if;
  if found and cur.fingerprint = p_fingerprint then
    update public.offer_current
      set last_success_at = p_observed_at, last_attempt_at = p_observed_at, last_error = null
      where offer_id = p_offer_id;
    return false;
  end if;
  insert into public.price_observations
    (offer_id, observed_at, amount_minor, delivery_minor, availability, fingerprint, source)
    values (p_offer_id, p_observed_at, p_amount_minor, p_delivery_minor, p_availability, p_fingerprint, p_source);
  insert into public.offer_current
    (offer_id, amount_minor, delivery_minor, availability, fingerprint, changed_at, last_success_at, last_attempt_at)
    values (p_offer_id, p_amount_minor, p_delivery_minor, p_availability, p_fingerprint, p_observed_at, p_observed_at, p_observed_at)
    on conflict (offer_id) do update set
      amount_minor = excluded.amount_minor, delivery_minor = excluded.delivery_minor,
      availability = excluded.availability, fingerprint = excluded.fingerprint,
      changed_at = excluded.changed_at, last_success_at = excluded.last_success_at,
      last_attempt_at = excluded.last_attempt_at, last_error = null;
  return true;
end;
$$;

revoke execute on function public.ingest_observation(uuid, timestamptz, bigint, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.ingest_observation(uuid, timestamptz, bigint, bigint, text, text, text) to service_role;
