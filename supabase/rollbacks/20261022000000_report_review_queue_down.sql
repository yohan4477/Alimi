-- Reverts 20261022000000_report_review_queue.sql to the production definitions read on 2026-10-21.
-- Not a migration: run by hand (SQL editor) only if the forward migration must be undone.
-- moderation_actions is kept as an audit record; drop it separately if really needed.
begin;

-- Reports with the new reasons have no meaning under the old rule set.
update public.chat_reports set reason = 'other' where reason in ('privacy', 'threat');
update public.community_reports set reason = 'other' where reason in ('privacy', 'threat');
alter table public.chat_reports drop constraint chat_reports_reason_check;
alter table public.chat_reports add constraint chat_reports_reason_check check (reason in ('spam', 'abuse', 'sexual', 'other'));
alter table public.community_reports drop constraint community_reports_reason_check;
alter table public.community_reports add constraint community_reports_reason_check check (reason in ('spam', 'abuse', 'sexual', 'other'));

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
  update public.chat_messages set reports = (select count(*) from public.chat_reports where message_id = p_message),
    hidden = hidden or (select count(*) from public.chat_reports where message_id = p_message) >= 3
    where id = p_message;
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
  insert into public.community_reports (target, target_id, author_tag, reason) values (p_target, p_id, v_tag, p_reason) on conflict do nothing;
  select count(*) into v_n from public.community_reports where target = p_target and target_id = p_id;
  if p_target = 'post' then update public.community_posts set reports = v_n, hidden = hidden or v_n >= 3 where id = p_id;
  else update public.community_comments set reports = v_n, hidden = hidden or v_n >= 3 where id = p_id; end if;
end;
$$;

drop function public.moderate(text, bigint, text, text, text);

grant execute on function public.community_guard(text, text) to anon, authenticated;
grant execute on function public.community_guard_text(text) to anon, authenticated;
grant execute on function public.community_item(text, text, text) to anon, authenticated;
grant execute on function public.request_tracking(text, text, text) to anon, authenticated;
grant execute on function public.create_room(text, text, text, text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
