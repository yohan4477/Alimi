# One active story

The landing starts a random supported character. A browser checkpoint retains the story and play ID across reloads and alternate character URLs. Normal navigation offers no scenario selector or alternate portrait list. Saving an answer relocks progression; successful invite-link creation unlocks a random different supported story. Failed link creation keeps it locked. This is a browser UX checkpoint, not an identity or anti-tampering guarantee. Creating a link cannot verify delivery in an external messenger.

Friend links retain their immutable scenario snapshot. Recipient checkpoints are isolated per invite and test/live scope. A resumed invite is opened with its retained play ID so answer/reveal authorization stays consistent.

## Male artwork readiness

Two previously saved user reinterpretations (Blue Boy in a satin dress, Fifer in a red skirt) are connected to the photo-booth transfer girl and last-minute class-president stories. They are not newly generated uniform images. Source data, product choices, bilingual text and local assets are included.

The session API advertises supportedCharacterIds for the Supabase implementation. Sessions without that capability retain the six legacy characters. The current production legacy backend rejects the two new IDs, so the two additional stories remain unavailable there. This change does not switch writers, migrate production data, or modify legacy D1 storage.

Validation: unit progression/capability tests; PostgreSQL and HTTP integration regressions; mobile first-choice matrix; fixture-only browser save/share failure/success/next checks for the six-character path and both new character IDs. Physical iOS/Safari and actual messenger delivery are separate checks.
