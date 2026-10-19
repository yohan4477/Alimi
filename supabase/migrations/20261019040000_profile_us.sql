-- Self-reported community profile under US rules (COPPA, CCPA/CPRA, Washington MHMDA and similar state laws).
-- Only what the person types in is stored; nothing is inferred from conversations. Every field is optional.
--   * No band below 13: the client never saves a profile for under-13s (COPPA).
--   * Under 16 cannot opt in to B2B sharing (CCPA treats it as a sale needing the minor's own opt-in; we do not offer it).
--   * Skin concerns can be consumer health data (MHMDA): stored only with a separate health consent, never shared B2B.
--   * opt_out_sale records "Do Not Sell or Share" (or a Global Privacy Control signal) and forces consent_b2b off.
-- The table stays unreadable to clients; get_profile / set_profile / delete_profile work only with the owner's secret.

update public.community_profiles set age_band = null where age_band = '13-17';
alter table public.community_profiles drop constraint if exists community_profiles_age_band_check;
alter table public.community_profiles
  add constraint community_profiles_age_band_check check (age_band in ('13-15', '16-17', '18-24', '25-34', '35-44', '45-54', '55+')),
  add column skin_type text check (skin_type in ('dry', 'oily', 'combination', 'sensitive', 'normal')),
  add column skin_tone text check (skin_tone in ('fair', 'light', 'medium', 'tan', 'deep')),
  add column undertone text check (undertone in ('cool', 'warm', 'neutral')),
  add column climate text check (climate in ('humid', 'dry', 'mixed')),
  add column concerns text[] not null default '{}' check (concerns <@ array['acne', 'redness', 'dryness', 'pores', 'dark_spots', 'aging', 'sensitivity']::text[]),
  add column consent_health boolean not null default false,
  add column opt_out_sale boolean not null default false,
  add column gpc boolean not null default false,
  add constraint community_profiles_health_consent check (cardinality(concerns) = 0 or consent_health),
  add constraint community_profiles_b2b_age check (not (consent_b2b and (age_band is null or age_band = '13-15'))),
  add constraint community_profiles_b2b_opt_out check (not (consent_b2b and opt_out_sale)),
  add constraint community_profiles_interests check (cardinality(interests) <= 12);

create function public.get_profile(p_secret text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(p) - 'author_tag' from public.community_profiles p where p.author_tag = public.chat_tag(p_secret);
$$;

-- Replaces the whole profile with the given fields (missing = cleared). Invalid values fail the table checks.
create function public.set_profile(p_secret text, p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text := public.chat_tag(p_secret);
  v_opt_out boolean := coalesce((p_profile->>'opt_out_sale')::boolean, false) or coalesce((p_profile->>'gpc')::boolean, false);
  v_interests text[] := coalesce(array(select jsonb_array_elements_text(p_profile->'interests')), '{}');
  v_concerns text[] := coalesce(array(select jsonb_array_elements_text(p_profile->'concerns')), '{}');
begin
  if exists (select 1 from public.chat_bans where author_tag = v_tag) then raise exception 'chat:banned'; end if;
  if exists (select 1 from unnest(v_interests) i where i !~ '^[a-z0-9-]{2,30}$') then raise exception 'profile:invalid'; end if;
  insert into public.community_profiles as p (author_tag, country, age_band, interests, skin_type, skin_tone, undertone, climate, concerns,
      consent_analytics, consent_health, consent_b2b, opt_out_sale, gpc, updated_at)
    values (v_tag, nullif(upper(p_profile->>'country'), ''), nullif(p_profile->>'age_band', ''), v_interests,
      nullif(p_profile->>'skin_type', ''), nullif(p_profile->>'skin_tone', ''), nullif(p_profile->>'undertone', ''), nullif(p_profile->>'climate', ''),
      case when coalesce((p_profile->>'consent_health')::boolean, false) then v_concerns else '{}' end,
      coalesce((p_profile->>'consent_analytics')::boolean, false), coalesce((p_profile->>'consent_health')::boolean, false),
      coalesce((p_profile->>'consent_b2b')::boolean, false) and not v_opt_out, v_opt_out, coalesce((p_profile->>'gpc')::boolean, false), now())
    on conflict (author_tag) do update set country = excluded.country, age_band = excluded.age_band, interests = excluded.interests,
      skin_type = excluded.skin_type, skin_tone = excluded.skin_tone, undertone = excluded.undertone, climate = excluded.climate,
      concerns = excluded.concerns, consent_analytics = excluded.consent_analytics, consent_health = excluded.consent_health,
      consent_b2b = excluded.consent_b2b, opt_out_sale = excluded.opt_out_sale, gpc = excluded.gpc, updated_at = now();
  return public.get_profile(p_secret);
exception when check_violation or invalid_text_representation or string_data_right_truncation then raise exception 'profile:invalid';
end;
$$;

-- Right to delete: removes the stored profile entirely.
create function public.delete_profile(p_secret text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.community_profiles where author_tag = public.chat_tag(p_secret);
$$;

revoke all on function public.get_profile(text), public.set_profile(text, jsonb), public.delete_profile(text) from public;
grant execute on function public.get_profile(text), public.set_profile(text, jsonb), public.delete_profile(text) to anon, authenticated;
