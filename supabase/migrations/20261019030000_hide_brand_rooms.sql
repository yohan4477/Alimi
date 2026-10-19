-- Brand chat rooms are retired: topics carry the conversation and brands live on the brand page.
-- Deactivate instead of delete so past messages, members and reports stay intact (reversible by setting active = true).
-- chat_room_list already filters on active, and join_chat / post_chat reject inactive rooms.
update public.chat_rooms set active = false where kind = 'brand';
