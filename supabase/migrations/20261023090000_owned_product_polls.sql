-- Staged feature: owned-product poll. No public table access.
create table if not exists public.owned_product_votes (
 id uuid primary key default gen_random_uuid(),
 product_id text not null check (length(product_id) between 1 and 80),
 voter_id uuid not null,
 choice text not null check (choice in ('owned','want','disliked','unknown')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (product_id, voter_id)
);
create index if not exists owned_product_votes_product_idx on public.owned_product_votes(product_id);
alter table public.owned_product_votes enable row level security;
revoke all on public.owned_product_votes from anon, authenticated;
-- Reads and writes only through server-side service key, never direct clients.
