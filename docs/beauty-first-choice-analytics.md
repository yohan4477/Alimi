# First-choice analytics release

PR #187 changes game_start from a page/scenario impression to the first explicit advice or product selection per play. Repeated choices within the same play do not duplicate it. Changing the scenario starts a new play, whose first active choice is counted separately. Legacy shared invitations with product-first selection are included.

The event retains the existing selection step supported by both the current D1 runtime and the gated Supabase replacement. Compare before/after deployment periods separately; historical game_start totals have different semantics. Page arrivals remain landing_view. This release does not migrate or delete game data or change backend flags.
