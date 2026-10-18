-- Category and Korean brand label are computed once by the collector (scripts/catalog-taxonomy.mjs) and
-- stored, so web, iOS and the collector never disagree. Non-Korean brands are not stored in the catalog.

alter table public.catalog_items add column category text, add column brand_ko text;
alter table public.products add column category text, add column brand_ko text;
create index catalog_items_active_category_idx on public.catalog_items (active, category);

-- Same RPC as before; now also copies category and Korean brand label into the tracking layer.
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
  insert into public.products (slug, brand, name, category, brand_ko) values (v_slug, c.brand, c.name, c.category, c.brand_ko)
    on conflict (slug) do update set category = excluded.category, brand_ko = excluded.brand_ko returning id into v_product;
  insert into public.offers (product_id, retailer, market, currency, external_id, ean, url, affiliate_url, image_url)
    values (v_product, c.retailer, c.market, c.currency, c.sku, c.ean, c.url, c.affiliate_url, c.image_url)
    returning id into v_offer;
  perform public.ingest_observation(v_offer, c.seen_at, c.price_minor, c.delivery_minor, c.availability,
    md5(c.price_minor::text || '|' || c.availability || '|' || coalesce(c.delivery_minor::text, '')), 'catalog');
  return v_slug;
end;
$$;
