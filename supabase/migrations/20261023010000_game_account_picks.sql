-- Add first-party game choice payloads to the existing per-user preference allowlist.
-- Retains the existing owner-only RLS and 256 KiB value limit.
alter table public.account_preferences
 drop constraint if exists account_preferences_key_check;
alter table public.account_preferences
 add constraint account_preferences_key_check
 check (key in ('alimi-live-v1','seoulbeauty-catalog-saves-v1','seoulbeauty-interests-v1','seoulbeauty-profile-v1','seoulbeauty-game-picks-v1'));
