-- P0 funnel dashboard (#49), private: the analytics schema is not exposed through the REST API, so these
-- views are only visible in Supabase Studio / to the service role. Days are Korean calendar days.
-- Test traffic (verification device, app_version 'verify') is excluded.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create view analytics.events_clean as
  select *, (received_at at time zone 'Asia/Seoul')::date as day
  from public.app_events
  where device_id <> '00000000-0000-4000-8000-000000000001' and coalesce(app_version, '') <> 'verify';

-- Unique devices reaching each funnel step per day and platform.
create view analytics.funnel_daily as
  select day, platform,
    count(distinct device_id) filter (where name = 'home_view')        as home,
    count(distinct device_id) filter (where name = 'search')           as searched,
    count(distinct device_id) filter (where name = 'product_view')     as viewed_product,
    count(distinct device_id) filter (where name = 'wishlist_add')     as saved,
    count(distinct device_id) filter (where name = 'target_price_set') as set_target,
    count(distinct device_id) filter (where name = 'merchant_click')   as clicked_retailer,
    count(*) as events
  from analytics.events_clean
  group by day, platform
  order by day desc, platform;

-- Last 7 days, all platforms, with step-to-step conversion.
create view analytics.funnel_7d as
  with f as (
    select
      count(distinct device_id) filter (where name = 'home_view')        as home,
      count(distinct device_id) filter (where name = 'product_view')     as viewed_product,
      count(distinct device_id) filter (where name = 'wishlist_add')     as saved,
      count(distinct device_id) filter (where name = 'target_price_set') as set_target,
      count(distinct device_id) filter (where name = 'merchant_click')   as clicked_retailer
    from analytics.events_clean where received_at > now() - interval '7 days')
  select *,
    round(100.0 * viewed_product / nullif(home, 0), 1)       as pct_home_to_view,
    round(100.0 * saved / nullif(viewed_product, 0), 1)      as pct_view_to_save,
    round(100.0 * set_target / nullif(saved, 0), 1)          as pct_save_to_target,
    round(100.0 * clicked_retailer / nullif(viewed_product, 0), 1) as pct_view_to_click
  from f;

-- Which products people look at, save and click through (last 7 days).
create view analytics.products_7d as
  select e.product_id, p.brand, p.name,
    count(*) filter (where e.name = 'product_view')     as views,
    count(*) filter (where e.name = 'wishlist_add')     as saves,
    count(*) filter (where e.name = 'merchant_click')   as clicks
  from analytics.events_clean e left join public.products p on p.slug = e.product_id
  where e.product_id is not null and e.received_at > now() - interval '7 days'
  group by e.product_id, p.brand, p.name
  order by views desc, saves desc;

-- Language and source mix of home visits (lang/source props), last 7 days.
create view analytics.home_mix_7d as
  select platform, props->>'lang' as lang, props->>'source' as source, count(distinct device_id) as devices
  from analytics.events_clean where name = 'home_view' and received_at > now() - interval '7 days'
  group by 1, 2, 3 order by devices desc;

revoke all on all tables in schema analytics from public, anon, authenticated;
