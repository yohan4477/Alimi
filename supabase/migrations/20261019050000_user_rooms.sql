-- User-created public topic rooms (#109 plan): anyone can open a room on any subject; recommendations
-- only help people find rooms that already exist. Rooms carry optional concern tags (same ids as
-- dist/onboarding.js) so the community guide can match them. Creation goes through create_room only:
-- device-secret identity, bans, link / blocked-word filter, per-device and global rate limits,
-- duplicate titles. Operators hide a room by setting active = false (history is kept).

alter table public.chat_rooms
  add column created_by text,
  add column created_at timestamptz not null default now(),
  add column concerns text[] not null default '{}'
    check (concerns <@ array['acne', 'sensitive', 'dry', 'pores', 'cushion', 'lip', 'longwear', 'shade']::text[]);
create index chat_rooms_creator_idx on public.chat_rooms (created_by, created_at desc) where created_by is not null;

-- Seed topics get the tags the web client used as its built-in fallback.
update public.chat_rooms set concerns = case id
  when 'acne' then array['acne', 'pores']
  when 'dry-sensitive' then array['sensitive', 'dry']
  when 'routine' then array['pores', 'dry']
  when 'makeup' then array['cushion', 'lip', 'longwear', 'shade']
  else concerns end
where id in ('acne', 'dry-sensitive', 'routine', 'makeup');

create function public.create_room(p_secret text, p_title text, p_intro text default '',
  p_tag text default 'talk', p_concerns text[] default '{}')
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
   where c = any (array['acne', 'sensitive', 'dry', 'pores', 'cushion', 'lip', 'longwear', 'shade']);
  -- 3 rooms per device per day, 30 new rooms per hour overall.
  if (select count(*) from public.chat_rooms where created_by = v_tag and created_at > now() - interval '24 hours') >= 3
     or (select count(*) from public.chat_rooms where created_by is not null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'chat:slow';
  end if;
  if exists (select 1 from public.chat_rooms
              where active and (lower(title_en) = lower(v_title) or lower(title_ko) = lower(v_title))) then
    raise exception 'chat:duplicate';
  end if;
  v_id := 'u-' || left(encode(sha256(convert_to(v_tag || clock_timestamp()::text, 'UTF8')), 'hex'), 12);
  -- The creator's own words are shown as-is in both languages.
  insert into public.chat_rooms (id, title_en, title_ko, intro_en, intro_ko, sort, kind, tag, created_by, concerns)
  values (v_id, v_title, v_title, v_intro, v_intro, 100, 'topic', p_tag, v_tag, v_concerns);
  insert into public.chat_members (room_id, author_tag) values (v_id, v_tag);
  return v_id;
end;
$$;

revoke all on function public.create_room(text, text, text, text, text[]) from public;
grant execute on function public.create_room(text, text, text, text, text[]) to anon, authenticated;

drop view public.chat_room_list;
create view public.chat_room_list with (security_invoker = true) as
select r.id, r.title_en, r.title_ko, r.intro_en, r.intro_ko, r.sort, r.kind, r.tag, r.brand, l.logo_url,
  (select count(*) from public.chat_members m where m.room_id = r.id) as members,
  (select count(*) from public.chat_messages c where c.room_id = r.id
     and c.created_at > now() - interval '24 hours') as messages_24h,
  (select max(c.created_at) from public.chat_messages c where c.room_id = r.id) as last_message_at,
  r.concerns, r.created_at, r.created_by is not null as user_created
from public.chat_rooms r
left join public.brand_logos l on l.brand = r.brand
where r.active;
grant select on public.chat_room_list to anon, authenticated;
