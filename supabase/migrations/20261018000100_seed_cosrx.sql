-- Seed the one product already verified against the official Stylevana US feed
-- (docs/validation/stylevana-official-feed-2026-10-17.md). No synthetic history.

insert into public.products (slug, brand, name, size)
values ('cosrx-snail-96-100ml', 'COSRX', 'Advanced Snail 96 Mucin Power Essence', '100ml');

insert into public.offers (product_id, retailer, market, currency, external_id, ean, url, affiliate_url, image_url)
select id, 'Stylevana US', 'US', 'USD', '10759', '8809416470009',
  'https://www.stylevana.com/en_US/cosrx-advanced-snail-96-mucin-power-essence-100ml10777.html',
  'https://www.awin1.com/pclick.php?p=43018980482&a=3125007&m=90791',
  'https://sv9-cdn.stylevana.com/media/catalog/product/c/o/cosrx-advanced-snail-96-mucin-power-essence-100ml-684.png'
from public.products where slug = 'cosrx-snail-96-100ml';

-- First official feed observation (collectedAt 2026-10-16T22:22:07.851Z).
select public.ingest_observation(
  (select id from public.offers where retailer = 'Stylevana US' and market = 'US' and external_id = '10759'),
  '2026-10-16T22:22:07.851Z', 1750, 399, 'in_stock',
  '48fc8462b1f84fb27831a320250a0e3c52f08a47fff16c399e6c16a5a3816655', 'awin_feed');
