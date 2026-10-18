-- Chat layout like the reference app: topic rooms with tags (Topics tab chips) and one room per popular
-- brand (brand rooms list with the brand badge as icon).

alter table public.chat_rooms
  add column kind text not null default 'topic' check (kind in ('topic', 'brand')),
  add column tag text check (tag in ('talk', 'skin', 'makeup', 'deals')),
  add column brand text;

update public.chat_rooms set tag = case id
  when 'deals' then 'deals' when 'makeup' then 'makeup'
  when 'acne' then 'skin' when 'dry-sensitive' then 'skin' when 'sunscreen' then 'skin' when 'routine' then 'skin'
  else 'talk' end;

-- One room per brand in the home strip (top 15 by product families), Fine Today excluded (Japanese brand).
insert into public.chat_rooms (id, title_en, title_ko, intro_en, intro_ko, sort, kind, brand)
select 'brand-' || trim(both '-' from regexp_replace(lower(b.brand), '[^a-z0-9]+', '-', 'g')),
  b.brand, coalesce(b.brand_ko, b.brand),
  'Talk about ' || b.brand || ' products.', coalesce(b.brand_ko, b.brand) || ' 제품 이야기',
  100 + row_number() over (order by b.families desc), 'brand', b.brand
from (select * from public.catalog_brands where brand <> 'Fine Today' order by families desc limit 15) b
on conflict (id) do nothing;

drop view public.chat_room_list;
create view public.chat_room_list with (security_invoker = true) as
select r.id, r.title_en, r.title_ko, r.intro_en, r.intro_ko, r.sort, r.kind, r.tag, r.brand, l.logo_url,
  (select count(*) from public.chat_members m where m.room_id = r.id) as members,
  (select count(*) from public.chat_messages c where c.room_id = r.id
     and c.created_at > now() - interval '24 hours') as messages_24h,
  (select max(c.created_at) from public.chat_messages c where c.room_id = r.id) as last_message_at
from public.chat_rooms r
left join public.brand_logos l on l.brand = r.brand
where r.active;
grant select on public.chat_room_list to anon, authenticated;
