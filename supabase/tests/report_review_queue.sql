-- Checks for 20261022000000_report_review_queue.sql. Run against a local database:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/report_review_queue.sql
-- Everything runs in one transaction and is rolled back.
begin;

insert into public.chat_rooms (id, title_en, title_ko, intro_en, intro_ko) values ('t-room', 'T', 'T', '', '');
insert into public.chat_messages (room_id, author_tag, nickname, body) values ('t-room', 'x', 'X', 'an opinion');
insert into public.chat_messages (room_id, author_tag, nickname, body) values ('t-room', 'x', 'X', 'my phone is 010...');
insert into public.community_posts (room_id, author_tag, nickname, kind, title) values ('t-room', 'x', 'X', 'question', 'A question');

set local role anon;

-- Three different devices reporting an opinion no longer hide it.
select public.report_chat('00000000-0000-4000-8000-00000000000' || n, (select min(id) from public.chat_messages where room_id = 't-room'), 'abuse')
  from generate_series(1, 3) n;
-- One urgent report hides at once.
select public.report_chat('00000000-0000-4000-8000-000000000009', (select max(id) from public.chat_messages where room_id = 't-room'), 'privacy');
select public.report_community('00000000-0000-4000-8000-00000000000' || n, 'post', (select max(id) from public.community_posts), 'spam')
  from generate_series(1, 3) n;

reset role;
do $$
begin
  assert (select not hidden and reports = 3 from public.chat_messages where room_id = 't-room' and body = 'an opinion'), 'opinion stays visible';
  assert (select hidden from public.chat_messages where room_id = 't-room' and body like 'my phone%'), 'privacy report hides';
  assert (select not hidden and reports = 3 from public.community_posts where title = 'A question'), 'post stays visible';
  assert (select count(*) = 1 from public.moderation_actions where target = 'chat' and action = 'auto_hide'), 'auto hide logged once';
end $$;

-- Reporting a post that does not exist is rejected instead of leaving an orphan row.
set local role anon;
do $$
begin
  perform public.report_community('00000000-0000-4000-8000-000000000001', 'post', -1, 'spam');
  raise exception 'expected chat:message';
exception when others then
  if sqlerrm <> 'chat:message' then raise; end if;
end $$;

-- Helpers and retired RPCs are no longer callable through the API roles.
do $$
declare f text;
begin
  foreach f in array array['public.community_guard(text,text)', 'public.community_guard_text(text)', 'public.community_item(text,text,text)',
                           'public.request_tracking(text,text,text)', 'public.create_room(text,text,text,text,text[])',
                           'public.moderate(text,bigint,text,text,text)'] loop
    assert not has_function_privilege('anon', f, 'execute'), f || ' anon';
    assert not has_function_privilege('authenticated', f, 'execute'), f || ' authenticated';
  end loop;
  assert has_function_privilege('anon', 'public.post_chat(text,text,text,text,text,text,bigint)', 'execute'), 'post_chat still public';
  assert not has_table_privilege('anon', 'public.moderation_actions', 'select'), 'log is private';
end $$;

-- Writes that call the revoked helpers internally still work for anon.
select public.add_comment('00000000-0000-4000-8000-000000000005', (select max(id) from public.community_posts), 'still works');
select public.create_post('00000000-0000-4000-8000-000000000006', 't-room', 'question', 'Another question');

-- Operators can restore a hidden message, and the change is logged.
reset role;
select public.moderate('chat', (select max(id) from public.chat_messages where room_id = 't-room'), 'unhide', 'not personal data', 'ops-test');
do $$
begin
  assert (select not hidden from public.chat_messages where room_id = 't-room' and body like 'my phone%'), 'unhidden';
  assert (select count(*) = 1 from public.moderation_actions where action = 'unhide' and actor = 'ops-test'), 'unhide logged';
end $$;

select 'report_review_queue: all checks passed' as result;
rollback;
