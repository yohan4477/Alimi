-- Badges for three more top brands by product families (sources: dist/brand-logos/CREDITS.md).
insert into public.brand_logos (brand, logo_url)
select v.brand, 'https://alimi-omega.vercel.app/brand-logos/' || v.slug || '.png'
from (values ('Abib', 'abib'), ('anillO', 'anillo'), ('ROUND LAB', 'round-lab')) as v (brand, slug)
on conflict (brand) do update set logo_url = excluded.logo_url, updated_at = now();
