-- Hourly Awin feed-list checks: when Awin last imported the advertiser feed, and whether we downloaded it.
-- Also the evidence for how often Stylevana actually refreshes. Server-only (no client grants).

create table public.feed_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  feed_id text not null,
  last_imported text,
  last_checked text,
  changed boolean not null,
  downloaded boolean not null
);
create index feed_checks_feed_time_idx on public.feed_checks (feed_id, checked_at desc);

alter table public.feed_checks enable row level security;
revoke all on public.feed_checks from anon, authenticated;
