\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set role service_role;
select public.alimi_ingest_quote(jsonb_build_object('product_id','2','amount_cents',1750,'collected_at',now(),'in_stock',true));
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into public.alimi_devices(user_id,token,environment,time_zone) values(auth.uid(),repeat('a',64),'sandbox',
  (select name from pg_timezone_names where extract(hour from now() at time zone name) between 8 and 21 limit 1));
insert into public.alimi_watches(user_id,product_id) values(auth.uid(),'2');
do $$ begin
  if (select baseline_cents from public.alimi_watches) <> 1750 then raise exception 'Baseline was not server assigned'; end if;
  begin
    update public.alimi_watches set baseline_cents=99999;
    raise exception 'Client changed baseline';
  exception when insufficient_privilege then null; end;
  begin
    perform public.alimi_claim_alerts();
    raise exception 'Client invoked worker';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.alimi_devices(user_id,token,environment,time_zone) values('00000000-0000-0000-0000-000000000002',repeat('b',64),'sandbox','UTC');
    raise exception 'Client inserted another user device';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
  if exists(select 1 from public.alimi_devices) or exists(select 1 from public.alimi_watches) then raise exception 'Cross-user read'; end if;
end $$;
reset role;
set role service_role;
do $$ begin
  if exists(select 1 from public.alimi_claim_alerts()) then raise exception 'Unchanged price alerted'; end if;
end $$;
select public.alimi_ingest_quote(jsonb_build_object('product_id','2','amount_cents',1600,'collected_at',now()+interval '1 second','in_stock',true));
-- An older observation must never replace the fresh quote.
select public.alimi_ingest_quote(jsonb_build_object('product_id','2','amount_cents',1700,'collected_at',now()-interval '1 second','in_stock',true));
do $$ declare c record; n integer; begin
  if (select amount_cents from public.alimi_quotes) <> 1600 then raise exception 'Older quote replaced latest'; end if;
  select count(*) into n from public.alimi_claim_alerts();
  if n <> 1 then raise exception 'Expected one claim, got %',n; end if;
  if exists(select 1 from public.alimi_claim_alerts()) then raise exception 'Concurrent/repeated claim duplicated'; end if;
  select * into c from public.alimi_delivery_state;
  perform public.alimi_finish_alert(c.user_id,c.product_id,c.claim_id,'accepted');
  if exists(select 1 from public.alimi_claim_alerts()) then raise exception 'Accepted price duplicated'; end if;
end $$;
select public.alimi_ingest_quote(jsonb_build_object('product_id','2','amount_cents',1500,'collected_at',now()+interval '2 seconds','in_stock',false));
do $$ begin
  if exists(select 1 from public.alimi_claim_alerts()) then raise exception 'Out-of-stock price alerted'; end if;
end $$;
select public.alimi_ingest_quote(jsonb_build_object('product_id','2','amount_cents',1500,'collected_at',now()+interval '3 seconds','in_stock',true));
do $$ declare c record; begin
  select * into c from public.alimi_claim_alerts();
  if c.claim_id is null then raise exception 'Further price drop missing'; end if;
  perform public.alimi_finish_alert(c.user_id,c.product_id,c.claim_id,'unknown');
  if exists(select 1 from public.alimi_claim_alerts()) then raise exception 'Unknown outcome automatically retried'; end if;
end $$;
reset role;
-- RLS must be enabled on every exposed table.
do $$ begin
  if exists(select 1 from pg_class where relname like 'alimi_%' and relkind='r' and not relrowsecurity) then raise exception 'RLS missing'; end if;
end $$;
