-- 「서현역 부수기」 진행 저장(무기고 강화·해금·도감·출석). 닉네임+비밀번호(smash_players)로만 읽고 쓴다.
create table if not exists public.smash_progress (
  nickname text primary key references public.smash_players(nickname) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 32768),
  updated_at timestamptz not null default now()
);
alter table public.smash_progress enable row level security;
revoke all on public.smash_progress from anon, authenticated;
-- No RLS policies: anon/authenticated have no access; the service role bypasses RLS.
