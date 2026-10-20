-- Prerequisites: user_rooms and concern_keywords. Existing US pilot content is preserved.
-- No paid order data, secrets, or cross-region backfill is introduced.
begin;
alter table public.chat_rooms add column service_region text not null default 'us'
  check (service_region in ('kr','us'));
create index chat_rooms_region_active_idx on public.chat_rooms(service_region, sort) where active;

-- Preserve all existing view columns and append service_region, retaining caller RLS.
do $migration$
declare definition text;
begin
  definition := rtrim(pg_get_viewdef('public.chat_room_list'::regclass, true), E';\n ');
  execute 'create or replace view public.chat_room_list with (security_invoker = true) as '
    || 'select old.*, room.service_region from (' || definition || ') old '
    || 'join public.chat_rooms room on room.id = old.id';
end
$migration$;
grant select on public.chat_room_list to anon, authenticated;

create view public.catalog_region_families with (security_invoker = true) as
select market, currency, family_key,
  min(brand) as brand, min(brand_ko) as brand_ko, min(base_name) as base_name, min(category) as category,
  (array_agg(image_url order by price_minor) filter (where image_url is not null))[1] as image_url,
  min(price_minor) as min_price_minor, max(price_minor) as max_price_minor,
  count(*) as variants, min(unit_price_minor) as best_unit_price_minor, max(sku) as sort_key
from public.catalog_items where active and family_key is not null
group by market, currency, family_key;
grant select on public.catalog_region_families to anon, authenticated;

create or replace function public.create_region_room(p_secret text, p_title text, p_intro text default '',
  p_tag text default 'talk', p_concerns text[] default '{}', p_service_region text default 'us')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text := public.chat_tag(p_secret);
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_intro text := btrim(regexp_replace(coalesce(p_intro, ''), '\s+', ' ', 'g'));
  v_text text;
  v_concerns text[];
  v_id text;
begin
  if p_service_region is null or p_service_region not in ('kr','us') then raise exception 'chat:region'; end if;
  if exists (select 1 from public.chat_bans where author_tag = v_tag) then raise exception 'chat:banned'; end if;
  if char_length(v_title) < 3 then raise exception 'chat:short'; end if;
  if char_length(v_title) > 40 or char_length(v_intro) > 120 then raise exception 'chat:long'; end if;
  v_text := v_title || ' ' || v_intro;
  if v_text ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|ly|me|gg)\M)' then raise exception 'chat:link'; end if;
  if exists (select 1 from public.chat_blocked_terms t where strpos(lower(v_text), t.term) > 0) then
    raise exception 'chat:blocked';
  end if;
  if p_tag is null or p_tag not in ('talk', 'skin', 'makeup') then raise exception 'chat:tag'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_concerns
    from unnest(coalesce(p_concerns, '{}')) c
   where c = any (array['acne', 'dry', 'sensitive', 'pores', 'spots', 'firmness', 'sebum', 'toneup', 'trouble', 'lip', 'base', 'cushion', 'longwear', 'shade']);
  -- 3 rooms per device per day, 30 new rooms per hour overall.
  if (select count(*) from public.chat_rooms where created_by = v_tag and created_at > now() - interval '24 hours') >= 3
     or (select count(*) from public.chat_rooms where created_by is not null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'chat:slow';
  end if;
  if exists (select 1 from public.chat_rooms
              where active and service_region = p_service_region and (lower(title_en) = lower(v_title) or lower(title_ko) = lower(v_title))) then
    raise exception 'chat:duplicate';
  end if;
  v_id := 'u-' || left(encode(sha256(convert_to(v_tag || clock_timestamp()::text, 'UTF8')), 'hex'), 12);
  -- The creator's own words are shown as-is in both languages.
  insert into public.chat_rooms (id, title_en, title_ko, intro_en, intro_ko, sort, kind, tag, created_by, concerns, service_region)
  values (v_id, v_title, v_title, v_intro, v_intro, 100, 'topic', p_tag, v_tag, v_concerns, p_service_region);
  insert into public.chat_members (room_id, author_tag) values (v_id, v_tag);
  return v_id;
end;
$$;

revoke all on function public.create_region_room(text,text,text,text,text[],text) from public;
grant execute on function public.create_region_room(text,text,text,text,text[],text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
