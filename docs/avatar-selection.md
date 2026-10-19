# Avatar selection pilot

Five completed female character assets, with varied appearances, shown without a background ring (an earlier ring-colour option was removed). Images total 53 KB. Character IDs are opaque display choices, not demographic fields.

Entry: My activity / Settings → My character, or a one-time, non-blocking prompt above the composer after the first chat message (joining a topic never waits on the picker). Selection has a live preview. Save persists locally; cancel discards the draft; Choose later stores a neutral icon and prevents repeated onboarding. Korean and English strings are shared with the iOS bundle.

This is a **device-local UI pilot**. Only the owner sees their selection in My activity, settings, and their own live-chat messages. It does not claim to sync to other participants, other devices or native iOS screens. Existing server-generated anonymous nicknames remain. Backend access was unavailable during implementation, so shared profile persistence and nickname editing are not included. Do not call this a complete public avatar launch.

No avatar settings enter analytics events, review skin fields, personalization, or demographic inference. The UI explicitly explains the local scope.

Verification: 85 existing tests pass. Chromium at 390×844 checked selection, save, reload persistence, cancelled draft, skipping, no repeated onboarding, English, and horizontal overflow; no page errors. REST calls were stubbed for this UI check. Live chat / backend integration and actual iPhone remain unverified.
