# Beauty Beauty under Seoul Beauty

`/beauty-play/` renders the native React game bundle from `dist/beauty-play/`. It is not an iframe or a redirect to the Sites frontend. The original community routes are retained. The game handoff opens the actual `/kr` or `/us` community entry.

The current UI was imported from the reviewed Beauty Beauty prototype. Source lives in `web/beauty-play/`; run `npm install` and `npm run build:beauty-play` to rebuild committed static output. Genuine product/option images and public-domain portraits are bundled under the game path.

The existing game data remains in its original D1 store. A bounded `/beauty-play/api/:route` adapter in `api/beauty-play.js` calls the existing public game backend to preserve votes and invitation snapshots. Allowed routes are session, record, invite, stats, share-config and reflection. No administrative API is forwarded. This does not migrate game data into the community Supabase database or imply unified account attribution.

Only the game's device cookie is forwarded; community auth cookies, authorization and identity headers are never forwarded. The returned game cookie is restricted to `/beauty-play`, with HttpOnly, SameSite and Secure retained in production. POST origins are checked before forwarding. Unknown paths/methods, redirects and oversized bodies fail closed.

Validation (2026-10-23): PR #167 merged as 08df28a and the main-branch Vercel deployment succeeded. The full Node suite passed (186 tests), including five game integration tests. Production session and test-answer writes returned 200; invitation creation, a fresh recipient answer and gated comparison were checked through the production domain. A production browser play-through also saved an answer and produced a same-domain invitation. Physical iOS/Android, production 100-user concurrency, unified community attribution and actual order reconciliation remain unverified. Vercel MCP project inspection reported team-access403; the repository main-branch integration completed deployment.

No public user messages or invitations are sent as part of this change. The old game URL remains online for existing links and rollback.


Canonical planning: [end-to-end CX](BEAUTY_JOURNEY_CX.md) and [PRD](BEAUTY_JOURNEY_PRD.md), v1.0 dated 2026-10-23. The current handoff opens a regional home and supports manual text copying; contextual community handoff, account linkage and end-to-end purchase attribution are requirements, not completed integration.
