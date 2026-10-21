-- Launch preparation only: apply through the authorized migration workflow before enabling opinion sync.
-- Existing RLS, grants and ownership policies are unchanged.
begin;
alter table public.account_preferences drop constraint if exists account_preferences_key_check;
alter table public.account_preferences add constraint account_preferences_key_check
  check (key in ('alimi-live-v1','seoulbeauty-catalog-saves-v1','seoulbeauty-interests-v1','seoulbeauty-profile-v1','seoulbeauty-opinions-v1'));
commit;
