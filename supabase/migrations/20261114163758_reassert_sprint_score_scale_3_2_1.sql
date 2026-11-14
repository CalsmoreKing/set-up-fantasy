-- Reassert the season-wide sprint scale: exact = 3, one-place error = 2,
-- two-place error = 1, all other picks = 0. Uses each committed forecast's
-- immutable scored_input when present, otherwise its persisted predictions.
WITH sprint_forecasts AS (
  SELECT f.id,COALESCE(f.scored_input->'predictions',f.predictions) AS picks,s.results
  FROM public.forecasts f
  JOIN public.sessions s ON s.id=f.session_id
  WHERE s.type='sprint' AND s.committed IS TRUE
), positions AS (
  SELECT sf.id,gs.pos,sf.picks->>gs.pos::text AS pilot,
    (SELECT min(r.key::integer) FROM jsonb_each_text(sf.results) r
      WHERE r.key ~ '^[1-5]$' AND r.value=sf.picks->>gs.pos::text) AS actual_pos
  FROM sprint_forecasts sf
  CROSS JOIN LATERAL generate_series(1,5) gs(pos)
), points AS (
  SELECT id,pos,pilot,actual_pos,
    CASE
      WHEN pilot IS NULL OR pilot='' OR actual_pos IS NULL THEN 0
      WHEN abs(pos-actual_pos)=0 THEN 3
      WHEN abs(pos-actual_pos)=1 THEN 2
      WHEN abs(pos-actual_pos)=2 THEN 1
      ELSE 0
    END AS pts
  FROM positions
), rescored AS (
  SELECT id,COALESCE(sum(pts),0)::integer AS score,
    COALESCE(jsonb_agg(jsonb_build_object(
      'label',format('P%s %s → факт P%s',pos,pilot,actual_pos),'pts',pts
    ) ORDER BY pos) FILTER (WHERE pts>0),'[]'::jsonb) AS score_breakdown
  FROM points GROUP BY id
)
UPDATE public.forecasts f
SET score=r.score,score_breakdown=r.score_breakdown
FROM rescored r
WHERE f.id=r.id
  AND (f.score IS DISTINCT FROM r.score OR f.score_breakdown IS DISTINCT FROM r.score_breakdown);

-- Rebuild season totals only when the committed score ledger differs.
WITH ledger AS (
  SELECT p.id,
    COALESCE((SELECT sum(f.score) FROM public.forecasts f JOIN public.sessions s ON s.id=f.session_id
      WHERE f.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT sum(q.score) FROM public.qual_assignments q JOIN public.sessions s ON s.id=q.session_id
      WHERE q.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT sum(b.points) FROM public.stage_newcomer_bonuses b WHERE b.player_id=p.id AND EXISTS (
      SELECT 1 FROM public.sessions s WHERE s.stage_id=b.stage_id AND s.type='race' AND s.committed IS TRUE
    )),0) AS expected_base_pts
  FROM public.players p
)
UPDATE public.players p SET base_pts=l.expected_base_pts
FROM ledger l
WHERE p.id=l.id AND p.base_pts IS DISTINCT FROM l.expected_base_pts;
