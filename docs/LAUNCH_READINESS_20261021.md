# Seoul Beauty: approval-to-launch preparation

Status: **not released**. This branch prepares a reviewable US-web launch candidate; advertiser approval alone does not make the application ready. Do not merge/deploy automatically. Native iPhone release needs separate device/rights verification.

## Prepared in this branch

- Integrates PR #146's optional brand-first experience capture into current main, preserving #149 fetch and newer market/provider presentation fixes.
- Makes the survey reachable from My Activity → profile/interests → Brand experiences, without automatic first-visit interruption. Five cosmetic-brand prompts, explicit answers, own-answer summary, edit/skip/explore, optional Google sign-in. No fabricated public counts or product-image promises.
- Guest answers are persisted locally and durably queued before the account read. Newest explicit answers merge with cloud responses and changes made during the read; late failed requests cannot overwrite a newer account's status. Failure stays visible as sync failed, not saved-to-cloud success.
- Adds `20261021070000_account_opinions.sql` to extend the allowed preference keys while preserving existing RLS. **Not applied to production.** Existing installations need this upgrade, not merely `create table if not exists`.
- Description publication now requires a structured verified grant for retailer, market, use, platform and evidence URL. Arbitrary feed notes (including the previous “terms not yet reviewed” note) fail closed. Web permission is not copied into native-app content automatically.
- Corrects demonstrably stale privacy/terms references to removed alerts and the inaccurate implication that staying signed out avoids overseas processing. This is not legal approval or a substitute for owner review.
- Adds staged launch manifest and read-only readiness validator. `node scripts/launch-readiness.mjs` reports blockers. `--strict` exits nonzero until every release gate has evidence. It does not activate/deploy anything.

## Remaining hard launch gates

| Gate | Required proof | Current state |
|---|---|---|
| Advertiser | Approved, exact market/website/media scope, approval evidence | OY US submitted; Sephora email sent; Ulta status needs account check. Do not infer from network signup. |
| Product mapping | Retailer SKU + exact size/shade/set; EAN or manual identity evidence | #146 snapshots are staged candidates. No verified exact catalog mappings. |
| Source labels | Source, observation date, source market, cosmetics classification | Ulta US and OY Global are different markets. Never call Global ordering US ranking. Supplements/food/sets need explicit exclusion or handling. |
| Images/descriptions | Program-specific evidence permitting exact web/native/onboarding use | Pending. Image URL/feed access is not a license. Existing image consumers have not been globally removed by this preparation. |
| Links | Issued tracked URL, exact landing variant and disclosure verified | Pending advertiser-specific activation. Numeric Rakuten SID is NOT the encrypted publisher link ID. Ordinary fallback links do not earn verified commission. |
| Google + storage | Real new signup/existing login/cancel; guest answer upload, reload and independent-device restore | Unit/mocked-browser tests do not satisfy production proof. |
| Migration/RLS | Authorized migration apply; own-row write/read, other-user/anon denial | SQL prepared, not deployed or production-verified. |
| Legal/contact | Operator and contact verified; retention, deletion and processing locations confirmed | support@seoulbeauty.me unverified. Do not invent these facts or claim legal compliance. |
| Mobile/real data | 320/390px browser plus real iPhone; online no fake opinions/statistics; no demo DB writes | Browser CI prepared; device and production verification pending. |
| Rollback | Known deployed SHA, backup/migration rollback decision and smoke checks | No deployment performed. |

## Product manifest contract

Each `products` entry in `data/launch-readiness.json` needs internalProductId, brand, name, size, option (explicit null if none), retailerSku, category=cosmetics, retailer, market=US, currency=USD; match.status=exact/manual_verified with evidenceUrl; advertiser.status=approved with checkedAt/evidenceUrl; merchantProductUrl and distinct trackedAffiliateUrl; linkVerification.status=verified with checkedAt; priceMinor, availability, observedAt (within 24h); contentUses and a corresponding structured rights grant. Unknown values stay missing/pending rather than manufactured.

Rights record: status=verified, retailer, market, platforms (`web` and/or `native`), uses (`product_description`, `product_image`, `community_onboarding`), HTTPS evidenceUrl, checkedAt, optional expiresAt. Store it as JSON in description_permission. Record the actual permission, not merely an unrelated HTTPS link. No current grant is marked verified.

## Approval-day sequence

1. Read advertiser decision and verify program/market/media scope. Do not duplicate an existing application.
2. Populate exact products and licensed assets, activate only validated links; preserve ordinary-link disclosure for any fallback.
3. Apply reviewed migrations through the authorized production workflow, then run real OAuth and cross-device checks with test accounts.
4. Complete owner legal/contact decisions and test support receipt. Test a fresh visitor, interrupted login, repeated taps, cancelled flow, Back/Forward, no-results/offline state.
5. Run unit and browser CI on the exact final SHA and the strict manifest check. Review any remaining platform/device gates.
6. Obtain release authorization, merge/deploy the reviewed candidate, verify deployed SHA and core flow; retain rollback option. Do not claim click tracking proves a paid order or commission.
