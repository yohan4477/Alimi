-- Disposable Supabase-compatible database only; test user IDs are synthetic.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare n integer; v integer;
begin
  select count(*) into n from public.save_beauty_account_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','kr','ko','test','private fixture',0);
  if n<>1 then raise exception 'owner create failed'; end if;
  select count(*) into n from public.beauty_account_drafts;
  if n<>1 then raise exception 'owner read failed'; end if;
  select revision into v from public.save_beauty_account_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','kr','ko','updated','changed fixture',1);
  if v<>2 then raise exception 'owner revision update failed'; end if;
  select count(*) into n from public.save_beauty_account_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','kr','ko','stale','must not overwrite',1);
  if n<>0 then raise exception 'stale save overwrote newer draft'; end if;
  if not exists(select 1 from public.beauty_account_drafts where body='changed fixture') then raise exception 'newer content lost'; end if;
  begin
    update public.beauty_account_drafts set user_id='22222222-2222-4222-8222-222222222222';
    raise exception 'ownership transfer allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$
declare n integer;
begin
  select count(*) into n from public.beauty_account_drafts;
  if n<>0 then raise exception 'other account read draft'; end if;
  select count(*) into n from public.save_beauty_account_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','kr','ko','other','must not overwrite',2);
  if n<>0 then raise exception 'other account changed draft'; end if;
  delete from public.beauty_account_drafts;
  get diagnostics n = row_count;
  if n<>0 then raise exception 'other account deleted draft'; end if;
  begin
    insert into public.beauty_account_drafts(user_id,id,region,language,body) values('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','kr','ko','impersonated');
    raise exception 'other account inserted owner draft';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Server expiry is hidden from owner on other devices too.
update public.beauty_account_drafts set expires_at=now()-interval '1 second';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare n integer; begin
  select count(*) into n from public.beauty_account_drafts;
  if n<>0 then raise exception 'expired content readable'; end if;
  select count(*) into n from public.save_beauty_account_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','kr','ko','expired','must not revive',2);
  if n<>0 then raise exception 'expired content updated'; end if;
  perform * from public.save_beauty_account_draft('cccccccc-cccc-4ccc-8ccc-cccccccccccc','kr','ko','delete','private fixture',0);
  delete from public.beauty_account_drafts where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics n = row_count;
  if n<>1 then raise exception 'owner delete failed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.beauty_account_drafts; raise exception 'anon read allowed'; exception when insufficient_privilege then null; end;
  begin perform * from public.save_beauty_account_draft('dddddddd-dddd-4ddd-8ddd-dddddddddddd','kr','ko','','private fixture',0); raise exception 'anon save allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
