-- downloaded was previously set at the decision stage, before collection finished.
-- Do not backfill success from those unreliable historical flags.
alter table public.feed_checks
  add column check_succeeded boolean,
  add column import_status text check (import_status in ('pending', 'skipped', 'succeeded', 'failed')),
  add column completed_at timestamptz;
comment on column public.feed_checks.downloaded is
  'For outcome-aware rows only: true after download, validation, snapshot preservation and all catalog/observation imports succeed. Older rows are unverified.';
comment on column public.feed_checks.last_imported is
  'Upstream Awin version timestamp as supplied, not the local import completion time.';
create index feed_checks_success_time_idx on public.feed_checks (feed_id, completed_at desc)
  where import_status = 'succeeded';
-- Existing RLS and server-only access remain unchanged.
