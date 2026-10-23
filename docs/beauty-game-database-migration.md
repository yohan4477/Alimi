# Seoul Beauty game database consolidation: gated implementation plan

Status: independently implemented replacement backend, locally tested. The user authorized building from the visible frontend rather than waiting for original source. **No game rows have been imported, no target game schema has been applied, and no runtime cutover has occurred.** All production reads/writes still use D1 through the existing proxy. Original-backend parity is unverified; new semantics below are deliberate, not reconstructed facts.

## Verified inventory (2026-10-23 07:27–07:30 UTC)

- Source: Sites project `appgprj_6ada0c5b0b908191a4774749406c858c`, binding `DB`, public origin https://seoulbeauty-muse-play.yohan4477.chatgpt.site.
- Latest saved source version: 20, commit `5870c507dc1fbc69f809cf11e37b1c2c3b4fb3ca`. The source archive was not accessible through available materialization tools. Its version is not by itself proof of deployed source parity.
- Application main inspected: `44f64b75ebe7c38dab0fa128cde79bd14dc438b8`. There is no original backend in this repository: `api/beauty-play.js` only proxies six routes.
- Target: existing Supabase project `mqsnshnlfwsgabrsmqsz` (SeoulBeauty / Alimi). Read-only production catalog query found `public.account_preferences` and `public.beauty_account_drafts`, and no table matching `%game%` or `%journey%`. This is a bounded name search, not proof no other related tables exist.
- Source reader observed 719 rows: `game_events` 690; `game_answers` 12; `game_shares` 2; `game_reflections` 1; `friend_events` 5; `mini_events` 9. `beauty_conversions`, `beauty_journeys`, `beauty_shop_clicks`, `journey_actions`, `mini_entries`, `mini_invites` were empty.
- This was a paginated, read-only inventory, **not an atomic export**. Both nonempty share snapshots were truncated by the reader. Do not use its output as migration input, even if counts match.

## Required input and architecture

1. The replacement contract follows the checked-in frontend. Original server source is unavailable and no longer required to write replacement code. Preserve a clear distinction between frontend-compatible behavior and unknown original server semantics. Source DDL and a consistent full export remain necessary for a verified historical-data migration.
2. Obtain a complete source snapshot through a supported export. Preserve all 12 tables, even empty ones, all columns and primary keys, exact strings/JSON, identifiers, timestamps and test flags. Keep exports outside version control in a private location. A source ZIP does not itself contain live D1 data.
3. Implement a server-only Supabase repository and the same public contract behind `/beauty-play/api/:route`. Anonymous users continue using the HttpOnly, Secure, SameSite game session; they do not need community signup. Preserve origin validation, body limit, allowlist, no-store and redirect rejection.
4. Prefer a dedicated private game schema with narrowly scoped server access. If an API-exposed schema is required, enable RLS and explicitly revoke public/anonymous/authenticated raw-row privileges. Do not expose service keys in clients. Any new credential/persistent access configuration needs separate action-time approval. Do not extract credentials from browser sessions.
5. Account linkage is a separate explicit-consent operation with server-verified account and game-session ownership. Never infer account identity from legacy device IDs, client headers, email, local storage or first-login preference import. Imported rows remain anonymous unless ownership and consent are established. Do not use the unmerged account-preference PR as evidence of deployed identity linkage.
6. Preserve original share IDs and immutable snapshots; enforce reveal gating server-side. Private notes/reflections stay private and do not become public reviews or account history automatically. Existing source-domain links must keep working after cutover: coordinate both entry points against the same authoritative data, or maintain an explicit compatible legacy serving plan.

## Offline reconciliation tool

`node scripts/beauty-game-reconcile.mjs manifest PRIVATE_EXPORT [PRIVATE_MANIFEST]`

`node scripts/beauty-game-reconcile.mjs compare PRIVATE_SOURCE PRIVATE_TARGET`

The tool performs no network/database actions. It validates declared completeness flags, the exact table set, supplied columns, primary-key uniqueness, row counts and type-preserving SHA-256 hashes. It rejects declared truncation/unfinished pagination, missing tables, ambiguous numeric tokens, duplicate JSON keys and mismatched snapshot identities. It cannot detect undeclared truncation or a column omitted from both exports: independently verify columns and keys against source DDL and prove export completeness. All fractional, exponent-form or unsafe-integer database numbers must be exported as exact strings in both projections, not rounded through a JavaScript Number. Exit codes: 0 equal/success, 1 invalid input, 2 differences. A new manifest file is mode 0600 and never overwrites an existing path. Do not supply an existing raw export as the output path.

Input shape (illustrative, not real user data):

```json
{
  "format": "beauty-game-export-v1",
  "project_id": "appgprj_6ada0c5b0b908191a4774749406c858c",
  "binding_name": "DB",
  "snapshot": {
    "id": "operator-chosen-nonpersonal-snapshot-id",
    "captured_at": "2026-10-23T07:00:00Z",
    "schema_sha256": "64-lowercase-hex-characters-from-the-verified-source-DDL",
    "consistent": true
  },
  "tables": [
    {
      "name": "game_shares",
      "columns": ["all", "actual", "source", "columns"],
      "primary_key": ["actual-source-key-from-DDL"],
      "row_count": 0,
      "rows": [],
      "completeness": {
        "complete": true, "truncated": false, "omitted_rows": 0,
        "omitted_columns": 0, "truncated_values": 0, "has_more": false
      }
    }
  ]
}
```

