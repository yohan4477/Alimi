# SeoulBeauty development rules

## Database direction: Supabase only (confirmed 2026-10-24)

- The sole SeoulBeauty runtime database is the existing Supabase project `mqsnshnlfwsgabrsmqsz` (SeoulBeauty / Alimi).
- The user confirmed D1 is no longer used. Do not restore a D1 proxy, fallback, writer, or new D1 storage. `api/beauty-play.js` already selects Supabase only.
- Preserve existing Supabase data and invitation contracts. Never infer historical migration success or delete any retained data merely from runtime routing.
- New feature flags remain disabled until their schema, configuration and release checks pass. Do not enable ownership polls or account linkage merely because code is merged.
- Read [the canonical backend policy](docs/BEAUTY_BACKEND_POLICY.md) before persistence/account/sharing changes. Older D1 inventory/runbook sections are historical evidence, not current runtime instructions.

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
