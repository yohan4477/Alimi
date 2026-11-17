-- 「서현역 부수기」 게임 순위표 (seoulbeauty.me/seohyeon-smash). 서버(api/smash-rank.js)만 secret key로 읽고 쓴다.
-- 저장하는 것: 닉네임, 점수(부순 집값 원), 붕괴 수, 해시한 접속 식별자(도배 막기용). 개인정보 없음.
create table if not exists public.smash_scores (
  id bigserial primary key,
  game text not null default 'seohyeon' check (game ~ '^[a-z0-9-]{1,30}$'),
  nickname text not null check (char_length(nickname) between 1 and 12),
  score bigint not null check (score >= 0 and score < 1000000000000000000),
  destroyed integer not null default 0 check (destroyed between 0 and 100000),
  client_hash text not null check (char_length(client_hash) = 64),
  created_at timestamptz not null default now()
);
create index if not exists smash_scores_game_score_idx on public.smash_scores (game, score desc);
create index if not exists smash_scores_client_recent_idx on public.smash_scores (client_hash, created_at desc);
alter table public.smash_scores enable row level security;
revoke all on public.smash_scores from anon, authenticated;
revoke all on sequence public.smash_scores_id_seq from anon, authenticated;
-- No RLS policies: anon/authenticated have no access; the service role bypasses RLS.
