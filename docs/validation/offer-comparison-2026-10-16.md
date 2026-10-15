# Offer comparison gate — 2026-10-16 KST

## Purpose and scope

Preparation while retailer approval is pending. Related: ALM-002 #8 and ALM-F3 #5.
This offline module evaluates normalized offers supplied by a future adapter. It does not retrieve feeds, infer product identity from names, approve retailer data usage, send alerts, or change the current UI.

## Run

```sh
node --test tests/compare-offers.test.js
node scripts/compare-offers.mjs reviewed-input.json
```

The CLI expects an object with `request` and `offers`. The complete synthetic contract is demonstrated in `tests/compare-offers.test.js`. Never treat those fixtures as observed retailer prices.

Request: product, market (US), currency (USD), postalCode (5 digits), now (canonical UTC ISO timestamp with milliseconds), and explicitly chosen maxAgeHours. Product: productKey, formulation, variant, size (positive number), unit (ml or g), quantity (positive integer). Use an explicit reviewed token such as unflavoured for a known lack of variant; missing values are not matches.

Offer: the same product/context fields, retailer, offerId, HTTPS sourceUrl, identityReview {status: verified, evidence}, shipsToDestination, availability, purchaseType, discountType, costScope, price, shipping, tax, duties, costsVerified, observedAt, sourceUpdatedAt.

## Rules

- All six product dimensions must match exactly, with documented identity review. These identifiers are internal reviewed mappings, not a claim of confirmed GTINs.
- No fuzzy name matching, inferred oz/ml conversion, bundle splitting or formulation equivalence. Future adapters must normalize only from verified information.
- Same US destination ZIP and USD; confirmed delivery and in-stock status.
- Only one-time purchases without conditional discounts, and costs for the requested item alone. No subscription, member/new-customer coupon, or basket-threshold assumptions.
- Shipping, tax and duties must each be verified, finite, nonnegative cent amounts. Unknown never becomes zero. Zero is permitted only when supported by evidence in the upstream review.
- Both collection and source-update times must fall within the explicitly supplied freshness policy. Future or inconsistent timestamps are excluded. A repeated download cannot refresh an old source-update timestamp. The 24-hour fixture policy is a test choice, not a retailer SLA.
- Duplicate retailer/offerId pairs reject the batch. The adapter must map retailer identifiers consistently.
- Complete totals use integer-cent arithmetic. A lowest-price flag requires at least two distinct eligible retailers and means lowest only among eligible input offers. Ties remain visible.
- ZIP-level context is an initial PoC constraint, not a sales-tax calculator or final checkout guarantee. An eventual checkout quote should use the retailer's actual address and fulfillment context.
- Review flags are assertions by the trusted adapter/operator, not cryptographic verification. They must not come from untrusted client input.

## Result

Returns explicit excluded reasons, eligible ranked offers, comparison scope, and comparable/insufficient_retailers status. The module never writes the observation ledger. Missing data does not prevent the future UI from showing a clearly labelled item-only price; it does prevent ranking that price as a verified total.

## Validation

Node v24.19.0, Linux. `node --test tests/compare-offers.test.js`: 12 passed, 0 failed.
Cases: complete-total ranking, unknown costs, identity/size/unit/quantity/formulation mismatch, absent identity evidence, market/destination/stock mismatch, conditional purchase terms, stale source data, invalid/future/inconsistent timestamps, single-retailer minimum, tied totals, invalid amounts, duplicates, deterministic nonmutation.

These are synthetic unit tests only. No retailer feed, checkout, browser UI, iOS integration or real notification was tested. Existing UI and manual observation remain untouched.

## Next step and rollback

Once an approved real feed sample exists, map source fields and document missing fields. Unknown fields must stay unknown; do not populate verified flags by default. Feed access alone does not establish history/notification rights.
Then integrate the results into the existing seller list and verify real offers. This PR is isolated: reverting it removes preparation logic and documents only.
