-- Reference sites shown in the admin 「레퍼런스」 tab (admin page reads them with the server secret key only).
-- Videos live in the private Storage bucket `reference-media` (created by scripts/upload-reference-media.mjs).
create table if not exists public.reference_sites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  title text not null,
  description text not null default '',
  page_path text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.reference_sites enable row level security;
revoke all on public.reference_sites from anon, authenticated;
-- No RLS policies: anon/authenticated have no access; the service role bypasses RLS.
insert into public.reference_sites (slug, title, description, page_path, sort) values
  ('effects-gallery', '연출 효과 비교판', '유튜브 43줄·릴 20줄·지도 25줄, 원본|재현 영상', 'server/reference-gallery.html', 1),
  ('musk-interview-effects', '머스크 인터뷰 효과 예시', '효과 8개, 적용|원본 영상과 효과별 출처', 'server/reference-musk.html', 2)
on conflict (slug) do nothing;
