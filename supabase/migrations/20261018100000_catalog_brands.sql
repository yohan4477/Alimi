-- Popular-brand strip on home (like a delivery app's brand grid). Brands are ranked by how many product
-- families they have. Logos are optional: whoever owns brand images fills brand_logos with an https URL;
-- clients show an initials badge until then.

create table public.brand_logos (
  brand text primary key,
  logo_url text not null check (logo_url like 'https://%'),
  updated_at timestamptz not null default now()
);
alter table public.brand_logos enable row level security;
revoke all on public.brand_logos from anon, authenticated;
grant select on public.brand_logos to anon, authenticated;
create policy "public read" on public.brand_logos for select using (true);

create view public.catalog_brands with (security_invoker = true) as
  select f.brand, min(f.brand_ko) as brand_ko, count(*) as families, l.logo_url
  from public.catalog_families f
  left join public.brand_logos l on l.brand = f.brand
  group by f.brand, l.logo_url;
grant select on public.catalog_brands to anon, authenticated;
