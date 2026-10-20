-- Apply to the application's existing project; no anonymous access.
create table if not exists public.account_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('alimi-live-v1','seoulbeauty-catalog-saves-v1','seoulbeauty-interests-v1','seoulbeauty-profile-v1')),
  value text check (value is null or octet_length(value) <= 262144),
  primary key (user_id,key)
);
alter table public.account_preferences enable row level security;
revoke all on public.account_preferences from anon;
grant select, insert, update, delete on public.account_preferences to authenticated;
drop policy if exists account_preferences_owner on public.account_preferences;
create policy account_preferences_owner on public.account_preferences for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
