-- Run on an isolated database after the migration. Always rolls back fixtures.
begin;
set local role service_role;
delete from public.you_too_answers where product='romand-tint';
do $$
declare a text:=repeat('a',64); b text:=repeat('b',64); s jsonb; r jsonb;
begin
 perform public.you_too_action('vote',a,'romand-tint','own','unopened',null,false);
 s:=public.you_too_action('share',a,'romand-tint',null,null,null,false);
 r:=public.you_too_action('invite',null,null,null,null,(s->>'id')::uuid,false);
 assert r->>'detail' is null,'usage is opt-in';
 perform public.you_too_action('vote',b,'romand-tint','own','often',(s->>'id')::uuid,false);
 perform public.you_too_action('vote',a,'romand-tint','never','want',null,false);
 r:=public.you_too_action('read',a,'romand-tint',null,null,null,false);
 assert (r->'details'->'own'->>'unopened') is null,'branch changes remove previous usage';
 r:=public.you_too_action('invite',null,null,null,null,(s->>'id')::uuid,false);
 assert r->>'choice'='own','shared snapshot remains stable';
 assert not has_table_privilege('anon','public.you_too_answers','select'),'no anonymous answer listing';
 assert not has_function_privilege('authenticated','public.you_too_action(text,text,text,text,text,uuid,boolean)','execute'),'no direct client RPC';
end $$;
rollback;
