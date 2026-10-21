# Seoul Beauty — guest to Google account journey (2026-10-21)

## Product decision

No mandatory signup after answering a survey. A visitor may explore products and public opinions without an account. A Google account is offered only as an optional cross-device backup, or when a feature genuinely needs an account. Never claim that Google is required to browse or answer.

## Current implementation in PR #146

1. Brand recognition/experience choices (5 maximum on first visit) are saved to localStorage `seoulbeauty-opinions-v1`.
2. A completion screen lets visitors explore freely or choose **Save across devices with Google**.
3. Google login uses existing Supabase OAuth PKCE in `dist/auth.js`.
4. `AccountSync` includes opinions in account preferences. Guest opinions are merged with previously synced answers by `updatedAt`, rather than replacing all existing answers.
5. Existing catalog, chat and community features remain available. Product-specific photo prompts and global response aggregation are not yet implemented.

## Required before merge

- Verify Google OAuth callback, new signup, existing account login, cancellation and return-to-activity.
- Verify guest answers survive redirect and are persisted in Supabase with correct RLS; restore on another device.
- Verify sign-out isolates account data; guest browsing works without login.
- Verify no duplicated/false counts: local opinions must never be presented as community-wide results.
- Validate keyboard/screen reader focus and mobile rendering; run unit/browser CI.
- Do not display unlicensed retailer product images; check Stylevana advertiser-specific terms before onboarding reuse.
- Consider an explicit 'my opinions' entry point and a nonintrusive contextual account prompt after a user requests sync/notifications.

## Suggested funnel metrics

Landing → first answer → five answers/completion → browse → account offer seen → OAuth completed → synced answer verified → 7-day return. Separate voluntary account offers from mandatory actions. No demographic inference.
