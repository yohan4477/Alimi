-- Measures how often and how much catalog prices move (#25 hypothesis: do cosmetics prices change over time
-- the way Coupang prices do?). A trigger records every catalog price change; the catalog itself still keeps
-- only the current price. Server-only; summary in analytics.price_volatility_daily.

create table public.catalog_price_changes (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  retailer text not null,
  market char(2) not null,
  sku text not null,
  family_key text,
  category text,
  old_minor bigint not null,
  new_minor bigint not null
);
create index catalog_price_changes_time_idx on public.catalog_price_changes (changed_at desc);
alter table public.catalog_price_changes enable row level security;
revoke all on public.catalog_price_changes from anon, authenticated;

create function public.log_catalog_price_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price_minor is distinct from old.price_minor then
    insert into public.catalog_price_changes (retailer, market, sku, family_key, category, old_minor, new_minor)
      values (new.retailer, new.market, new.sku, new.family_key, new.category, old.price_minor, new.price_minor);
  end if;
  return new;
end;
$$;
revoke execute on function public.log_catalog_price_change() from public, anon, authenticated;
create trigger catalog_price_change after update of price_minor on public.catalog_items
  for each row execute function public.log_catalog_price_change();

-- Per Korean day: how many products changed price, share of the catalog, drop/rise split and sizes.
create view analytics.price_volatility_daily as
  with c as (
    select (changed_at at time zone 'Asia/Seoul')::date as day, *,
      round(100.0 * (new_minor - old_minor) / old_minor, 1) as pct
    from public.catalog_price_changes)
  select day,
    count(*) as changes,
    round(100.0 * count(*) / nullif((select count(*) from public.catalog_items where active), 0), 2) as pct_of_catalog,
    count(*) filter (where pct < 0) as drops,
    count(*) filter (where pct > 0) as rises,
    round(avg(pct) filter (where pct < 0), 1) as avg_drop_pct,
    percentile_cont(0.5) within group (order by pct) filter (where pct < 0) as median_drop_pct,
    min(pct) as biggest_drop_pct,
    count(*) filter (where pct <= -20) as drops_20pct_plus
  from c group by day order by day desc;

-- Same by category, last 30 days.
create view analytics.price_volatility_by_category_30d as
  select category, count(*) as changes,
    count(*) filter (where new_minor < old_minor) as drops,
    round(avg(100.0 * (new_minor - old_minor) / old_minor) filter (where new_minor < old_minor), 1) as avg_drop_pct
  from public.catalog_price_changes where changed_at > now() - interval '30 days'
  group by category order by changes desc;

revoke all on all tables in schema analytics from public, anon, authenticated;
