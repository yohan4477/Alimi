-- Run after migration in a disposable database with Supabase roles. Never uses live orders.
begin;
set local role service_role;
do $$
declare
  item jsonb := '{"network":"awin","transaction_id":"fixture-ledger-order","revision":1,"status":"pending","currency":"USD","sale_minor":2500,"commission_minor":250,"source_ref":"post-12","occurred_at":"2026-10-23T00:00:00Z"}';
  result text;
  row_count integer;
  amount bigint;
begin
  result := public.ingest_affiliate_transaction(item);
  if result <> 'accepted' then raise exception 'initial insert failed'; end if;
  result := public.ingest_affiliate_transaction(item);
  if result <> 'duplicate' then raise exception 'duplicate not idempotent'; end if;
  begin
    perform public.ingest_affiliate_transaction(item || '{"commission_minor":999}');
    raise exception 'conflicting duplicate allowed';
  exception when unique_violation then null; end;
  perform public.ingest_affiliate_transaction(item || '{"revision":3,"status":"reversed","sale_minor":0,"commission_minor":0}');
  perform public.ingest_affiliate_transaction(item || '{"revision":2,"status":"approved"}');
  select count(*),max(commission_minor) into row_count,amount from public.affiliate_transactions_current where transaction_id='fixture-ledger-order';
  if row_count<>1 or amount<>0 then raise exception 'out-of-order reversal lost or double counted'; end if;
  if not exists(select 1 from public.affiliate_transactions_current where transaction_id='fixture-ledger-order' and revision=3 and status='reversed') then raise exception 'wrong latest revision'; end if;
  begin
    perform public.ingest_affiliate_transaction(item || '{"revision":4,"currency":"KRW"}');
    raise exception 'currency mutation allowed';
  exception when unique_violation then null; end;
  -- A partial refund is a new total snapshot, not a negative delta.
  perform public.ingest_affiliate_transaction(item || '{"transaction_id":"fixture-partial-refund","revision":1,"status":"approved"}');
  perform public.ingest_affiliate_transaction(item || '{"transaction_id":"fixture-partial-refund","revision":2,"status":"approved","sale_minor":1000,"commission_minor":100}');
  select commission_minor into amount from public.affiliate_transactions_current where transaction_id='fixture-partial-refund';
  if amount<>100 then raise exception 'partial refund totals wrong'; end if;
  begin
    perform public.ingest_affiliate_transaction(item || '{"transaction_id":"fixture-invalid","source_ref":"user-1"}');
    raise exception 'private account source allowed';
  exception when check_violation then null; end;
  begin
    perform public.ingest_affiliate_transaction(item || '{"email":"not-allowed"}');
    raise exception 'unrecognized data allowed';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.affiliate_transaction_revisions; raise exception 'anon ledger exposed'; exception when insufficient_privilege then null; end;
  begin perform * from public.affiliate_attribution_totals; raise exception 'anon metrics exposed'; exception when insufficient_privilege then null; end;
  begin perform public.ingest_affiliate_transaction('{}'); raise exception 'anon RPC exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform * from public.affiliate_transactions_current; raise exception 'authenticated orders exposed'; exception when insufficient_privilege then null; end;
  begin perform public.ingest_affiliate_transaction('{}'); raise exception 'authenticated RPC exposed'; exception when insufficient_privilege then null; end;
  begin delete from public.affiliate_transaction_revisions; raise exception 'authenticated deletion allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
