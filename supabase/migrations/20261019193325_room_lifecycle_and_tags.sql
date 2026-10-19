-- Run previous user_rooms and concern_keywords migrations first. No direct client table writes.
-- Device-secret ownership intentionally matches existing anonymous chat; do not infer an account owner.
alter table public.chat_rooms
  add column status text not null default 'active' check (status in ('active','archived','closed','deleted')),
  add column closure_reason text,
  add column had_other_participant boolean not null default false;
alter table public.chat_rooms drop constraint chat_rooms_concerns_check;
alter table public.chat_rooms add constraint chat_rooms_concerns_check check (concerns <@ array['acne', 'dry', 'sensitive', 'pores', 'sebum', 'redness', 'spots', 'flakes', 'firmness', 'shade', 'caking', 'longwear', 'coverage', 'color', 'lip', 'base', 'eye', 'cheek', 'sun', 'trouble', 'cushion', 'toneup']::text[]);

-- Preserve participation history even after a member leaves or deletes a message.
update public.chat_rooms r set had_other_participant = true where created_by is not null and (
  exists(select 1 from public.chat_members m where m.room_id=r.id and m.author_tag<>r.created_by) or
  exists(select 1 from public.chat_messages m where m.room_id=r.id and m.author_tag<>r.created_by) or
  exists(select 1 from public.community_posts p where p.room_id=r.id and p.author_tag<>r.created_by) or
  exists(select 1 from public.community_comments c join public.community_posts p on p.id=c.post_id where p.room_id=r.id and c.author_tag<>r.created_by));

create function public.room_participation_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v_room text; r public.chat_rooms;
begin
  if TG_TABLE_NAME = 'community_comments' then
    select room_id into v_room from public.community_posts where id=new.post_id;
  else v_room := new.room_id; end if;
  -- Serialize joins/posts against deletion/closure on the same room.
  select * into r from public.chat_rooms where id=v_room for update;
  if not found or not r.active or r.status <> 'active' then raise exception 'chat:room'; end if;
  if r.created_by is not null and new.author_tag <> r.created_by and not r.had_other_participant then
    update public.chat_rooms set had_other_participant=true where id=v_room;
  end if;
  return new;
end $$;
revoke all on function public.room_participation_guard() from public, anon, authenticated;
create trigger room_member_guard before insert on public.chat_members for each row execute function public.room_participation_guard();
create trigger room_message_guard before insert on public.chat_messages for each row execute function public.room_participation_guard();
create trigger room_post_guard before insert on public.community_posts for each row execute function public.room_participation_guard();
create trigger room_comment_guard before insert on public.community_comments for each row execute function public.room_participation_guard();

create function public.room_actions(p_secret text,p_room text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_tag text:=public.chat_tag(p_secret); r public.chat_rooms;
begin
  select * into r from public.chat_rooms where id=p_room and active;
  if not found then raise exception 'chat:room'; end if;
  return jsonb_build_object('joined',exists(select 1 from public.chat_members where room_id=p_room and author_tag=v_tag),
    'can_delete',r.status='active' and r.created_by=v_tag and not r.had_other_participant);
end $$;

create function public.leave_room(p_secret text,p_room text) returns void
language plpgsql security definer set search_path='' as $$
declare v_tag text:=public.chat_tag(p_secret);
begin
  perform 1 from public.chat_rooms where id=p_room for update;
  -- Deletion is of membership only; sticky participation history and authored content remain.
  delete from public.chat_members where room_id=p_room and author_tag=v_tag;
end $$;

create function public.delete_room(p_secret text,p_room text) returns void
language plpgsql security definer set search_path='' as $$
declare v_tag text:=public.chat_tag(p_secret); r public.chat_rooms;
begin
  select * into r from public.chat_rooms where id=p_room for update;
  if not found or r.created_by is distinct from v_tag then raise exception 'chat:owner'; end if;
  if r.had_other_participant then raise exception 'chat:participated'; end if;
  if r.status='deleted' then return; end if;
  if r.status<>'active' then raise exception 'chat:room'; end if;
  -- Soft deletion retains references/rate-limit evidence. No public content survives access policies.
  update public.chat_rooms set status='deleted',active=false where id=p_room;
  delete from public.chat_members where room_id=p_room;
end $$;

-- Empty body + NULL item is an unambiguous tombstone (post_chat rejects this combination).
-- Clear the text and product; keep ids and reply edges so the conversation still makes sense.
create function public.delete_chat_message(p_secret text,p_message bigint) returns void
language plpgsql security definer set search_path='' as $$
declare v_tag text:=public.chat_tag(p_secret);
begin
  perform 1 from public.chat_messages where id=p_message and author_tag=v_tag for update;
  if not found then raise exception 'chat:owner'; end if;
  update public.chat_messages set body='',item=null,likes=0 where id=p_message;
  delete from public.chat_likes where message_id=p_message;
end $$;

revoke all on function public.room_actions(text,text),public.leave_room(text,text),public.delete_room(text,text),public.delete_chat_message(text,bigint) from public;
grant execute on function public.room_actions(text,text),public.leave_room(text,text),public.delete_room(text,text),public.delete_chat_message(text,bigint) to anon,authenticated;

-- Deleted/archived room content must also disappear when requested by a direct message or post URL.
drop policy "public read" on public.chat_messages;
create policy "public read" on public.chat_messages for select using (not hidden and exists(select 1 from public.chat_rooms r where r.id=room_id and r.active));
drop policy "public read" on public.community_posts;
create policy "public read" on public.community_posts for select using (not hidden and exists(select 1 from public.chat_rooms r where r.id=room_id and r.active));
drop policy "public read" on public.community_comments;
create policy "public read" on public.community_comments for select using (not hidden and exists(select 1 from public.community_posts p where p.id=post_id));

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
  perform pg_advisory_xact_lock(192020); -- serialize quotas and duplicate titles
  if exists (select 1 from public.chat_bans where author_tag = v_tag) then raise exception 'chat:banned'; end if;
  if char_length(v_title) < 3 then raise exception 'chat:short'; end if;
  if char_length(v_title) > 40 or char_length(v_intro) > 120 then raise exception 'chat:long'; end if;
  v_text := v_title || ' ' || v_intro;
  if v_text ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|ly|me|gg)\M)' then raise exception 'chat:link'; end if;
  if exists (select 1 from public.chat_blocked_terms t where strpos(lower(v_text), t.term) > 0) then
    raise exception 'chat:blocked';
  end if;
  if p_tag is null or p_tag not in ('talk', 'skin', 'makeup') then raise exception 'chat:tag'; end if;
  if exists(select 1 from unnest(coalesce(p_concerns,'{}')) c where c is null or not(c=any(array['acne', 'dry', 'sensitive', 'pores', 'sebum', 'redness', 'spots', 'flakes', 'firmness', 'shade', 'caking', 'longwear', 'coverage', 'color', 'lip', 'base', 'eye', 'cheek', 'sun', 'trouble', 'cushion', 'toneup']::text[]))) then raise exception 'chat:tag'; end if;
  select coalesce(array_agg(distinct case c when 'trouble' then 'acne' when 'cushion' then 'base' else c end),'{}') into v_concerns
    from unnest(coalesce(p_concerns,'{}')) c;
  if cardinality(v_concerns)>3 then raise exception 'chat:tags'; end if;
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


