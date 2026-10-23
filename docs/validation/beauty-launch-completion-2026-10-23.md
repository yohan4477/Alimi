# Seoul Beauty launch completion candidate

This branch combines reviewed PR #171 with current main (#174). It does not deploy or merge either PR.

## Implemented
- Explicit opt-in private account draft snapshots, owner-only read/write/delete RLS, authenticated requests, 30-day visibility, regional retrieval, optimistic revision checks and another-device recovery.
- Private text stays out of URLs, analytics and localStorage. Restored drafts use the existing 24-hour sessionStorage handoff. Sign-out/account change clears account-owned tab drafts and dialog contents.
- Saving an account snapshot never posts publicly. Edits require explicit Save again. Publishing clears the tab draft, not the separate account snapshot; delete that snapshot in the recovery dialog. UI states this distinction.
- Tests cover cloud authorization boundaries, save failure, conflicts, account switching, explicit publication, failed publication retention, isolated device recovery and fixture post persistence.
- Normalized signed affiliate import infrastructure, NOT an approved native network integration. See affiliate documentation for configuration and limitations. Admin revenue remains unconnected, not a fabricated zero.
- Existing recommendation `.test.mjs` tests now run under npm test (previous script omitted them).

## Verification
- Node tests and Vite production build executed locally. Exact final counts belong to PR/CI results.
- Browser execution locally blocked by sandbox; two fixture-only E2E suites run on GitHub Actions. No real posts, orders or production credentials were used.
- Database security assertions included under supabase/tests. Temporary PostgreSQL-compatible checks are not a substitute for staging Supabase tests and advisors.

## Required release order and access
1. Identify/authorize the production Supabase project `mqsnshnlfwsgabrsmqsz` and a staging project. Current connected account did not provide that project. Do not substitute another project.
2. Run existing migrations plus #171 event migration, then private draft and affiliate ledger migrations on staging; run owner/other-user/anon SQL assertions, Supabase advisors, and integration tests with dedicated accounts.
3. Set up an approved daily deletion of expired account drafts: `delete from public.beauty_account_drafts where expires_at <= now();`. Expired rows are denied by RLS immediately, but physical retention is not bounded until this cleanup is configured. No scheduler or persistent credential is provisioned by this code change.
4. Verify production backup/rollback and migration before deploying frontend. Review new privacy retention/disclosure with the operator. Revoke draft table privileges to disable recovery without making text public if rollback needed.
5. Keep affiliate import disabled until the operator has approved the network contract/report access, source-ref mapping, server-only credentials and signature secret. Independently reconcile sandbox approved/declined/reversed transactions. This implementation alone does not establish game-to-order or individual-user attribution.
6. Merge/release only after green CI and authorized migration. Vercel configuration currently auto-deploys main only, so this feature PR is not a production deployment.
7. Run authorized staging public-post QA (dedicated account and removable test content), then production smoke checks after deployment. Do not treat fixture browser tests as production verification.

## Outstanding
Production DB/migration access, approved network adapter/contract and credentials, configured expiry cleanup, production deployment, and real public-post/order reconciliation are not completed by this PR.
