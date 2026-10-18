# Google sign-in setup

Google sign-in uses Supabase Auth OAuth with PKCE on web and iOS. The app never collects a Google password. Supabase stores the provider credentials; iOS stores the resulting refresh token in Keychain, and the web app persists the session in browser storage.

## Provider setup required

The current Supabase project reports `external.google: false` (checked 2026-10-19 KST). The buttons and OAuth clients are implemented, but login cannot complete until an OAuth client is configured.

1. In Google Cloud Console, configure the OAuth consent screen / Google Auth Platform branding, audience, and scopes (`openid`, `email`, `profile`).
2. Create a **Web application** OAuth client. Add the deployed Alimi origin to Authorized JavaScript origins.
3. Add this exact callback to Authorized redirect URIs: `https://mqsnshnlfwsgabrsmqsz.supabase.co/auth/v1/callback`.
4. In Supabase Dashboard → Authentication → Sign In / Providers → Google, enable Google and enter that OAuth client ID and client secret. Keep the client secret in Supabase only; never put it in this repository or either app.
5. In Supabase Dashboard → Authentication → URL Configuration → Redirect URLs, allow the deployed Alimi web origin (and any required preview origin) and `alimi://auth/callback`.
6. Verify the web redirect URL is set to the deployed site. Then test Google sign-in and sign-out on web and an iPhone build.

The iOS callback scheme `alimi` is registered in the XcodeGen project. The iOS OAuth verifier is held only for the active sign-in and session refresh tokens are stored in Keychain with device-only accessibility.

## Current feature boundary

This adds Google identity and a sign-in session. It does **not** move favorites, target prices, notification settings, or chat identity into an account. Favorites and target prices remain device-local. Cross-device sync needs a separate user-owned data model and Row Level Security policies before any data is written under `auth.uid()`.
