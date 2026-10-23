// Isolated PostgreSQL only. Never connects to production or reads real user data.
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
export const migrations = ['20261023084934_room_lifecycle_and_tags.sql','20261023084941_room_experiences.sql'];
export const sqlFile = name => readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
export async function roomFixture() {
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema analytics;
 create table app_events(name text constraint app_events_name_check check(name in ('home_view')));
 create table catalog_items(retailer text,market text,sku text,brand text,brand_ko text,name text,price_minor integer,image_url text,family_key text,currency text,base_name text,category text,unit_price_minor integer,active boolean);
 create table brand_logos(brand text,logo_url text);
 create table catalog_brands(brand text,brand_ko text,families bigint);
 grant select on brand_logos,catalog_items to anon,authenticated;`);
 for(const file of ['20261018090000_chat.sql','20261018110000_chat_room_kinds.sql','20261019010000_community.sql','20261019050000_user_rooms.sql','20261019060000_concern_keywords.sql']) await db.exec(await sqlFile(file));
 await db.exec(await sqlFile('20261020082459_service_regions.sql'));
 await db.exec(`create view room_list_dependency as select id,service_region from chat_room_list;
 do $x$ declare def text; begin def:=rtrim(pg_get_viewdef('chat_room_list'::regclass,true),E';\\n '); execute 'create or replace view chat_room_list with(security_invoker=true) as select old.*, ''kept''::text as integration_marker from ('||def||') old';end $x$;`);
 return db;
}
