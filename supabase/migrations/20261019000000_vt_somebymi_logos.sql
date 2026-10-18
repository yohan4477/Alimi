-- Badges for VT and SOME BY MI (sources: dist/brand-logos/CREDITS.md).
insert into public.brand_logos (brand, logo_url)
values ('VT', 'https://alimi-omega.vercel.app/brand-logos/vt.png'),
       ('SOME BY MI', 'https://alimi-omega.vercel.app/brand-logos/some-by-mi.png')
on conflict (brand) do update set logo_url = excluded.logo_url, updated_at = now();
