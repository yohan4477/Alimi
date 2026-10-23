-- Account-owned mapping for anonymous community identities.
-- The original author_tag stays in content tables for existing public display and guest access.
create table if not exists public.account_chat_identities (
  user_id uuid not null references auth.users(id) on delete cascade,
  author_tag text not null unique,
  linked_at timestamptz not null default now(),
  primary key(user_id, author_tag)
);
alter table public.account_chat_identities enable row level security;
revoke all on public.account_chat_identities from public, anon, authenticated;
grant select on public.account_chat_identities to authenticated;
create policy "read own linked identities" on public.account_chat_identities
  for select to authenticated using ((select auth.uid()) = user_id);

-- Validate device ownership using exactly the same server-side chat_tag(secret) function
-- used for authorship of existing posts, comments and chat messages.
create or replace function public.link_my_chat_identity(p_secret text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
declare v_tag text;
declare v_existing uuid;
begin
  if v_uid is null then raise exception 'account:unauthorized'; end if;
  v_tag := public.chat_tag(p_secret);
  select user_id into v_existing from public.account_chat_identities where author_tag = v_tag;
  if v_existing is not null and v_existing <> v_uid then
    raise exception 'account:identity_already_linked';
  end if;
  insert into public.account_chat_identities(user_id,author_tag)
  values(v_uid,v_tag) on conflict (author_tag) do nothing;
  return jsonb_build_object('linked',true);
end $$;
revoke all on function public.link_my_chat_identity(text) from public, anon;
grant execute on function public.link_my_chat_identity(text) to authenticated;

-- The activity RPC only returns records for identities bound to the calling account.
-- Never trust a user-supplied uid/tag filter as authorization.
create or replace function public.get_my_account_activity()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else
   jsonb_build_object(
     'posts',coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select p.id,p.room_id,p.title,p.kind,p.created_at
        from public.community_posts p join public.account_chat_identities i on i.author_tag=p.author_tag
        where i.user_id=(select auth.uid()) and not p.hidden order by p.created_at desc limit 100
     ) x),'[]'::jsonb),
     'comments',coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select c.id,c.post_id,c.body,c.created_at
        from public.community_comments c join public.account_chat_identities i on i.author_tag=c.author_tag
        where i.user_id=(select auth.uid()) and not c.hidden order by c.created_at desc limit 100
     ) x),'[]'::jsonb),
     'messages',coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select m.id,m.room_id,m.body,m.created_at
        from public.chat_messages m join public.account_chat_identities i on i.author_tag=m.author_tag
        where i.user_id=(select auth.uid()) and not m.hidden order by m.created_at desc limit 100
     ) x),'[]'::jsonb),
     'rooms',coalesce((select jsonb_agg(x) from (
        select distinct r.room_id from public.chat_members r join public.account_chat_identities i on i.author_tag=r.author_tag
        where i.user_id=(select auth.uid()) limit 100
     ) x),'[]'::jsonb),
     'votes',coalesce((select jsonb_agg(x) from (
        select v.target,v.target_id from public.community_likes v join public.account_chat_identities i on i.author_tag=v.author_tag
        where i.user_id=(select auth.uid()) limit 100
     ) x),'[]'::jsonb)
   ) end
$$;
revoke all on function public.get_my_account_activity() from public, anon;
grant execute on function public.get_my_account_activity() to authenticated;
