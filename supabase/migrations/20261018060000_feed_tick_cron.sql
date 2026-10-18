-- Reliable hourly clock for the feed check: pg_cron calls the feed-tick Edge Function at :05.
-- feed_ticks records each dispatch so the function can rate-limit itself (server-only table).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.feed_ticks (
  id bigint generated always as identity primary key,
  dispatched_at timestamptz not null default now(),
  github_status int
);
alter table public.feed_ticks enable row level security;
revoke all on public.feed_ticks from anon, authenticated;

select cron.schedule('alimi-feed-tick', '5 * * * *', $$
  select net.http_post(
    url := 'https://mqsnshnlfwsgabrsmqsz.supabase.co/functions/v1/feed-tick',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