create or replace function public.like_chat(p_secret text, p_message bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret); v_likes int;
begin
  perform 1 from public.chat_messages m join public.chat_rooms r on r.id=m.room_id where m.id=p_message and not m.hidden and (m.body<>'' or m.item is not null) and r.active and r.status='active' for update of m;
  if not found then raise exception 'chat:message'; end if;
  delete from public.chat_likes where message_id = p_message and author_tag = v_tag;
  if not found then insert into public.chat_likes (message_id, author_tag) values (p_message, v_tag); end if;
  update public.chat_messages set likes = (select count(*) from public.chat_likes where message_id = p_message)
    where id = p_message returning likes into v_likes;
  return v_likes;
end;
$$;


-- Keep closed rooms readable with a reason; empty archived/deleted rooms leave discovery.
create or replace view public.chat_room_list with (security_invoker=true) as
select r.id,r.title_en,r.title_ko,r.intro_en,r.intro_ko,r.sort,r.kind,r.tag,r.brand,l.logo_url,
 (select count(*) from public.chat_members m where m.room_id=r.id) as members,
 (select count(*) from public.chat_messages m where m.room_id=r.id and m.created_at>now()-interval '24 hours') as messages_24h,
 (select max(m.created_at) from public.chat_messages m where m.room_id=r.id) as last_message_at,
 r.concerns,r.created_at,r.created_by is not null as user_created,r.status,r.closure_reason
from public.chat_rooms r left join public.brand_logos l on l.brand=r.brand where r.active;

-- Operator-only maintenance. A room with even one real message/post is not auto-archived.
create function public.archive_empty_rooms() returns integer
language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0;
begin
  for r in select id from public.chat_rooms where status='active' and active and created_by is not null
    and not had_other_participant and created_at<now()-interval '7 days' for update skip locked loop
    if not exists(select 1 from public.chat_messages where room_id=r.id)
       and not exists(select 1 from public.community_posts where room_id=r.id) then
      update public.chat_rooms set status='archived',active=false where id=r.id;
      n:=n+1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.archive_empty_rooms() from public,anon,authenticated;
grant execute on function public.archive_empty_rooms() to service_role;
-- Report count never deletes a room. Operators close after review with an explicit reason.
create function public.close_room(p_room text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'reason required'; end if;
  update public.chat_rooms set status='closed',closure_reason=btrim(p_reason) where id=p_room and active;
end $$;
revoke all on function public.close_room(text,text) from public,anon,authenticated;
grant execute on function public.close_room(text,text) to service_role;
-- Supabase supports pg_cron; install/schedule only if already enabled in this project.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('seoulbeauty-archive-empty-rooms','17 * * * *','select public.archive_empty_rooms()');
  end if;
end $$;
notify pgrst, 'reload schema';
