# Beauty Play → Seoul Beauty full journey implementation (2026-10-23)

## Added on feature branch
- Private game draft locally matches existing regional conversations by title and description. Ranked matches appear before other rooms; no invisible auto-join and no automatic publication.
- Three new event types in community: `beauty_draft_open`, `beauty_room_selected`, `beauty_post_published`; published event fires only after createPost resolves, before local draft cleanup. No free-text event payload.
- Database migration expands app_events allowlist and creates a restricted aggregate view. Migration MUST apply before deploying event-writing frontend. Browser events can fail silently until migration is in place.
- Admin dashboard shows anonymous unique devices for each game handoff stage, NOT a verified sequential funnel.
- Pure recommendation unit tests.

## Not complete / do not claim release
- Live successful public post verification is not performed in this change; posting can create public user content and requires controlled operator QA.
- No authenticated cloud draft syncing or device recovery: existing 24-hour same-tab sessionStorage behavior remains. Do not misleadingly suggest this has been fixed.
- No verified game-side event cohort ID joined to community (game runs on separate upstream), no verified affiliate order callback, approved commission, or paid conversion measurement.
- No independently confirmed production DB migration, actual deploy, 100-user load test, or physical device test.

## Release checklist
1. Review database constraint compatibility, run Supabase migrations on staging then production with rollback plan.
2. Run node tests and existing Playwright handoff/community suites on CI. Verify region and demo separation.
3. Publish staging preview and test Korean/US game → reflection → actual room → edit → public post under dedicated test user; remove test post after QA.
4. Verify post-success event count, server persistence, and failed post preserving draft. Verify the dashboard shows unknown/no-data rather than fabricated orders.
5. Merge only after checks; deploy; independently verify production HTTP and runtime metrics.
6. Implement opt-in account linking and cross-device data restore behind authenticated RLS policies; avoid transferring anonymous secret tokens by URL.
7. Correlate game event and community using privacy-safe consented pseudonymous journey ID; connect affiliate order/cancellation callbacks before reporting revenue.
