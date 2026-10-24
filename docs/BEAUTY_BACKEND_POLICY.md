# SeoulBeauty backend policy

Updated 2026-10-24 following explicit user confirmation: **D1 is no longer used. Supabase is the only runtime backend.**

## Current target

- Organization: Alimi; project: SeoulBeauty; project ID: `mqsnshnlfwsgabrsmqsz`.
- `api/beauty-play.js` selects the Supabase handler by default and rejects retired/invalid backend settings. Never add automatic D1 fallback or dual writes.
- New game, ownership-poll, identity and aggregate work uses this project. Do not create a duplicate backend or another project.
- The runtime already changed on main before this policy update. No production writer configuration or D1 data is changed by this documentation correction.

## Data and release boundaries

- Preserve existing records and immutable invitation snapshots. Runtime routing and the user's retirement decision do not establish historical row reconciliation or authorize deletion of retained data.
- Keep anonymous sessions and server-verified explicit-consent account linkage. Public snapshots/aggregates must exclude private notes, identifiers and account data.
- Ownership poll and account-link releases have separate flags. Keep disabled until actual schema/configuration and end-to-end checks pass.
- PR #188 was merged. PR #228 integrates existing #226/#227/#189 implementation; do not duplicate it or merge #224 in addition to #226.

## Verified access, 2026-10-24

- Public game session responds successfully with all eight supported character IDs. This alone does not verify answers, sharing or historical data.
- The connected Supabase `beauty` and `Primary` account project lists do not include SeoulBeauty. A schema-only query to the target was denied. No remote schema or data mutation was performed. Reconnect/authorize the Alimi organization and intended project before DB inspection/application.
- Vercel project `alimi` resolves to `prj_bhzYxS4laRZwtswrLsBz7rqPTArH` and includes `seoulbeauty.me`.

The older migration inventory/runbook is retained for historical evidence only. Its statements that D1 is still the production writer have been superseded.
