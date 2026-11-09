# Supabase change set

The migrations in this directory are **not applied to the live project** and must not be run as part of the frontend deployment.

- `20261109000100_stage_score_recalculation_and_pilot_substitutions.sql` adds profile storage, stage substitutions, newcomer-award ledgering, audit tables, and atomic score RPCs. It needs a separate schema/security review and approval before application. Until then, the UI does not expose stage-substitution management or call the missing score RPCs; newcomer bonuses remain unavailable.
- `20261109140000_order_final_2026_rounds_and_deadlines.sql` contains a guarded deletion of an empty Qatar sprint placeholder and changes stage order/deadlines. It also requires a read-only review against live session/forecast data and separate approval before application.

Do not run app writes against a Vercel preview. Scoring compatibility code for the existing production schema persists forecast/qualifying score rows and corresponding player-total deltas directly, so keep the live-scoring behavior under administrator-only use and schedule the reviewed atomic RPC migration before expanding or automating score recalculation.

Safety notes for the pending schema migration:
- `apply_session_scores` replaces stored forecast/qualifying scores and changes season totals only by the difference, atomically; it refuses ambiguous legacy score baselines.
- `apply_stage_newcomer_bonuses` reconciles the award ledger and season totals atomically after every session for that stage is committed.
- Stage substitutions do not rewrite historical forecasts or slot assignments.
- Profile banners are public images in the `player-banners` bucket; authenticated writes are restricted to the owner's player-id folder.
