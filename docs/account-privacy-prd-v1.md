# Seoul Beauty Account & Privacy PRD v1.0
Date: 2026-10-23
Status: in progress. Do not claim production account deletion is implemented.

## Principles
- Browsing, public conversations and play do not force account creation.
- OAuth sign-in is separate from optional beauty profile.
- Users can inspect and edit their profile and own stored preferences.
- Privacy actions must state exactly whether they affect local device data, account-cloud data or public posts.
- Never signal success for a deletion until server-side identity verification and deletion complete.

## Functional requirements
| ID | Requirement | Priority | Status |
|---|---|---|---|
| AUTH-01 | Google/Kakao/Naver PKCE OAuth | P0 | Existing web flow; provider availability varies |
| AUTH-02 | Session refresh, sign-out, failure recovery | P0 | Existing flow |
| DATA-01 | Account-owned preferences with RLS | P0 | Existing migration; production verification required |
| DATA-02 | Export current device's locally stored account preferences | P0 | Added on branch |
| DATA-03 | Request deletion, disclose manual verification | P0 | Added on branch; NOT account deletion |
| DELETE-01 | In-app reauthentication and server-side account removal | P0 | Not implemented |
| DELETE-02 | Verify/authenticate ownership of community posts before erasure | P0 | Not implemented |
| DELETE-03 | Revoke sessions, remove auth and dependent personal data | P0 | Not implemented |
| ACCT-01 | My profile, saved picks, posts, votes and conversations | P1 | Partial; activities not linked to account |
| DATA-04 | Complete server-side portable export | P1 | Not implemented |

## Acceptance tests
1. OAuth failure/cancel does not corrupt guest choices.
2. Account A's session and preference store cannot access account B.
3. Export excludes access/refresh tokens and anonymous chat secrets.
4. Account deletion request cannot be mistaken for a completed deletion.
5. When server deletion is implemented: require fresh proof of ownership, delete all account-owned private records, determine handling of public posts, revoke sessions and verify subsequent access is denied.
6. Privacy policy accurately reflects actual retention and erasure capabilities.
7. Verify Korean and English labels and web/iOS parity.

## Blockers
The connected Supabase organization cannot access the existing Seoul Beauty app project (mqsnshnlfwsgabrsmqsz). Do not write SQL to an unrelated project. Production RLS and deletion cannot be validated until the appropriate connection is authorized.
