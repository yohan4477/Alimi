-- P0 funnel measurement (#49). Anonymous device ID only: no account, email, IP or free text.
-- Clients may insert; nobody but the service role can read.

create table public.app_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  device_id uuid not null,
  platform text not null check (platform in ('web', 'ios')),
  app_version text check (char_length(app_version) <= 20),
  name text not null check (name in (
    'home_view', 'search', 'product_view', 'wishlist_add', 'wishlist_remove',
    'target_price_set', 'merchant_click', 'notification_opt_in'
  )),
  product_id text check (char_length(product_id) <= 80),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 512)
);
create index app_events_name_time_idx on public.app_events (name, received_at desc);

alter table public.app_events enable row level security;
revoke all on public.app_events from anon, authenticated;
grant insert (device_id, platform, app_version, name, product_id, props) on public.app_events to anon, authenticated;
create policy "anonymous insert" on public.app_events for insert to anon, authenticated with check (true);
