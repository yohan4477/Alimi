-- Retailer descriptions from the Awin product feed, stored per catalog row together with the permission basis
-- they were published under (data/catalog.json descriptionPermission). Clients show a description only when
-- description_permission is present, labelled as the retailer's text with a link to the source page.
alter table public.catalog_items
  add column description text check (char_length(description) <= 2000),
  add column description_permission text check (char_length(description_permission) <= 300);
