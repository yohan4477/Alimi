-- Community (#68 → 2026-10-19 direction): topic posts with comments next to the topic's live chat.
-- Posts and comments reuse the chat's anonymous identity (device secret → tag), filters, rate limit and
-- report flow. Every product card (post, comment, chat message) resolves to the same catalog item, so a
-- product page can list everything said about it and later analysis can link mention → view → save →
-- retailer click → confirmed order. Optional profile + consent tables are created now, filled later.

alter table public.chat_rooms drop constraint if exists chat_rooms_tag_check;
alter table public.chat_rooms add constraint chat_rooms_tag_check check (tag in ('talk', 'skin', 'makeup', 'deals', 'travel'));
insert into public.chat_rooms (id, title_en, title_ko, intro_en, intro_ko, sort, kind, tag) values
  ('korea-shopping', 'Korea travel shopping', '한국 여행 쇼핑', 'What to buy in Korea and where: Olive Young, Daiso, duty free.', '한국에서 뭘 어디서 살까: 올리브영, 다이소, 면세점', 2, 'topic', 'travel')
on conflict (id) do nothing;

-- Interest reasons a writer can pick (never inferred here; inferred labels would live in a separate table).
create table public.community_posts (
  id bigint generated always as identity primary key,
  room_id text not null references public.chat_rooms (id),
  author_tag text not null,
  nickname text not null,
  kind text not null check (kind in ('question', 'recommend', 'review')),
  title text not null check (char_length(title) between 2 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  item jsonb,
  reasons text[] not null default '{}' check (reasons <@ array['price', 'texture', 'color', 'ingredients', 'shipping', 'skin_type', 'scent']::text[]),
  from_message_id bigint references public.chat_messages (id),
  -- Review details (kind = 'review'; all optional except the product). Product experience lives in body;
  -- the writer's own purchase / shipping facts are kept apart so shipping problems don't read as product
  -- problems, and so they are never confused with the app's current affiliate price.
  used_for text check (used_for in ('first', 'weeks', 'months', 'long')),
  skin_type text check (skin_type in ('dry', 'oily', 'combination', 'sensitive', 'normal')),
  -- Chosen by the writer per post (never inferred from photos or text): helps "people like me" filtering.
  skin_tone text check (skin_tone in ('fair', 'light', 'medium', 'tan', 'deep')),
  undertone text check (undertone in ('cool', 'warm', 'neutral')),
  climate text check (climate in ('humid', 'dry', 'mixed')),
  goal text check (char_length(goal) <= 60),
  photos text[] not null default '{}' check (cardinality(photos) <= 4),
  bought_where text check (char_length(bought_where) <= 60),
  bought_price_minor int check (bought_price_minor between 1 and 10000000),
  bought_currency char(3),
  ship_country char(2),
  ship_days smallint check (ship_days between 0 and 120),
  sponsored boolean not null default false,
  comments int not null default 0,
  likes int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index community_posts_room_idx on public.community_posts (room_id, last_activity_at desc);
create index community_posts_family_idx on public.community_posts ((item->>'family_key'));

create table public.community_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.community_posts (id) on delete cascade,
  author_tag text not null,
  nickname text not null,
  body text not null default '' check (char_length(body) <= 1000),
  item jsonb,
  likes int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index community_comments_post_idx on public.community_comments (post_id, id);
create index community_comments_family_idx on public.community_comments ((item->>'family_key'));

create table public.community_likes (
  target text not null check (target in ('post', 'comment')),
  target_id bigint not null,
  author_tag text not null,
  primary key (target, target_id, author_tag)
);
create table public.community_reports (
  target text not null check (target in ('post', 'comment')),
  target_id bigint not null,
  author_tag text not null,
  reason text not null check (reason in ('spam', 'abuse', 'sexual', 'other')),
  created_at timestamptz not null default now(),
  primary key (target, target_id, author_tag)
);

-- Optional, progressive profile and consent (no UI yet). One row per device tag; nothing is inferred.
create table public.community_profiles (
  author_tag text primary key,
  country char(2),
  age_band text check (age_band in ('13-17', '18-24', '25-34', '35-44', '45-54', '55+')),
  interests text[] not null default '{}',
  job_group text,
  consent_analytics boolean not null default false,
  consent_b2b boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_profiles enable row level security;
revoke all on public.community_posts, public.community_comments, public.community_likes, public.community_reports,
  public.community_profiles from anon, authenticated;
grant select (id, room_id, author_tag, nickname, kind, title, body, item, reasons, comments, likes, created_at, last_activity_at,
  used_for, skin_type, skin_tone, undertone, climate, goal, photos, bought_where, bought_price_minor, bought_currency, ship_country, ship_days, sponsored)
  on public.community_posts to anon, authenticated;
grant select (id, post_id, author_tag, nickname, body, item, likes, created_at) on public.community_comments to anon, authenticated;
create policy "public read" on public.community_posts for select using (not hidden);
create policy "public read" on public.community_comments for select using (not hidden);

-- Every product card anywhere, for "people talking about this product" and mention analytics.
create view public.product_mentions with (security_invoker = true) as
  select case when p.kind = 'review' then 'review' else 'post' end::text as source, p.id as source_id, p.id as post_id,
         null::text as room_id, p.item->>'family_key' as family_key, p.item->>'sku' as sku, p.created_at
    from public.community_posts p where p.item is not null
  union all
  select 'comment', c.id, c.post_id, null, c.item->>'family_key', c.item->>'sku', c.created_at
    from public.community_comments c where c.item is not null
  union all
  select 'chat', m.id, null, m.room_id, m.item->>'family_key', m.item->>'sku', m.created_at
    from public.chat_messages m where m.item is not null;
grant select on public.product_mentions to anon, authenticated;

-- Shared guard for every community write: secret, ban, length, links, blocked words, rate limit.
create function public.community_guard(p_secret text, p_text text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret);
begin
  if exists (select 1 from public.chat_bans where author_tag = v_tag) then raise exception 'chat:banned'; end if;
  if p_text ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|ly|me|gg)\M)' then raise exception 'chat:link'; end if;
  if exists (select 1 from public.chat_blocked_terms t where strpos(lower(p_text), t.term) > 0) then raise exception 'chat:blocked'; end if;
  if (select count(*) from public.community_comments where author_tag = v_tag and created_at > now() - interval '30 seconds')
     + (select count(*) from public.community_posts where author_tag = v_tag and created_at > now() - interval '30 seconds') >= 4
     or (select count(*) from public.community_posts where author_tag = v_tag and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'chat:slow';
  end if;
  return v_tag;
end;
$$;

create function public.community_guard_text(p_text text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_text ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|ly|me|gg)\M)' then raise exception 'chat:link'; end if;
  if exists (select 1 from public.chat_blocked_terms t where strpos(lower(p_text), t.term) > 0) then raise exception 'chat:blocked'; end if;
  return true;
end;
$$;

create function public.community_item(p_retailer text, p_market text, p_sku text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  if p_sku is null then return null; end if;
  select jsonb_build_object('retailer', c.retailer, 'market', c.market, 'sku', c.sku, 'brand', c.brand, 'brand_ko', c.brand_ko,
           'name', c.name, 'price_minor', c.price_minor, 'image_url', c.image_url, 'family_key', c.family_key)
    into v from public.catalog_items c where c.retailer = p_retailer and c.market = p_market and c.sku = p_sku and c.active;
  if v is null then raise exception 'chat:item'; end if;
  return v;
end;
$$;

create function public.create_post(p_secret text, p_room text, p_kind text, p_title text, p_body text default '',
  p_retailer text default null, p_market text default null, p_sku text default null, p_reasons text[] default '{}',
  p_from_message bigint default null, p_review jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, '')); v_body text := btrim(coalesce(p_body, ''));
  v_tag text := public.community_guard(p_secret, v_title || ' ' || v_body);
  p public.community_posts;
begin
  if not exists (select 1 from public.chat_rooms where id = p_room and active) then raise exception 'chat:room'; end if;
  if char_length(v_title) < 2 then raise exception 'chat:empty'; end if;
  if char_length(v_title) > 120 or char_length(v_body) > 2000 then raise exception 'chat:long'; end if;
  -- Only the author of a chat message can turn it into a post.
  -- A review must name the exact product (option) it is about.
  if p_kind = 'review' and p_sku is null then raise exception 'chat:item'; end if;
  if p_kind <> 'review' and coalesce(p_review, '{}') <> '{}' then raise exception 'chat:review'; end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_review->'photos', '[]')) ph where ph !~ '^v1/[0-9a-f-]{36}\.(jpg|webp)$') then
    raise exception 'chat:photo';
  end if;
  if public.community_guard_text(coalesce(p_review->>'goal', '') || ' ' || coalesce(p_review->>'bought_where', '')) then null; end if;
  if p_from_message is not null and not exists (select 1 from public.chat_messages where id = p_from_message and author_tag = v_tag) then
    raise exception 'chat:message';
  end if;
  insert into public.chat_members (room_id, author_tag) values (p_room, v_tag) on conflict do nothing;
  insert into public.community_posts (room_id, author_tag, nickname, kind, title, body, item, reasons, from_message_id,
      used_for, skin_type, skin_tone, undertone, climate, goal, photos, bought_where, bought_price_minor, bought_currency, ship_country, ship_days, sponsored)
    values (p_room, v_tag, public.chat_nickname(v_tag), p_kind, v_title, v_body, public.community_item(p_retailer, p_market, p_sku),
            coalesce(p_reasons, '{}'), p_from_message,
            p_review->>'used_for', p_review->>'skin_type', p_review->>'skin_tone', p_review->>'undertone', p_review->>'climate', nullif(btrim(p_review->>'goal'), ''),
            coalesce(array(select jsonb_array_elements_text(p_review->'photos')), '{}'),
            nullif(btrim(p_review->>'bought_where'), ''), (p_review->>'bought_price_minor')::int, upper(p_review->>'bought_currency'),
            upper(p_review->>'ship_country'), (p_review->>'ship_days')::smallint, coalesce((p_review->>'sponsored')::boolean, false))
    returning * into p;
  return to_jsonb(p) - 'reports' - 'hidden' - 'from_message_id';
