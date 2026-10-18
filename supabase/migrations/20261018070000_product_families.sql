-- Product families: sizes / shades of the same product grouped by family_key (scripts/catalog-variants.mjs),
-- with a unit price so sizes can be compared. Computed by the collector, stored here.

alter table public.catalog_items
  add column family_key text, add column base_name text, add column size_label text,
  add column option_label text, add column unit text, add column quantity numeric, add column unit_price_minor bigint;
alter table public.products add column family_key text, add column size_label text;
create index catalog_items_family_idx on public.catalog_items (family_key) where active;

-- One row per family for home browsing. security_invoker keeps catalog_items' RLS (active rows only).
create view public.catalog_families with (security_invoker = true) as
  select family_key,
    min(brand) as brand, min(brand_ko) as brand_ko, min(base_name) as base_name, min(category) as category,
    (array_agg(image_url order by price_minor) filter (where image_url is not null))[1] as image_url,
    min(price_minor) as min_price_minor, max(price_minor) as max_price_minor,
    count(*) as variants, min(unit_price_minor) as best_unit_price_minor, max(sku) as sort_key
  from public.catalog_items
  where active and family_key is not null
  group by family_key;
grant select on public.catalog_families to anon, authenticated;

-- request_tracking now also copies family and size so tracked products can show their sibling sizes.
create or replace function public.request_tracking(p_retailer text, p_market text, p_sku text)
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
  insert into public.products (slug, brand, name, category, brand_ko, family_key, size_label)
    values (v_slug, c.brand, c.name, c.category, c.brand_ko, c.family_key, c.size_label)
    on conflict (slug) do update set category = excluded.category, brand_ko = excluded.brand_ko,
      family_key = excluded.family_key, size_label = excluded.size_label
    returning id into v_product;
  insert into public.offers (product_id, retailer, market, currency, external_id, ean, url, affiliate_url, image_url)
    values (v_product, c.retailer, c.market, c.currency, c.sku, c.ean, c.url, c.affiliate_url, c.image_url)
    returning id into v_offer;
  perform public.ingest_observation(v_offer, c.seen_at, c.price_minor, c.delivery_minor, c.availability,
    md5(c.price_minor::text || '|' || c.availability || '|' || coalesce(c.delivery_minor::text, '')), 'catalog');
  return v_slug;
end;
$$;
