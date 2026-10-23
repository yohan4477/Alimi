# SeoulBeauty backend policy

Updated 2026-10-23. This is the canonical direction for concurrent game, account, analytics and community work.

## Decision

**Use the existing SeoulBeauty Supabase project (`mqsnshnlfwsgabrsmqsz`) for all new backend development. Keep D1 intact as the currently active legacy game store until a verified transition is approved. D1 deletion is on hold.**

Do not add new D1-dependent features, tables or migrations. A necessary compatibility fix to keep existing users working is different from expanding the legacy architecture. Do not create a replacement Supabase project or duplicate account store.

## What is live versus prepared

| Area | Current state | Development direction |
|---|---|---|
| Game production reads/writes | Existing Sites D1 backend through the bounded SeoulBeauty proxy | Supabase replacement behind explicit release gates |
| New game server | Draft implementation in PR #188; check current exact head and CI | Private game schema and server-only RPC in existing Supabase |
| Historical game data | Still retained in D1; full lossless export/reconciliation incomplete | Preserve IDs, snapshots and test/live separation; do not guess missing values |
| Account history | Do not infer legacy device ownership | Explicit consent, verified account and game session, sealed historical session plus fresh anonymous identity |
| D1 removal | Not authorized now; no deletion performed | Preserve until validation and a separately approved retirement action |

The default runtime must remain D1 until validation and release approval. The presence of `BEAUTY_GAME_BACKEND=supabase` code is not permission to set it. Account linking has its own release flag and must not be enabled without its isolation checks.

## Required coordination

- [Backend replacement PR #188](https://github.com/yohan4477/Alimi/pull/188): owns the new game API/database contract and rollout gates.
- [Account/history PR #180](https://github.com/yohan4477/Alimi/pull/180): must not silently import unsigned legacy device data or equate browser-preference synchronization with game database migration. Reconcile migration filename collisions against the actual migration ledger.
- [First-visit UX PR #187](https://github.com/yohan4477/Alimi/pull/187): preserve API field contracts and distinguish event semantics/versions. Moving `game_start` from page load to first recommendation selection changes analytics meaning even when the event name stays the same.
- State can change: inspect current PR heads and merged state before resolving conflicts or continuing work. This page is coordination guidance, not a merge instruction.

## Before changing the production writer

1. Validate a full consistent export; inventory currently observes 719 rows, but the two share snapshots returned by the reader are truncated and must not be fabricated/imported as complete.
2. Reconcile copied rows, original IDs and checksums; test saved choices, experience, private reflections, aggregates, old invitation links and account boundaries.
3. Verify the actual deployment/environment and both the main-domain and legacy entry points. Keep one authoritative writer; do not use unsafe dual writes or automatic write fallback.
4. Rehearse rollback that preserves writes made after cutover, and obtain release authorization. Keep D1 until a later explicit decision; no deletion is part of this policy change.

Detailed evidence, commands and remaining gaps: [migration runbook](beauty-game-database-migration.md).
