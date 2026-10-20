# Room experiences — 2026-10-20

Implemented in the existing web chat; no AI calls or new runtime dependencies.

- Collapsed “이 방의 사용 경험” panel, explicit per-product usage/period/repurchase/opinion/reason choices.
- Optional public skin type and concerns, never copied out of private profiles.
- Counts cover cumulative respondents in this room, not everyone currently online; unique device author per product. Same author across products counted once for respondent demographics (latest disclosed response).
- Recommendation, mixed feedback and disappointment are separate; mentions/hearts never become votes.
- Save replaces the prior response; edit, deletion, skip persistence, retry and failed-storage messaging.
- Contextual usage badges only on a known subject product or explicit product attachment.
- Offline response data is device-local under its own key. Synthetic fixture responses never go to the real DB.
- Demo identity and online identity remain the application's existing per-device anonymous identity, not verified unique humans across devices.

## Synthetic scenarios

Append these queries to the site URL:

1. `?lang=ko&demo=1&room=demo-experience-first` — first arrival, no responses, skip or submit.
2. `?lang=ko&demo=1&room=demo-experience-mixed` — 8 respondents, 6 used / 2 considering; 4 recommend / 1 mixed / 1 disappointed. Repurchase 2.
3. `?lang=ko&demo=1&room=demo-experience-compare` — same people discussing two products; count people once, opinions separately per product.

Try save → edit to considering → reload → delete. The chat composer remains usable. Source links point to matching fixture messages. A blank input does not imply an unknown skin type or recommendation.

## Verification

- `npm test`: 159 passed, including new aggregation, isolation, persistence and API cases.
- Happy DOM scenario: open, save, edit, reload, delete, no repeated prompt, no fetch from offline experience controller — passed.
- PGlite PostgreSQL: actual migration creation, anonymous RPC upsert/deletion, enum constraints, invalid product, cross-author evidence, direct table writes denied, inactive room — passed against a minimal existing-chat schema.
- Browser flow committed at `e2e/room-experiences.e2e.mjs` and added to Web checks; browser results must be read from CI, not inferred from DOM tests.

## Deployment requirement

Apply `supabase/migrations/20261020122341_room_experiences.sql` to the existing production project, then verify real RPC writes and reads. No synthetic seeding is part of that migration.

Production SQL access was denied by the currently connected Supabase account. The migration has NOT been applied. Online UI therefore handles missing table/network errors explicitly without pretending data was saved. Offline demo is fully local and does not depend on this migration.
