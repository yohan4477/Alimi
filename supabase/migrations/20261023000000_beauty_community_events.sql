-- Game -> community event contract. Deployed only after production migration applies.
-- No draft text, skin data, names or account identifiers in analytics.
alter table public.app_events drop constraint if exists app_events_name_check;
alter table public.app_events add constraint app_events_name_check check (name in (
 'home_view','search','product_view','wishlist_add','wishlist_remove','target_price_set',
 'merchant_click','notification_opt_in','chat_open','chat_join','chat_send','community_open',
 'post_view','post_create','comment_create','product_card_click','post_save',
 'beauty_draft_open','beauty_room_selected','beauty_post_published'
));
create index if not exists app_events_device_received_idx on public.app_events(device_id,received_at desc);
create or replace view analytics.beauty_community_7d as
with e as (select device_id,name,received_at,props from analytics.events_clean
 where received_at >= now()-interval '7 days'
 and props->>'source'='beauty_play')
select count(distinct device_id) filter(where name='community_open') as community_open_devices,
 count(distinct device_id) filter(where name='beauty_draft_open') as draft_open_devices,
 count(distinct device_id) filter(where name='beauty_room_selected') as room_selected_devices,
 count(distinct device_id) filter(where name='beauty_post_published') as published_devices
from e;
revoke all on analytics.beauty_community_7d from public, anon, authenticated;
