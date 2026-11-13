-- Belgium is not one of the official 2026 Sprint weekends. Remove the
-- mistakenly configured sprint and its eight associated forecasts so the
-- full-season recalculation only includes real sessions.
DELETE FROM public.forecasts
WHERE session_id IN (
  SELECT s.id FROM public.sessions s
  JOIN public.stages st ON st.id = s.stage_id
  WHERE st.key = 'belgium' AND s.type = 'sprint'
);

DELETE FROM public.qual_assignments
WHERE session_id IN (
  SELECT s.id FROM public.sessions s
  JOIN public.stages st ON st.id = s.stage_id
  WHERE st.key = 'belgium' AND s.type = 'sprint'
);

DELETE FROM public.sessions
WHERE id IN (
  SELECT s.id FROM public.sessions s
  JOIN public.stages st ON st.id = s.stage_id
  WHERE st.key = 'belgium' AND s.type = 'sprint'
);
