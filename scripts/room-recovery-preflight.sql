-- Read-only. Run on mqsnshnlfwsgabrsmqsz using an authorized SQL connection.
begin read only;
select current_database(), current_user, version();
select to_regclass('supabase_migrations.schema_migrations') as history_table;
-- If this fails, STOP: do not interpret inaccessible history as missing history.
select version, name from supabase_migrations.schema_migrations order by version;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and table_name in ('chat_rooms','chat_room_list') order by table_name,ordinal_position;
select p.oid::regprocedure as signature,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_room','room_actions','leave_room','delete_room','room_participation_guard','archive_empty_rooms','close_room');
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.chat_rooms'::regclass;
select tgname,pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgname like 'room_%';
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('chat_rooms','chat_members','chat_messages','community_posts','community_comments');
select relname,relrowsecurity,reloptions from pg_class where oid in ('public.chat_rooms'::regclass,'public.chat_room_list'::regclass);
select extname from pg_extension where extname='pg_cron';
rollback;
