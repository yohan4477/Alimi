# Game, results and ownership poll integration — 2026-10-24

Integrated latest main 4447331 with existing PRs #226, #227 and #189. Supersedes their combined implementation; do not separately merge #224 and #226. Original portrait, recommendation direction, image carousel, brand filter, options, multiple reasons, poster and friend sharing remain.

## Changes
- Resolve additive CSS conflict between three result actions and catalog search.
- Existing result poster retains three actions. Ownership opens only when the server session explicitly reports OWNED_POLL_ENABLED; otherwise it announces coming soon. Product, option, language and test mode are carried in the URL. Existing invite-created next-character gate remains.
- Ownership poll adds brand filtering/group ordering, first answer persistence with optional follow-up/skip, private optional note, request generation protection on product changes and write-in-flight controls.
- Server fixes note validation, pins the approved Supabase project, accepts modern server secret keys without invalid Bearer auth, separates test and live votes, and pages aggregate reads rather than assuming a single PostgREST response is complete. No fake counts or reviews.
- Unapplied Draft ownership schema includes test and option fields; uniqueness is product/voter/test. No remote migration run. No D1 changes.

## Evidence
- Original PR #189/#226/#227 Web checks and launch workflows: success for their original exact heads. This does not establish integrated-head CI.
- Local npm test: 394 passed, zero failed.
- npm run build:beauty-play: passed; existing bundle-size advisory remains.
- Existing game PGlite regression and HTTP/domain/PostgreSQL contract integration: passed.
- New ownership PGlite integration: answer replacement, test/live isolation, RLS, anon denial passed.
- Live public game session GET: 200, reports all eight character IDs and accountLinkEnabled:false. This proves session reachability only.
- Live Supabase schema inspection: permission denied by connected beauty account. No attempt to bypass or mutate remote DB.
- Managed preview opened through cloud browser. Start button failed session connection; game browser play-through and mobile viewports cannot be marked passed. No live writes from this attempt.

## Incomplete release gates
- Integrated-head CI must finish; branch deployment is disabled in vercel.json.
- Supabase migration ledger/schema verification and production ownership migration/configuration remain blocked by project access. Production writer/historical D1 migration parity is not established by a working session endpoint. Current main is already Supabase-only despite stale policy text; this branch does not change that routing.
- Full eight-character browser play, 375/390/430 viewport QA, real friend two-session hidden/reveal behavior, image fallback and native sharing remain unverified.
- Ownership English localization, dynamic whole-service catalog, shared game identity/account restoration, abuse controls and admin poll funnel/feature management remain incomplete. Ownership remains disabled; do not release it as complete.
- Existing admin pages are not changed; no new numerical KPI claims.

## Five-person observation
Observe unaided start/completion, first result action, attempted actual sharing, friend completion, ownership participation, voluntary second-product exploration and where interest drops. Treat this as qualitative exploration. Do not send invitations or contact anyone automatically.

## Follow-up release evidence
- User confirmed D1 is no longer used; canonical policy and AGENTS.md now match Supabase-only main. No D1 operation performed.
- Remote integrated code commit `6e2efea2c3f1348e123347fc3101ea4049d74050`: Web checks run 40050694519 and launch workflow 40050694466 both completed successfully. CI browser fixtures are not real-device or live-backend evidence.
- Connected Supabase account project lists omit SeoulBeauty; remote DB schema checks remain unavailable. Vercel alimi project access succeeds.
- Release scope: existing game result/discovery improvements with ownership/account flags unchanged. Ownership remains unreleased.
