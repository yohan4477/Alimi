# Self-reported skin profile (US rules)

Goal: collect skin type, tone, interests and age range **only where it helps the person**, so the data is accurate and consented, and can later feed anonymous B2B trend stats.

## Where we ask

| Moment | What | What the person gets |
|---|---|---|
| My activity → "My skin profile" card | All fields, all optional | Reviews from people like them first |
| Writing a review | "Save these skin details to my profile" (unchecked by default) | Next review is prefilled |
| Product reviews → "People like me" | Applies their own skin type / tone | Similar-skin reviews; without a profile the chip invites them to add one |
| Settings → Data | My skin profile, Do Not Sell or Share | Edit / delete anytime, opt out |

Nothing is inferred from posts, chats or photos. Only typed-in values are stored.

## Rules built in

- **COPPA:** "Under 13" can be picked but disables Save; no band below 13 exists in the database.
- **CCPA/CPRA:** B2B sharing is opt-in, offered only to 16+; under-16 cannot opt in. "Do Not Sell or Share My Personal Information" in Settings records `opt_out_sale` and forces `consent_b2b` off. A browser Global Privacy Control signal is sent as `gpc` and treated as an opt-out on every save.
- **Washington MHMDA and similar:** skin concerns (acne, redness, …) are stored only with a separate health consent and are never part of B2B sharing.
- **No dark patterns:** every consent is an unchecked checkbox with its purpose next to it; delete is one tap.
- Server enforces the same rules as table checks (`20261019040000_profile_us.sql`), so a modified client cannot store an under-16 B2B consent, concerns without health consent, or B2B consent while opted out.

## Storage

`community_profiles` keyed by the anonymous `author_tag`; not readable by clients. `get_profile` / `set_profile` / `delete_profile` act only on the caller's own secret. The web keeps a local copy (`seoulbeauty-profile-v1`) for prefill.

## Not done yet

- **Privacy policy and notice at collection:** Settings → Privacy policy is still "coming soon". A published policy listing these fields, purposes, retention and the opt-out is required before collecting from US users at scale; have US privacy counsel review it before any B2B sale.
- iOS screens, a public skin badge on posts (opt-in), using `consent_analytics` to personalise ordering, retention period, B2B aggregation with minimum group size.