end;
$$;

create function public.add_comment(p_secret text, p_post bigint, p_body text,
  p_retailer text default null, p_market text default null, p_sku text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, '')); v_tag text := public.community_guard(p_secret, v_body);
  v_item jsonb := public.community_item(p_retailer, p_market, p_sku); c public.community_comments;
begin
  if not exists (select 1 from public.community_posts where id = p_post and not hidden) then raise exception 'chat:message'; end if;
  if v_body = '' and v_item is null then raise exception 'chat:empty'; end if;
  if char_length(v_body) > 1000 then raise exception 'chat:long'; end if;
  insert into public.community_comments (post_id, author_tag, nickname, body, item)
    values (p_post, v_tag, public.chat_nickname(v_tag), v_body, v_item) returning * into c;
  update public.community_posts set comments = comments + 1, last_activity_at = now() where id = p_post;
  return to_jsonb(c) - 'reports' - 'hidden';
end;
$$;

create function public.like_community(p_secret text, p_target text, p_id bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret); v_n int;
begin
  if p_target not in ('post', 'comment') then raise exception 'chat:message'; end if;
  delete from public.community_likes where target = p_target and target_id = p_id and author_tag = v_tag;
  if not found then insert into public.community_likes values (p_target, p_id, v_tag); end if;
  select count(*) into v_n from public.community_likes where target = p_target and target_id = p_id;
  if p_target = 'post' then update public.community_posts set likes = v_n where id = p_id;
  else update public.community_comments set likes = v_n where id = p_id; end if;
  return v_n;
