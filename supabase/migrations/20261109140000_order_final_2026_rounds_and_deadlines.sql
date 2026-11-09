-- Final 2026 rounds: Brazil -> Las Vegas -> Qatar -> Abu Dhabi.
-- Remove only the verified empty, uncommitted Qatar sprint placeholder.
DELETE FROM public.sessions se
USING public.stages st
WHERE st.id=se.stage_id AND st.key='qatar' AND se.type='sprint'
  AND se.results='{}'::jsonb AND COALESCE(se.committed,false)=false
  AND NOT EXISTS (SELECT 1 FROM public.forecasts f WHERE f.session_id=se.id)
  AND NOT EXISTS (SELECT 1 FROM public.qual_assignments q WHERE q.session_id=se.id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sessions se JOIN public.stages st ON st.id=se.stage_id
    WHERE st.key='qatar' AND se.type='sprint'
  ) THEN
    RAISE EXCEPTION 'Qatar sprint session is not empty; review before removing sprint';
  END IF;
END $$;

UPDATE public.stages
SET sort_order=CASE key WHEN 'lasvegas' THEN 23 WHEN 'qatar' THEN 24 WHEN 'uae' THEN 25 ELSE sort_order END,
    has_sprint=false
WHERE key IN ('lasvegas','qatar','uae');

-- Qualifying locks at qualifying start; race forecasts lock at lights-out.
-- Store UTC instants so browsers render the deadline in each viewer's local zone.
UPDATE public.sessions se
SET deadline_utc=CASE st.key
  WHEN 'lasvegas' THEN CASE se.type
    WHEN 'qual' THEN TIMESTAMPTZ '2026-11-21 04:00:00+00'
    WHEN 'race' THEN TIMESTAMPTZ '2026-11-22 04:00:00+00' END
  WHEN 'qatar' THEN CASE se.type
    WHEN 'qual' THEN TIMESTAMPTZ '2026-11-28 18:00:00+00'
    WHEN 'race' THEN TIMESTAMPTZ '2026-11-29 16:00:00+00' END
  WHEN 'uae' THEN CASE se.type
    WHEN 'qual' THEN TIMESTAMPTZ '2026-12-05 14:00:00+00'
    WHEN 'race' THEN TIMESTAMPTZ '2026-12-06 13:00:00+00' END
END
FROM public.stages st
WHERE st.id=se.stage_id AND st.key IN ('lasvegas','qatar','uae') AND se.type IN ('qual','race');
