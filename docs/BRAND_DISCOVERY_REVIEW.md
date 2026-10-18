# Shared brand discovery review — 2026-10-19 KST

## Baseline and decision

Reviewed main `bbd6f76567d522ed68a956c3d57b942d962c5b85`, PR #69 and PR #71.
#71 was already merged (`0a59cbf`); subsequent #74/#75/#77/#78/#80 changes already
established a shared two-row horizontally scrolling badge strip and dedicated brand page.
Preserve those newer changes. Do not merge #69's parallel BrandExplorer/BrandLogo:
it derives brands and filters from loaded families only, can stop pagination when the
last loaded family is filtered away, and duplicates the iOS view and logo registry.

Both platforms use `catalog_brands` (top 15 by family count), `brand_logos`, and an exact
canonical `brand=eq.<brand>` server filter, not the localized display label. Category
browsing stays separate; tapping a brand opens its full catalog, then options and the
retailer purchase path. Back returns home. Names remain visible with or without a logo.

## Fixes in this follow-up

- Preserve initials beneath loading/failed logos on web and iPhone.
- Brand strip loads independently of tracked products; explicit failure/retry on both clients.
- Brand page request failure is distinct from successful empty results, with retry and
  already loaded products retained. Later pages resume at the current offset.
- Discard obsolete web brand responses and start the newly selected brand after the
  previous in-flight request settles; no permanent loading sentinel on a rapid switch.
- Share the retry translation between web/iOS; no duplicate brand component is added.

## Database verification

Existing migrations: `20261018100000_catalog_brands.sql`,
`20261018100100_more_brand_logos.sql`, and later logo additions already in main.
No new schema change is needed for this fix. Existing table has RLS, SELECT-only client
grants, and a security_invoker view. Do not replay CREATE TABLE migrations blindly.

Read-only public API checks executed on 2026-10-18 UTC:

- `catalog_brands`: 15 rows returned successfully; 13 with PNG logo URLs, two with null.
- All 13 non-null logo URLs returned HTTP 200, `image/png`.
- medicube, COSRX, VT, SOME BY MI: first page returned 24 families each; every row matched
  the canonical requested brand.
- This proves the deployed read contract, not migration history. Supabase management
  `list_migrations` and `execute_sql` returned permission denied. Applied version history
  could not be verified; no database writes were attempted.

## Asset terms

See `dist/brand-logos/CREDITS.md`. Existing official-site source claims are preserved and
now explicitly separated from permission. No claim of blanket commercial reuse approval.
Exact asset provenance/owner permission and THE SAEM attribution remain unresolved.

## Validation

- Local `npm test`: 63/63 passed after syncing translations.
- Local JavaScript syntax and whitespace checks passed.
- Deterministic mobile browser regression added to the existing web CI before the live
  API smoke test: strip failure/retry, broken logo, delayed brand switch, query failure/
  retry, pagination, empty state, no page overflow at 390px.
- Local Chromium download failed (truncated archive); browser tests were not executed locally.
- Linux host has no Xcode; iOS build/simulator tests were not executed locally.
- Existing GitHub Actions `ios.yml` builds/runs XCTest on a Mac and captures screenshots;
  web.yml runs browser tests on Chrome. Their results must be read for this PR's exact SHA
  before merge. A TestFlight upload is a separate main-only workflow and must not be
  equated with an iOS source change or a successful Vercel deployment.