end;
$$;

create function public.report_community(p_secret text, p_target text, p_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret); v_n int;
begin
  if p_target not in ('post', 'comment') then raise exception 'chat:message'; end if;
  insert into public.community_reports (target, target_id, author_tag, reason) values (p_target, p_id, v_tag, p_reason) on conflict do nothing;
  select count(*) into v_n from public.community_reports where target = p_target and target_id = p_id;
  if p_target = 'post' then update public.community_posts set reports = v_n, hidden = hidden or v_n >= 3 where id = p_id;
  else update public.community_comments set reports = v_n, hidden = hidden or v_n >= 3 where id = p_id; end if;
end;
$$;

revoke all on function public.community_guard(text, text), public.community_guard_text(text), public.community_item(text, text, text),
  public.create_post(text, text, text, text, text, text, text, text, text[], bigint, jsonb),
  public.add_comment(text, bigint, text, text, text, text), public.like_community(text, text, bigint),
  public.report_community(text, text, bigint, text) from public;
grant execute on function public.create_post(text, text, text, text, text, text, text, text, text[], bigint, jsonb),
  public.add_comment(text, bigint, text, text, text, text), public.like_community(text, text, bigint),
  public.report_community(text, text, bigint, text) to anon, authenticated;

-- Funnel events for the community and product-card path. `props` carries the source (topic/post/chat/brand/search).
alter table public.app_events drop constraint app_events_name_check;
alter table public.app_events add constraint app_events_name_check check (name in (
  'home_view', 'search', 'product_view', 'wishlist_add', 'wishlist_remove',
  'target_price_set', 'merchant_click', 'notification_opt_in', 'chat_open', 'chat_join', 'chat_send',
  'community_open', 'post_view', 'post_create', 'comment_create', 'product_card_click', 'post_save'
));

-- Operator views (service role only). Small groups are suppressed in anything meant for outside use.
create view analytics.community_reports_open as
select r.target, r.target_id, count(*) as reports, array_agg(r.reason) as reasons, max(r.created_at) as last_report_at
from public.community_reports r group by r.target, r.target_id order by max(r.created_at) desc;

create view analytics.product_mentions_30d as
select m.family_key, count(*) as mentions, count(*) filter (where m.source = 'chat') as in_chat,
  count(*) filter (where m.source in ('post', 'comment')) as in_posts,
  count(*) filter (where m.source = 'review') as reviews, min(m.created_at) as first_seen, max(m.created_at) as last_seen
from public.product_mentions m
where m.created_at > now() - interval '30 days' and m.family_key is not null
group by m.family_key order by mentions desc;

-- Review photos: public-read bucket, anonymous upload of small JPEG/WebP files under v1/<uuid>.<ext> only.
-- Clients re-encode photos before upload (drops EXIF / location). No update or delete for anon; the
-- operator removes reported photos.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('review-photos', 'review-photos', true, 1048576, array['image/jpeg', 'image/webp'])
      on conflict (id) do nothing;
    execute $p$create policy "review photo upload" on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'review-photos' and name ~ '^v1/[0-9a-f-]{36}\.(jpg|webp)$')$p$;
  end if;
end;
$$;
