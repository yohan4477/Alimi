-- Concern keywords from the journey reference (skincare 9, makeup 5); same ids as dist/onboarding.js and
-- ios/Alimi/Journey.swift. Widens the room tag check and the create_room filter; re-tags the seed rooms.

alter table public.chat_rooms drop constraint if exists chat_rooms_concerns_check;
alter table public.chat_rooms add constraint chat_rooms_concerns_check
  check (concerns <@ array['acne', 'dry', 'sensitive', 'pores', 'spots', 'firmness', 'sebum', 'toneup', 'trouble', 'lip', 'base', 'cushion', 'longwear', 'shade']::text[]);

update public.chat_rooms set concerns = case id
  when 'acne' then array['acne', 'trouble', 'sebum']
  when 'dry-sensitive' then array['sensitive', 'dry']
  when 'routine' then array['pores', 'spots', 'firmness', 'toneup']
  when 'makeup' then array['lip', 'base', 'cushion', 'longwear', 'shade']
  else concerns end
where id in ('acne', 'dry-sensitive', 'routine', 'makeup');

create or replace function public.create_room(p_secret text, p_title text, p_intro text default '',
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
   where c = any (array['acne', 'dry', 'sensitive', 'pores', 'spots', 'firmness', 'sebum', 'toneup', 'trouble', 'lip', 'base', 'cushion', 'longwear', 'shade']);
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
