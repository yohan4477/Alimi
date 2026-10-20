-- Operator SQL test only; not browser/reconnect evidence. All test rows roll back.
-- Run with psql -X -v ON_ERROR_STOP=1 -f scripts/room-recovery-verify.sql
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local role anon;
do $$
declare
  owner_secret text:=gen_random_uuid()::text;
  other_secret text:=gen_random_uuid()::text;
  solo text;
  shared text;
  a jsonb;
begin
  solo:=public.create_room(owner_secret,'QA '||left(owner_secret,8),'','talk','{}');
  if not exists(select 1 from public.chat_room_list where id=solo and cardinality(concerns)=0) then raise exception 'tagless creation failed'; end if;
  begin
    perform public.delete_room(other_secret,solo);
    raise exception 'non-owner deletion unexpectedly allowed';
  exception when others then
    if sqlerrm <> 'chat:owner' then raise; end if;
  end;
  perform public.delete_room(owner_secret,solo);
  if exists(select 1 from public.chat_room_list where id=solo) then raise exception 'deleted room visible'; end if;
  shared:=public.create_room(owner_secret,'QA '||left(other_secret,8),'','talk',array['acne','dry','lip']);
  if not exists(select 1 from public.chat_room_list where id=shared and concerns @> array['acne','dry','lip'] and cardinality(concerns)=3) then raise exception 'tag persistence failed'; end if;
  begin
    perform public.create_room(other_secret,'QA four tags','','talk',array['acne','dry','lip','sun']);
    raise exception 'four tags unexpectedly allowed';
  exception when others then
    if sqlerrm <> 'chat:tags' then raise; end if;
  end;
  perform public.join_chat(other_secret,shared);
  perform public.leave_room(other_secret,shared);
  a:=public.room_actions(owner_secret,shared);
  if (a->>'can_delete')::boolean is distinct from false then raise exception 'sticky participation failed'; end if;
  begin
    perform public.delete_room(owner_secret,shared);
    raise exception 'participated room deletion unexpectedly allowed';
  exception when others then
    if sqlerrm <> 'chat:participated' then raise; end if;
  end;
  perform public.join_chat(other_secret,shared);
  a:=public.room_actions(other_secret,shared);
  if (a->>'joined')::boolean is distinct from true then raise exception 'rejoin failed'; end if;
  raise notice 'PASS: tagless/three-tag creation, tag cap, ownership, solo deletion, participation, leave/rejoin, sticky deletion restriction. Rolled back.';
end $$;
rollback;
