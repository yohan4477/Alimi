-- Read-only; no credentials, raw answers, voter/session IDs or notes in output.
select table_schema,table_name,column_name,data_type from information_schema.columns
where (table_schema='public' and table_name='owned_product_votes')
   or (table_schema='beauty_game' and table_name='ownership_events') order by 1,2,ordinal_position;
select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname='owned_product_votes') or (n.nspname='beauty_game' and c.relname='ownership_events');
select n.nspname,p.proname,p.prosecdef,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('beauty_operations_metrics','record_owned_poll_event');
select tablename,indexdef from pg_indexes where schemaname='public' and tablename='owned_product_votes';
