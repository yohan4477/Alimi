# SeoulBeauty development rules

## Database direction: Supabase for new development

- SeoulBeauty's **new backend development targets the existing Supabase project** `mqsnshnlfwsgabrsmqsz` (SeoulBeauty / Alimi). Do not introduce another game database, new D1 tables/migrations, or new D1-dependent features.
- **D1 is still the legacy production game store today.** It has NOT been consolidated, retired, or deleted. Preserve its data and existing game/share behavior while migration validation is unfinished.
- Do not remove the D1 proxy, change the production writer, set release environment flags, or delete/purge D1 merely because replacement code or a PR exists. A verified migration and explicit release authorization are required. D1 deletion is currently on hold.
- Make migration/compatibility fixes only as needed to preserve existing users; build new domain/data access in the Supabase replacement. Do not extend the legacy backend as the long-term architecture.
- Read [the canonical backend policy](docs/BEAUTY_BACKEND_POLICY.md), [migration status/runbook](docs/beauty-game-database-migration.md), and [the existing game domain](docs/beauty-play-domain.md) before changing game persistence, account linkage, sharing, metrics, or deployment.

## Data and identity boundaries

- Preserve anonymous gameplay. Legacy device IDs, browser preferences, client-provided account IDs and unsigned cookies are not account-ownership proof.
- Account linkage requires explicit consent and server-verified account/session ownership. Keep later anonymous activity separate after account switches/logout; the replacement seals linked historical sessions and rotates an unlinked cookie.
- Never place service keys, credentials, raw database exports, private reflections or real-user answers in source control or logs. Public share snapshots and aggregate responses must exclude private notes and account/device identifiers.
- Never treat truncated export data or a matching row count alone as a verified migration. Preserve original IDs/snapshots, reconcile complete data, check aggregate/authorization behavior and define rollback for post-cutover writes.

## Working and reporting

- Run `npm test` and `npm run test:beauty-game-db` for backend changes; rebuild `npm run build:beauty-play` after game UI edits. Verify CI for the exact published head.
- Distinguish implemented, tested locally, CI-verified, applied to the live database, and deployed. A draft PR is not production completion.
- Coordinate account/history work with PR #180, first-visit game UX/events with PR #187, and backend replacement with PR #188. Recheck each PR's actual state; do not merge or copy unreviewed work blindly.
- These repository instructions coordinate work in this repository. They do not change platform permissions or forcibly control other conversations.
