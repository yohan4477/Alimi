-- Private, explicit account snapshots, not public posts. Expired rows are unreadable.
create table public.beauty_account_drafts (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null,
 region text not null check(region in ('kr','us')),
 language text not null check(language in ('ko','en')),
 title text not null default '' check(length(title)<=120),
 body text not null check(length(btrim(body))>0 and length(body)<=2000),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days',
 primary key(user_id,id)
);
alter table public.beauty_account_drafts enable row level security;
revoke all on public.beauty_account_drafts from public, anon, authenticated;
grant select,insert,update,delete on public.beauty_account_drafts to authenticated;
create policy draft_read on public.beauty_account_drafts for select to authenticated
 using((select auth.uid())=user_id and expires_at>now());
create policy draft_insert on public.beauty_account_drafts for insert to authenticated
 with check((select auth.uid())=user_id and expires_at<=now()+interval '30 days');
create policy draft_update on public.beauty_account_drafts for update to authenticated
 using((select auth.uid())=user_id and expires_at>now())
 with check((select auth.uid())=user_id and expires_at<=now()+interval '30 days');
create policy draft_delete on public.beauty_account_drafts for delete to authenticated
 using((select auth.uid())=user_id);
create index beauty_account_drafts_expiry on public.beauty_account_drafts(expires_at);
-- Invoker, not definer: every operation is still subject to owner RLS.
create function public.save_beauty_account_draft(p_id uuid,p_region text,p_language text,p_title text,p_body text,p_revision integer)
returns setof public.beauty_account_drafts language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'login required' using errcode='42501'; end if;
 if p_revision=0 then
   return query insert into public.beauty_account_drafts(id,region,language,title,body)
   values(p_id,p_region,p_language,p_title,p_body) returning *;
 else
   return query update public.beauty_account_drafts set region=p_region,language=p_language,title=p_title,body=p_body,
   revision=revision+1,updated_at=now(),expires_at=now()+interval '30 days'
   where user_id=auth.uid() and id=p_id and revision=p_revision returning *;
 end if;
end $$;
revoke all on function public.save_beauty_account_draft(uuid,text,text,text,text,integer) from public,anon;
grant execute on function public.save_beauty_account_draft(uuid,text,text,text,text,integer) to authenticated;
comment on table public.beauty_account_drafts is 'Explicit private snapshots. Delete expired rows daily with the approved operations scheduler.';
