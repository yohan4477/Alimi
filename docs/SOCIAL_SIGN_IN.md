# Seoul Beauty social sign-in

Web Settings → Account offers Kakao, Naver and Google. Uses the existing Supabase Auth session and PKCE; provider credentials never ship to browsers. The web client preserves room/language query parameters, stores a separate return nonce in `sb_auth_state`, and cleans one-time codes on success/failure. Supabase owns upstream OAuth state.

## Deployment status (2026-10-20)

The public auth settings endpoint returned `external.google: false` and `external.kakao: false`. The connected Supabase management account does not list the Seoul Beauty project `mqsnshnlfwsgabrsmqsz`. Consequently provider credentials, redirect configuration, and Naver's adapter have NOT been deployed/configured. Mocked tests pass; real consent, token exchange, and account creation still require end-to-end verification. Buttons show a service-not-connected error when disabled.

## Google and Kakao

Register applications in Google Auth Platform and Kakao Developers. Enable each in the Seoul Beauty Supabase project under Authentication → Sign In / Providers, storing client IDs/secrets there. Use callback:

`https://mqsnshnlfwsgabrsmqsz.supabase.co/auth/v1/callback`

Google uses openid/email/profile scopes. For Kakao configure nickname consent; allow users without email if account_email is not available. Display name falls back to a generic member label when email is absent.

Supabase URL Configuration must allow both production origins (with their query parameters):
- `https://alimi-omega.vercel.app/`
- `https://seoul-beauty-community.yohan4477.chatgpt.site/`

Use narrowly scoped redirect rules for these hosts; do not allow all domains. Confirm the returned URL retains `sb_auth_state`, `lang`, and any room query before testing completion.

## Naver

Naver is not a built-in Supabase provider. The frontend requests `custom:naver`. Create a custom OAuth2 provider with this exact identifier after registering a Naver Login application. Use the callback URL shown in the custom-provider creation form in the Naver app settings (do not assume it equals the built-in callback).

- Authorization URL: `https://nid.naver.com/oauth2.0/authorize`
- Token URL: `https://nid.naver.com/oauth2.0/token`
- UserInfo URL: `https://mqsnshnlfwsgabrsmqsz.supabase.co/functions/v1/naver-userinfo`
- Client ID / secret: Naver application's credentials, in Supabase only.
- Email optional: true. Do not force an email_verified mapping.
- Scopes / upstream PKCE: confirm against Naver's app configuration and supported flow. Supabase-to-browser PKCE remains enabled independently.

Deploy `supabase/functions/naver-userinfo` with the provided `verify_jwt = false` config. This function validates the Naver bearer token by fetching Naver's fixed profile endpoint and normalizes response.id to sub. It has no database access and does not log tokens. A normalizer is necessary: Naver nests identity inside `response`, whereas the inspected Supabase custom-provider attribute mapper only supports flat keys. No email is supplied, avoiding automatic linking using an unverified email. Naver app review / test-member restrictions must be resolved before public launch.

Before enabling Naver publicly, test its real token exchange (including provider state requirements), nickname consent refusal, existing/new user, cancellation, expired code, and sign-out. The adapter is implemented but not deployed or verified against real credentials.

## Boundary

This is optional account authentication. Existing anonymous chat identity, saved items and local settings are not migrated or synchronized. No chat permissions or RLS policies change. Do not claim cross-device history or automatic account merging.

References:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/social-login/auth-kakao
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://developers.naver.com/docs/login/api/api.md
