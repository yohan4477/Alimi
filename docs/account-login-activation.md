# Seoul Beauty account login activation

Implemented web flow: Google, Kakao, Naver → Supabase PKCE callback → validated user → session restore/refresh → account preferences.

## Deployment status

Code and tests are ready. Production activation is NOT verified. The connected Supabase account only lists `cprwvbprpgldkqqfdhyx`; this app uses `mqsnshnlfwsgabrsmqsz`. A read-only SQL probe to the app project returned `You do not have permission to perform this action`. Do not deploy schema into the unrelated project.

## Required production setup

1. Open the existing app project: https://supabase.com/dashboard/project/mqsnshnlfwsgabrsmqsz/auth/providers
2. Configure Google with its registered client ID/secret. Enable Kakao using its REST API key and client secret. Kakao can omit email: enable email-optional sign-in, and allow the `profile_nickname` consent scope.
3. For each provider, copy the callback URL displayed in Supabase into its developer console. Do not use the web app URL as the provider's Supabase callback.
4. Allow the app return URLs for the deployed `/kr` and `/us` paths on `https://seoulbeauty.me` (and only the actual additional production hosts in use). The login flow appends `sb_login_state` plus existing query parameters. Verify return URL matching against these parameters. Site URL must also point to the production app. Avoid broad preview-host wildcards.
5. Apply `scripts/account-preferences.sql` to this app project in SQL Editor, then check the ownership policies. This file is an installation script, not a recorded CLI migration; CLI was unavailable in the implementation environment.
6. Complete the provider-specific review / consent requirements in the Kakao and Naver developer consoles.

## Naver custom OAuth provider

Create an OAuth2 custom provider in Supabase with:

| Setting | Value |
|---|---|
| Identifier | `custom:naver` |
| Client ID / Secret | Existing Naver application credentials, entered only in Supabase |
| Authorization URL | `https://nid.naver.com/oauth2.0/authorize` |
| Token URL | `https://nid.naver.com/oauth2.0/token` |
| UserInfo URL | `https://seoulbeauty.me/api/naver-userinfo` |
| Email optional | Enabled |
| Provider-side PKCE | Disabled if Naver does not support it; its documented API does not list PKCE parameters |
| Scopes | Naver app consent configuration; no Google/OpenID scopes |

Use the exact callback shown for this custom provider in the Naver application settings. The custom provider's upstream PKCE setting is separate from the web app → Supabase PKCE protection, which remains enabled.

The adapter requests Naver's profile API with the supplied bearer token, rejects invalid tokens, maps Naver's application-specific id to `sub`, and never marks its email verified. It does not merge accounts by user-supplied email. Validate an actual consent flow before calling Naver operational, especially token exchange behavior and custom-provider support on the deployed Auth version.

## Data behavior

- Account table: `account_preferences`, owned by `auth.uid()` with RLS.
- Synced: saved product ids/targets, product snapshots, interests, skin profile.
- Each field has independent last successful write semantics. Same-field concurrent edits use last write wins.
- First login can import guest preferences; existing cloud values take precedence unless pending local edits exist.
- Sign-out restores the guest workspace. Account switches never import another account's workspace.
- Failed writes remain pending on the device; the UI shows sync failure and offers retry.
- Profile writes while signed in use the account preference store, not the anonymous device's profile RPC. Anonymous chat identity, room membership, demo messages, provider tokens and secrets are not copied to the preferences table. Chat history/account linkage is a separate feature.
- Different social providers are not automatically promised to represent one account. Never link unverified emails.

## Verification

Automated tests cover authorization URLs for three providers, callback exchange, wrong/expired callback rejection, refresh, account isolation, sync failure retention, and Naver profile validation. These mock external responses; they do not prove production provider configuration or RLS execution.

After access is restored: verify sign-in/cancel/sign-out for all three providers, reload and token refresh, two-device save/profile updates, account A → logout → account B isolation, and denial of anonymous/other-user table access.

References:
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/auth/social-login/auth-kakao
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://developers.naver.com/docs/login/api/api.md
- https://developers.naver.com/docs/login/profile/profile.md
