-- Normalized approved-report ingestion, not a native affiliate-network webhook.
-- Never grant this ledger or RPC to browser roles. No customer/account data is stored.
create table public.affiliate_transaction_revisions (
  network text not null check (network in ('awin','rakuten','coupang')),
  transaction_id text not null check (transaction_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  revision integer not null check (revision > 0),
  status text not null check (status in ('pending','approved','declined','reversed')),
  currency text not null check (currency in ('KRW','USD','EUR','GBP','JPY','CAD','AUD')),
  sale_minor bigint not null check (sale_minor between 0 and 1000000000000),
  commission_minor bigint not null check (commission_minor between 0 and 1000000000000),
  source_ref text check (source_ref ~ '^(post|comment|chat)-[1-9][0-9]{0,18}$'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (network, transaction_id, revision)
);
alter table public.affiliate_transaction_revisions enable row level security;
revoke all on public.affiliate_transaction_revisions from public, anon, authenticated, service_role;
grant select, insert on public.affiliate_transaction_revisions to service_role;

create or replace function public.ingest_affiliate_transaction(p_transaction jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  candidate public.affiliate_transaction_revisions;
  existing public.affiliate_transaction_revisions;
  keys_count integer;
begin
  if jsonb_typeof(p_transaction) <> 'object' then raise exception 'invalid transaction' using errcode='22023'; end if;
  select count(*) into keys_count from jsonb_object_keys(p_transaction);
  if keys_count <> 9 or not p_transaction ?& array['network','transaction_id','revision','status','currency','sale_minor','commission_minor','source_ref','occurred_at'] then
    raise exception 'invalid transaction fields' using errcode='22023';
  end if;
  -- Explicit record projection drops no fields silently: the exact allowlist above is mandatory.
  select * into candidate from jsonb_populate_record(null::public.affiliate_transaction_revisions, p_transaction);
  candidate.received_at := now();
  -- Serialize revisions of one transaction, including conflicting duplicate deliveries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate.network || ':' || candidate.transaction_id, 0));
  select * into existing from public.affiliate_transaction_revisions
    where network=candidate.network and transaction_id=candidate.transaction_id and revision=candidate.revision;
  if found then
    if (to_jsonb(existing) - 'received_at') = (to_jsonb(candidate) - 'received_at') then return 'duplicate'; end if;
    raise exception 'revision conflict' using errcode='23505';
  end if;
  if exists (select 1 from public.affiliate_transaction_revisions where network=candidate.network and transaction_id=candidate.transaction_id and currency<>candidate.currency) then
    raise exception 'transaction currency conflict' using errcode='23505';
  end if;
  insert into public.affiliate_transaction_revisions select candidate.*;
  return 'accepted';
end;
$$;
revoke all on function public.ingest_affiliate_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_affiliate_transaction(jsonb) to service_role;

-- Snapshot revisions, not deltas: a reversal or partial refund replaces prior amounts.
-- Higher source revision wins even when deliveries arrive out of order.
create view public.affiliate_transactions_current with (security_invoker=true) as
select distinct on (network,transaction_id) network,transaction_id,revision,status,currency,
 sale_minor,commission_minor,source_ref,occurred_at,received_at
from public.affiliate_transaction_revisions order by network,transaction_id,revision desc;
revoke all on public.affiliate_transactions_current from public, anon, authenticated;
grant select on public.affiliate_transactions_current to service_role;

create view public.affiliate_attribution_totals with (security_invoker=true) as
select network,currency,source_ref,status,count(*) as transaction_count,
 sum(sale_minor) as sale_minor,sum(commission_minor) as commission_minor
from public.affiliate_transactions_current group by network,currency,source_ref,status;
revoke all on public.affiliate_attribution_totals from public, anon, authenticated;
grant select on public.affiliate_attribution_totals to service_role;
