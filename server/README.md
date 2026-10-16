# Price-drop alert connection (not deployed)

Scope: ALM-003 (#9) device/watch persistence and ALM-004 (#10) actual price-drop push path; official COSRX 100ml single item, Stylevana US, USD only. PR #39 permission onboarding is already on main. This change connects the next components; it does not prove production delivery.

## Behavior

- First interest registration records the server quote as baseline. A price at least 5% below that baseline qualifies. After APNs accepts an alert, another alert requires at least 5% below the last accepted price. Removing and re-adding the watch does not reset its baseline.
- No target-price, recommendation or all-time-low alerts in this increment. Existing USD targets remain device-only and are labeled accordingly.
- Collection timestamp must be within two hours, feed stock must be in_stock, exact product/market identity is checked. A recent collection does not prove the supplier updated its underlying price: per-item provider last_updated is empty. Shipping/tax and checkout availability are not verified.
- Quiet hours are 22:00–08:00 in the device timezone. No stale queued price is delivered after quiet hours: the dispatcher re-evaluates the quote and watch.
- Claims are persisted before sending, serialized by a PostgreSQL advisory lock, and rechecked against current watch/device state. Permission changes propagate on the next app foreground.
- HTTP 200 from APNs means accepted by Apple, not received/read on an iPhone. A lost response becomes unknown; do not blindly retry. Sending claims left behind by a crashed worker also require operator reconciliation. This trades missed alerts for reduced duplicate risk.
- Device tokens and anonymous auth refresh tokens are private. Refresh tokens are stored in iOS Keychain; service-role and APNs private keys are server-only. Logs contain counts, never tokens.

## Activation prerequisites (pending)

1. User selected a different Supabase organization; its name/access is still missing. Do not reuse stockholderscommunity or its existing project. Confirm the selected organization and any nonzero project cost before creation.
2. Create an Alimi-only project; enable anonymous sign-ins with appropriate auth abuse protection. Native REST auth uses signup and refresh-token endpoints. Review anonymous-user retention/deletion before public release.
3. Use the Supabase skill's execute/advisors/migration generation workflow. `price-alerts.sql` is a reviewed schema proposal, not a fabricated migration or a record of a deployed schema. Never apply `test-bootstrap.sql` on Supabase; that file creates CI-only roles/auth stubs.
4. Seed the current real quote using `node scripts/dispatch-price-alerts.mjs --ingest` with fresh official feed data. Do not seed fake test prices into the live project. Verify owners cannot read/write another device, forge a baseline, or invoke worker RPCs; run advisors.
5. Set GitHub repository variable ALIMI_SUPABASE_URL and encrypted secret ALIMI_SUPABASE_SERVICE_KEY. Set ALIMI_BACKEND_ENABLED=true only after the schema/seed/read-back checks pass. Existing collector then publishes each freshly validated quote. The daily 07:30 KST feed collection cadence is unchanged.
6. Apple Developer account must have the App ID/push capability, matching provisioning profile and APNs private key. Set encrypted secrets ALIMI_APNS_KEY_ID, ALIMI_APNS_TEAM_ID, ALIMI_APNS_PRIVATE_KEY and variable ALIMI_APNS_TOPIC. Never place the p8 key or service key in app resources or chat.
7. Set native build settings ALIMI_SUPABASE_URL and ALIMI_SUPABASE_PUBLISHABLE_KEY (public sb_publishable_ key only), configure DEVELOPMENT_TEAM and signing. Debug uses sandbox/development entitlement; Release uses production. Ensure the signed profile matches. Defaults are blank, so an unconfigured app does not create accounts or claim to receive alerts.
8. Install signed app on a physical iPhone; permit notifications; register COSRX interest; confirm only its owner sees device/watch rows. Validate auth refresh, token rotation, opt-out and latest server quote display.
9. Set ALIMI_PRICE_ALERTS_ENABLED=true only after server/APNs configuration is complete. Dispatcher runs hourly at :45 and skips collections older than two hours. With the current daily collection, many hours intentionally have no eligible fresh quote; this is not continuous real-time monitoring. At 08:45 KST a 07:30 collection can qualify after quiet hours.
10. Perform an isolated sandbox price-drop fixture and receive a real push on a physical iPhone. Record APNs acceptance and actual receipt separately. Only then mark the feature verified. Do not manufacture production price drops just to trigger a notification.

## Validation

- `npm test`: price identity/freshness, threshold boundaries, quiet hours, repeat suppression, opt-out, invalid-token handling, lost-response state, ES256 signature and dispatch orchestration with synthetic DB/APNs.
- `.github/workflows/price-alert-validation.yml`: real PostgreSQL 17 with CI-only auth stubs, row/column privileges, baseline assignment, worker-only RPCs, atomic duplicate claims, stale ingest rejection, stock and accepted/unknown suppression.
- Existing iOS CI: compilation, XCTest and simulator launch. It cannot establish a signed physical-device APNs subscription or demonstrate delivery.

References checked 2026-10-17 KST:
- https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns
- https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
- https://supabase.com/docs/reference/swift/auth-signinanonymously
- https://supabase.com/docs/guides/database/postgres/column-level-security
- https://supabase.com/changelog (markdown endpoint unavailable; HTML reviewed, current TLS removal notice does not affect modern iOS 17+/Node 22 TLS defaults)
