-- Catalog layer (D-010): the whole official feed, current price only, overwritten daily. No history.
-- Tracking layer stays in offers / price_observations.

create table public.catalog_items (
  retailer text not null,
  market char(2) not null,
  sku text not null,
  currency char(3) not null,
  ean text,
  brand text not null,
  name text not null,
  price_minor bigint not null check (price_minor > 0),
  delivery_minor bigint check (delivery_minor >= 0),
  availability text not null check (availability in ('in_stock', 'out_of_stock', 'unknown')),
  url text not null check (url like 'https://%'),
  affiliate_url text check (affiliate_url like 'https://%'),
  image_url text check (image_url like 'https://%'),
  seen_at timestamptz not null,
  active boolean not null default true,
  primary key (retailer, market, sku)
);
create index catalog_items_active_brand_idx on public.catalog_items (active, brand);

alter table public.catalog_items enable row level security;
revoke all on public.catalog_items from anon, authenticated;
grant select on public.catalog_items to anon, authenticated;
create policy "public read" on public.catalog_items for select using (active);

-- Moves a catalog item into the tracking layer (user tapped the heart). Bounded to items that exist in the
-- official catalog, so callers cannot create arbitrary offers. Idempotent; returns the product slug.
create function public.request_tracking(p_retailer text, p_market text, p_sku text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.catalog_items;
  v_slug text;
  v_product uuid;
  v_offer uuid;
begin
  select * into c from public.catalog_items
    where retailer = p_retailer and market = p_market and sku = p_sku and active;
  if not found then raise exception 'Not in catalog'; end if;

  select p.slug into v_slug from public.offers o join public.products p on p.id = o.product_id
    where o.retailer = c.retailer and o.market = c.market and o.external_id = c.sku;
  if found then return v_slug; end if;

  v_slug := 'sv-' || lower(c.market) || '-' || regexp_replace(c.sku, '[^a-zA-Z0-9]', '', 'g');
  insert into public.products (slug, brand, name) values (v_slug, c.brand, c.name)
    on conflict (slug) do update set slug = excluded.slug returning id into v_product;
  insert into public.offers (product_id, retailer, market, currency, external_id, ean, url, affiliate_url, image_url)
    values (v_product, c.retailer, c.market, c.currency, c.sku, c.ean, c.url, c.affiliate_url, c.image_url)
    returning id into v_offer;
  perform public.ingest_observation(v_offer, c.seen_at, c.price_minor, c.delivery_minor, c.availability,
    md5(c.price_minor::text || '|' || c.availability || '|' || coalesce(c.delivery_minor::text, '')), 'catalog');
  return v_slug;
end;
$$;

revoke execute on function public.request_tracking(text, text, text) from public;
grant execute on function public.request_tracking(text, text, text) to anon, authenticated, service_role;

-- Different writers (feed collector, request_tracking) compute different fingerprints, so "changed"
-- now compares the observed values themselves. Same price/delivery/stock = no new history row.
create or replace function public.ingest_observation(
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
  if found and cur.amount_minor = p_amount_minor and cur.availability = p_availability
     and cur.delivery_minor is not distinct from p_delivery_minor then
    update public.offer_current
      set last_success_at = p_observed_at, last_attempt_at = p_observed_at, last_error = null, fingerprint = p_fingerprint
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
