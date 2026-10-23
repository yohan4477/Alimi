# Beauty Beauty under Seoul Beauty

`/beauty-play/` renders the native React game bundle from `dist/beauty-play/`. It is not an iframe or a redirect to the Sites frontend. The original community routes are retained. The game handoff opens the actual `/kr` or `/us` community entry.

The current UI was imported from the reviewed Beauty Beauty prototype. Source lives in `web/beauty-play/`; run `npm install` and `npm run build:beauty-play` to rebuild committed static output. Genuine product/option images and public-domain portraits are bundled under the game path.

The existing game data remains in its original D1 store. A bounded `/beauty-play/api/:route` adapter in `api/beauty-play.js` calls the existing public game backend to preserve votes and invitation snapshots. Allowed routes are session, record, invite, stats, share-config and reflection. No administrative API is forwarded. This does not migrate game data into the community Supabase database or imply unified account attribution.

Only the game's device cookie is forwarded; community auth cookies, authorization and identity headers are never forwarded. The returned game cookie is restricted to `/beauty-play`, with HttpOnly, SameSite and Secure retained in production. POST origins are checked before forwarding. Unknown paths/methods, redirects and oversized bodies fail closed.

Validation: the full Node suite passes, including five game integration tests; actual session and test-answer writes through the adapter return200. Native browser rendering and route transitions were checked locally. The managed preview process could not consistently reach the upstream backend, so full browser save/share on the production hostname remains a release check. Vercel MCP project inspection currently reports a team-access403; the repository's existing main-branch deploy integration is the release path.

No public user messages or invitations are sent as part of this change. The old game URL remains online for existing links and rollback.
