-- PRD 05: reports no longer hide content by count. Any device can mint new anonymous authors, so
-- "3 reports" let one person hide anything. Only urgent reasons (personal information, threats,
-- sexual content) hide at once; everything else waits for an operator. Every hide/unhide is logged.
-- Rollback: supabase/rollbacks/20261022000000_report_review_queue_down.sql
begin;

alter table public.chat_reports drop constraint chat_reports_reason_check;
alter table public.chat_reports add constraint chat_reports_reason_check
  check (reason in ('spam', 'abuse', 'sexual', 'other', 'privacy', 'threat'));
alter table public.community_reports drop constraint community_reports_reason_check;
alter table public.community_reports add constraint community_reports_reason_check
  check (reason in ('spam', 'abuse', 'sexual', 'other', 'privacy', 'threat'));

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  target text not null check (target in ('chat', 'post', 'comment')),
  target_id bigint not null,
  action text not null check (action in ('auto_hide', 'hide', 'unhide', 'dismiss')),
  reason text not null check (char_length(reason) between 1 and 300),
  actor text not null check (char_length(actor) between 1 and 80),  -- 'system' or an operator name, never a device secret
  created_at timestamptz not null default now()
);
-- No policies and no grants: only service_role (dashboard, admin server) reads the log.
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;
create index moderation_actions_target_idx on public.moderation_actions (target, target_id, created_at desc);

create or replace function public.report_chat(p_secret text, p_message bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret);
begin
  if not exists (select 1 from public.chat_messages where id = p_message) then raise exception 'chat:message'; end if;
  insert into public.chat_reports (message_id, author_tag, reason) values (p_message, v_tag, p_reason) on conflict do nothing;
  update public.chat_messages set reports = (select count(*) from public.chat_reports where message_id = p_message)
    where id = p_message;
  if p_reason in ('privacy', 'threat', 'sexual') then
    update public.chat_messages set hidden = true where id = p_message and not hidden;
    if found then
      insert into public.moderation_actions (target, target_id, action, reason, actor)
        values ('chat', p_message, 'auto_hide', p_reason, 'system');
    end if;
  end if;
end;
$$;

create or replace function public.report_community(p_secret text, p_target text, p_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tag text := public.chat_tag(p_secret); v_n int;
begin
  if p_target not in ('post', 'comment') then raise exception 'chat:message'; end if;
  if not (case p_target when 'post' then exists (select 1 from public.community_posts where id = p_id)
                        else exists (select 1 from public.community_comments where id = p_id) end) then
    raise exception 'chat:message';
  end if;
  insert into public.community_reports (target, target_id, author_tag, reason) values (p_target, p_id, v_tag, p_reason) on conflict do nothing;
  select count(*) into v_n from public.community_reports where target = p_target and target_id = p_id;
  if p_target = 'post' then update public.community_posts set reports = v_n where id = p_id;
  else update public.community_comments set reports = v_n where id = p_id; end if;
  if p_reason in ('privacy', 'threat', 'sexual') then
    if p_target = 'post' then update public.community_posts set hidden = true where id = p_id and not hidden;
    else update public.community_comments set hidden = true where id = p_id and not hidden; end if;
    if found then
      insert into public.moderation_actions (target, target_id, action, reason, actor)
        values (p_target, p_id, 'auto_hide', p_reason, 'system');
    end if;
  end if;
end;
$$;

-- Operator decision on reported content (service_role only): hide, unhide or dismiss, always logged.
create or replace function public.moderate(p_target text, p_id bigint, p_action text, p_reason text, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action not in ('hide', 'unhide', 'dismiss') then raise exception 'moderate:action'; end if;
  if p_action <> 'dismiss' then
    case p_target
      when 'chat' then update public.chat_messages set hidden = (p_action = 'hide') where id = p_id;
      when 'post' then update public.community_posts set hidden = (p_action = 'hide') where id = p_id;
      when 'comment' then update public.community_comments set hidden = (p_action = 'hide') where id = p_id;
      else raise exception 'moderate:target';
    end case;
    if not found then raise exception 'moderate:missing'; end if;
  end if;
  insert into public.moderation_actions (target, target_id, action, reason, actor) values (p_target, p_id, p_action, p_reason, p_actor);
end;
$$;
revoke all on function public.moderate(text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.moderate(text, bigint, text, text, text) to service_role;

-- Internal helpers run inside the definer RPCs; they are not part of the public API.
revoke execute on function public.community_guard(text, text) from public, anon, authenticated;
revoke execute on function public.community_guard_text(text) from public, anon, authenticated;
revoke execute on function public.community_item(text, text, text) from public, anon, authenticated;
-- Price tracking is out of scope (docs/DECISIONS.md); the region-less room RPC is superseded by create_region_room.
revoke execute on function public.request_tracking(text, text, text) from public, anon, authenticated;
revoke execute on function public.create_room(text, text, text, text, text[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