All 12 tables must be supplied with verified source columns and primary keys; the illustrative table is intentionally not an executable fixture. The exporter must prove snapshot consistency and completeness; setting booleans does not establish either. Target export projects back to exactly the original source columns/types and uses the same snapshot identity. Schema hash refers to the verified source DDL, not newly generated target DDL. Additional target linkage columns require their own validation and must not enter the source parity projection. Use only nonpersonal snapshot IDs. Manifest output omits raw rows and individual row hashes, but retains supplied metadata; keep manifests private too.

## Staging, cutover and rollback gates

- Rehearse copy in a non-live staging namespace/database with original constraints and idempotent import keyed by verified source keys. Replay the same import and verify no extra rows or changed hashes. Keep a migration ledger mapping source snapshot/revision to target artifacts. Do not run target upserts until mutation semantics are verified.
- Compare all row counts and per-table hashes against the consistent snapshot. Validate answer edits, experience edits, duplicate/reordered/concurrent events, reflection replacement, old share links, invalid cookies, unauthorized reveal and cross-account/device access using fixtures and isolated test rows.
- Compare complete aggregate response payloads by character, category/group, taxonomy version and test/live mode: votes, experienced, reasons, shades, choices/usedN, historical missing advice/shade and unsure selections. Count equality alone is not parity; “responses” are not automatically “unique people.”
- Run applicable repository suite and original backend tests, plus an isolated end-to-end anonymous → answer → share → recipient answer → reveal → private reflection → optional account-consent flow. Existing proxy mock tests do not prove data/backend correctness.
- Require release approval for publication/cutover. Use one authoritative writer. Prefer a short controlled write pause covering BOTH the main-domain proxy and old Sites backend, final export/replay/reconcile, then switch both to Supabase. A pause only on the proxy is insufficient because the original URL remains live. Never silently fall back to D1 writes after a partial Supabase failure, or rely on uncoordinated dual writes.
- Retain D1 unchanged as historical fallback and retain full snapshots privately. Before approving rollback, define and rehearse how post-cutover Supabase writes are reconciled back or retained while writes are paused. Merely switching reads/writes back to an old D1 snapshot loses new data and is not a safe rollback.
- Do not delete or purge D1. No source data, raw answers, private notes, tokens or credentials belong in GitHub, CI logs or public artifacts.

## Current blockers

Original-source retrieval is closed; the user authorized an independent replacement. Full D1 snapshots are still missing, including the two untruncated invitation snapshots. Target connector organization scope is not authorized for this project; do not retry or bypass that denial. The existing authorized Supabase browser SQL interface was used only for catalog reads. Remote SQL application, private historical-data copy, production aggregate comparison and live release remain pending validated data/release approval. No user source-ZIP action is required for code completion.


## Implemented replacement and intentional behavior

- `server/beauty-game-api.mjs` implements the six existing routes plus a release-disabled account-link prototype. `server/beauty-game-domain.mjs` validates the frontend contract and builds aggregates/snapshots.
- `supabase/migrations/20261023075137_beauty_game_backend.sql` creates private `beauty_game` tables with RLS and a SECURITY INVOKER RPC callable only by `service_role`. No anonymous/authenticated raw-table grants. No new credentials are generated/configured.
- A random 256-bit `__Host-beauty_game` HttpOnly/Secure/SameSite=Lax cookie with host-only `Path=/` replaces unsigned device-ID ownership for new records. Only its SHA-256 is persisted. The old `muse_device` is not proof of ownership: historical rows must not be silently claimed. Cookie path is root to satisfy the protective `__Host-` prefix; frontend JS cannot read it, and the D1 proxy never forwards it.
- Answers and reflections replace the same `(session, play, character, test)` selection; events deduplicate immutable IDs and reject conflicting retries; shares freeze sanitized answer + catalog snapshots and reuse the same token on identical retries. Private notes do not appear in invitations or aggregates. A changed product clears old product experience. These are tested replacement semantics, not claims about unknown old-server behavior.
- All commands serialize on their session row. Persistent rate budgets are 240 commands/session/minute and 300 new sessions/minute globally, without logging IPs or PII. Full aggregate cohorts are assembled inside PostgreSQL to avoid a 1000-row Data API cap. Stats require a valid anonymous session.
- Account linkage is disabled by default. Do NOT enable `BEAUTY_GAME_ACCOUNT_LINK_ENABLED` in production until logout/account-switch session rotation and its UI consent flow are integrated and tested. Server-side proof/consent tests exercise the unreleased prototype only. Anonymous gameplay does not require an account.
- Existing main-domain proxy stays the default. Only an approved `BEAUTY_GAME_BACKEND=supabase` release chooses the replacement. Unknown backend values fail closed, and errors never fall back to a second writer. Requires existing server-only `SUPABASE_SECRET_KEY` access; missing configuration returns 503, never exposes a key.
- JSON catalog files are explicitly included in the Vercel function package. `KAKAO_JAVASCRIPT_KEY` is optional public SDK configuration, not an authentication secret; absent configuration disables Kakao-specific sharing but not copy/native links.

## Local verification

Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:beauty-game-db`. PGlite 0.3.14 is pinned with a lockfile for isolated PostgreSQL execution; no remote connection occurs. The dedicated CI job runs game unit tests, SQL ACL/ownership/idempotency/rate-limit assertions, and HTTP-contract → domain → PostgreSQL integration. Integration covers anonymous session, answer retry, experience, aggregates, immutable invitation, fresh recipient gated reveal, private reflection, and the disabled account-proof prototype. SQL tests include 1,005 answers to verify no 1000-row truncation.

Not verified: live Supabase/PostgREST/Vercel integration, browser end-to-end on deployed replacement, old-server behavioral parity, multi-connection concurrency stress, historical import and old-link parity. Existing unrelated admin tests currently expect 7 headings while the current main template has 13; report those failures separately rather than modifying them as part of this task.
