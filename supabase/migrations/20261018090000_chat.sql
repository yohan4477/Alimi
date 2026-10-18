-- Topic chat rooms (#68). No account: each device keeps a random secret and only its SHA-256 tag is stored,
-- so nobody can post, like or report as someone else. All writes go through the RPCs below (rate limit,
-- word / link filter, reports). Clients read visible messages only. Messages can carry one catalog item,
-- looked up server-side so the shared price and name cannot be forged.

create table public.chat_rooms (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  title_en text not null,
  title_ko text not null,
  intro_en text not null,
  intro_ko text not null,
  sort smallint not null default 0,
  active boolean not null default true
);

create table public.chat_members (
  room_id text not null references public.chat_rooms (id),
  author_tag text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, author_tag)
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room_id text not null references public.chat_rooms (id),
  author_tag text not null,
  nickname text not null,
  body text not null check (char_length(body) <= 500),
  item jsonb,
  reply_to bigint references public.chat_messages (id),
  likes int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages (room_id, id desc);
create index chat_messages_author_idx on public.chat_messages (author_tag, created_at desc);

create table public.chat_likes (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  author_tag text not null,
  primary key (message_id, author_tag)
);
create table public.chat_reports (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  author_tag text not null,
  reason text not null check (reason in ('spam', 'abuse', 'sexual', 'other')),
  created_at timestamptz not null default now(),
  primary key (message_id, author_tag)
);
create table public.chat_bans (
  author_tag text primary key,
  reason text,
  created_at timestamptz not null default now()
);
create table public.chat_blocked_terms (term text primary key check (term = lower(term)));

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_likes enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_bans enable row level security;
alter table public.chat_blocked_terms enable row level security;
revoke all on public.chat_rooms, public.chat_members, public.chat_messages, public.chat_likes,
  public.chat_reports, public.chat_bans, public.chat_blocked_terms from anon, authenticated;
grant select on public.chat_rooms, public.chat_members to anon, authenticated;
grant select (id, room_id, author_tag, nickname, body, item, reply_to, likes, created_at)
  on public.chat_messages to anon, authenticated;
create policy "public read" on public.chat_rooms for select using (active);
create policy "public read" on public.chat_members for select using (true);
create policy "public read" on public.chat_messages for select using (not hidden);

-- Room list with member count and activity. security_invoker: RLS already drops hidden messages.
create view public.chat_room_list with (security_invoker = true) as
select r.id, r.title_en, r.title_ko, r.intro_en, r.intro_ko, r.sort,
  (select count(*) from public.chat_members m where m.room_id = r.id) as members,
  (select count(*) from public.chat_messages c where c.room_id = r.id
     and c.created_at > now() - interval '24 hours') as messages_24h,
  (select max(c.created_at) from public.chat_messages c where c.room_id = r.id) as last_message_at
from public.chat_rooms r
where r.active;
grant select on public.chat_room_list to anon, authenticated;

create function public.chat_tag(p_secret text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_secret is null or p_secret !~ '^[0-9a-f-]{36}$' then raise exception 'chat:secret'; end if;
  return left(encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'), 24);
end;
$$;

-- "Dewy Otter": stable per device, readable, nothing personal.
create function public.chat_nickname(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['Dewy','Glowy','Silky','Calm','Bouncy','Fresh','Velvet','Misty','Sunny','Plump',
                'Gentle','Bright','Cozy','Rosy','Clear','Soft','Matte','Peachy','Minty','Honey'])
           [1 + ('x' || substr(p_tag, 1, 4))::bit(16)::int % 20]
      || ' ' ||
         (array['Otter','Panda','Fox','Bunny','Seal','Koala','Tiger','Duck','Hamster','Owl',
                'Deer','Cat','Puppy','Penguin','Turtle','Lamb','Squirrel','Whale','Swan','Bear'])
           [1 + ('x' || substr(p_tag, 5, 4))::bit(16)::int % 20];
$$;

create function public.join_chat(p_secret text, p_room text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret);
begin
  if not exists (select 1 from public.chat_rooms where id = p_room and active) then raise exception 'chat:room'; end if;
  insert into public.chat_members (room_id, author_tag) values (p_room, v_tag) on conflict do nothing;
  return public.chat_nickname(v_tag);
end;
$$;

create function public.post_chat(p_secret text, p_room text, p_body text,
  p_retailer text default null, p_market text default null, p_sku text default null, p_reply_to bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text := public.chat_tag(p_secret);
  v_body text := btrim(coalesce(p_body, ''));
  v_item jsonb;
  m public.chat_messages;
begin
  if exists (select 1 from public.chat_bans where author_tag = v_tag) then raise exception 'chat:banned'; end if;
  if not exists (select 1 from public.chat_rooms where id = p_room and active) then raise exception 'chat:room'; end if;
  if char_length(v_body) > 500 then raise exception 'chat:long'; end if;
  if v_body ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|ly|me|gg)\M)' then raise exception 'chat:link'; end if;
  if exists (select 1 from public.chat_blocked_terms t where strpos(lower(v_body), t.term) > 0) then
    raise exception 'chat:blocked';
  end if;
  if (select count(*) from public.chat_messages where author_tag = v_tag and created_at > now() - interval '10 seconds') >= 3
     or (select count(*) from public.chat_messages where author_tag = v_tag and created_at > now() - interval '1 minute') >= 12 then
    raise exception 'chat:slow';
  end if;
  if p_sku is not null then
    select jsonb_build_object('retailer', c.retailer, 'market', c.market, 'sku', c.sku, 'brand', c.brand,
             'brand_ko', c.brand_ko, 'name', c.name, 'price_minor', c.price_minor, 'image_url', c.image_url,
             'family_key', c.family_key)
      into v_item
      from public.catalog_items c
      where c.retailer = p_retailer and c.market = p_market and c.sku = p_sku and c.active;
    if v_item is null then raise exception 'chat:item'; end if;
  end if;
  if v_body = '' and v_item is null then raise exception 'chat:empty'; end if;
  if p_reply_to is not null and not exists (select 1 from public.chat_messages where id = p_reply_to and room_id = p_room) then
    raise exception 'chat:reply';
  end if;

  insert into public.chat_members (room_id, author_tag) values (p_room, v_tag) on conflict do nothing;
  insert into public.chat_messages (room_id, author_tag, nickname, body, item, reply_to)
    values (p_room, v_tag, public.chat_nickname(v_tag), v_body, v_item, p_reply_to)
    returning * into m;
  return jsonb_build_object('id', m.id, 'room_id', m.room_id, 'author_tag', m.author_tag, 'nickname', m.nickname,
    'body', m.body, 'item', m.item, 'reply_to', m.reply_to, 'likes', m.likes, 'created_at', m.created_at);
end;
$$;

-- Toggles this device's like; returns the new count.
create function public.like_chat(p_secret text, p_message bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret); v_likes int;
begin
  if not exists (select 1 from public.chat_messages where id = p_message and not hidden) then raise exception 'chat:message'; end if;
  delete from public.chat_likes where message_id = p_message and author_tag = v_tag;
  if not found then insert into public.chat_likes (message_id, author_tag) values (p_message, v_tag); end if;
  update public.chat_messages set likes = (select count(*) from public.chat_likes where message_id = p_message)
    where id = p_message returning likes into v_likes;
  return v_likes;
end;
$$;

-- One report per device per message. Three reports hide the message until the operator reviews it.
create function public.report_chat(p_secret text, p_message bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret);
begin
  if not exists (select 1 from public.chat_messages where id = p_message) then raise exception 'chat:message'; end if;
  insert into public.chat_reports (message_id, author_tag, reason) values (p_message, v_tag, p_reason) on conflict do nothing;
  update public.chat_messages set reports = (select count(*) from public.chat_reports where message_id = p_message),
    hidden = hidden or (select count(*) from public.chat_reports where message_id = p_message) >= 3
    where id = p_message;
end;
$$;

revoke all on function public.chat_tag(text), public.chat_nickname(text), public.join_chat(text, text),
  public.post_chat(text, text, text, text, text, text, bigint), public.like_chat(text, bigint),
  public.report_chat(text, bigint, text) from public;
grant execute on function public.join_chat(text, text), public.post_chat(text, text, text, text, text, text, bigint),
  public.like_chat(text, bigint), public.report_chat(text, bigint, text) to anon, authenticated;

-- Operator review queue (service role only): reported messages, newest first.
create view analytics.chat_reports_open as
select m.id, m.room_id, m.nickname, m.author_tag, m.body, m.reports, m.hidden, m.created_at,
  array_agg(r.reason order by r.created_at) as reasons
from public.chat_messages m join public.chat_reports r on r.message_id = m.id
group by m.id
order by max(r.created_at) desc;

-- Chat funnel events.
alter table public.app_events drop constraint app_events_name_check;
alter table public.app_events add constraint app_events_name_check check (name in (
  'home_view', 'search', 'product_view', 'wishlist_add', 'wishlist_remove',
  'target_price_set', 'merchant_click', 'notification_opt_in', 'chat_open', 'chat_join', 'chat_send'
));

insert into public.chat_rooms (id, title_en, title_ko, intro_en, intro_ko, sort) values
  ('everyone', 'Everyone', '전체', 'Say hi and talk K-beauty with everyone.', '누구나 K-뷰티 이야기를 나누는 곳', 1),
  ('deals', 'Deal drops', '세일 정보', 'Spotted a price drop? Share the item here.', '가격이 내려간 상품을 공유해요', 2),
  ('new-to-kbeauty', 'New to K-beauty', 'K-뷰티 입문', 'Ask anything: where to start, what to try first.', '무엇부터 써볼지 편하게 물어보세요', 3),
  ('acne', 'Acne & breakouts', '트러블·여드름', 'What actually worked for your breakouts?', '트러블에 효과 본 제품 이야기', 4),
  ('dry-sensitive', 'Dry & sensitive skin', '건성·민감성', 'Gentle picks for dry, irritated skin.', '건조하고 예민한 피부를 위한 추천', 5),
  ('sunscreen', 'Sunscreen talk', '선크림 이야기', 'No white cast, no pilling: share your favorites.', '백탁·밀림 없는 선크림 공유', 6),
  ('makeup', 'Makeup & lips', '색조·립', 'Tints, cushions and shades worth buying.', '틴트·쿠션·컬러 추천', 7),
  ('routine', 'Routine check', '루틴 점검', 'Post your routine and get feedback.', '내 루틴을 올리고 피드백 받기', 8);

insert into public.chat_blocked_terms (term) values
  ('fuck'), ('shit'), ('bitch'), ('cunt'), ('nigger'), ('nigga'), ('faggot'), ('retard'), ('whore'), ('slut'),
  ('porn'), ('onlyfans'), ('nude'), ('telegram'), ('whatsapp'), ('crypto'), ('casino'), ('viagra'), ('escort'),
  ('씨발'), ('시발'), ('병신'), ('좆'), ('개새끼'), ('섹스'), ('보지'), ('자지');
