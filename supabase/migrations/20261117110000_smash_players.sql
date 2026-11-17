-- 「서현역 부수기」 닉네임 주인 확인: 닉네임마다 비밀번호(scrypt 해시) 하나. 같은 닉네임은 비밀번호를 아는 사람만 기록을 올린다.
-- 순위표는 닉네임당 최고 점수 한 줄만 남긴다.
create table if not exists public.smash_players (
  nickname text primary key check (char_length(nickname) between 1 and 12),
  pin_hash text not null check (char_length(pin_hash) between 40 and 200),
  fail_count integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.smash_players enable row level security;
revoke all on public.smash_players from anon, authenticated;

-- 같은 (게임, 닉네임) 중 최고 점수 한 줄만 남기고 지운 뒤 유일 조건
delete from public.smash_scores s
using public.smash_scores t
where s.game = t.game and s.nickname = t.nickname
  and (s.score < t.score or (s.score = t.score and s.id > t.id));
alter table public.smash_scores add column if not exists updated_at timestamptz not null default now();
create unique index if not exists smash_scores_game_nickname_uq on public.smash_scores (game, nickname);
-- No RLS policies: anon/authenticated have no access; the service role bypasses RLS.
