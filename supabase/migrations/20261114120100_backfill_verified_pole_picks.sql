-- These are the archived qualifying picks restored by
-- 20261109000400_restore_verified_archive_forecasts.sql. The saved pole-only
-- forecasts live in pilot_1 in those rows (with a null position by design).
-- Copy the verified submitted pick into its dedicated field so future scoring
-- cannot confuse it with a roulette assignment.
UPDATE public.qual_assignments AS qa
SET pole_pick = qa.pilot_1,
    scored_input = jsonb_set(
      COALESCE(qa.scored_input, '{}'::jsonb),
      '{pole_pick}',
      to_jsonb(qa.pilot_1),
      true
    )
FROM public.sessions AS se
JOIN public.stages AS st ON st.id = se.stage_id
WHERE se.id = qa.session_id
  AND se.type = 'qual'
  AND se.committed IS TRUE
  AND st.sort_order < 7
  AND st.key IN ('australia', 'china', 'japan')
  AND qa.pole_pick IS NULL
  AND qa.pilot_1 IS NOT NULL
  AND qa.pilot_1 <> ''
  AND qa.pred_pos_1 IS NULL;
