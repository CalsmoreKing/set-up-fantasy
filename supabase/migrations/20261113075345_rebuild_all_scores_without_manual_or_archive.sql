-- One atomic season rebuild: re-score every started, fully committed GP, then replace
-- player totals with the score rows and race-only newcomer awards that now exist.
CREATE OR REPLACE FUNCTION public.recalculate_all_stage_scores(p_stages jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_stage_id uuid;
  v_recalculated integer := 0;
  v_players integer := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'administrator access required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_stages,'[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_stages,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'recalculation must include at least one completed GP';
  END IF;

  CREATE TEMP TABLE _all_stage_payload (
    stage_id uuid PRIMARY KEY,
    payload jsonb NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _all_stage_payload(stage_id,payload)
    SELECT (value->>'stage_id')::uuid,value
    FROM jsonb_array_elements(p_stages);

  IF EXISTS (
    SELECT 1 FROM public.stages st
    WHERE EXISTS (SELECT 1 FROM public.sessions s WHERE s.stage_id=st.id AND s.committed IS TRUE)
      AND NOT EXISTS (SELECT 1 FROM _all_stage_payload p WHERE p.stage_id=st.id)
  ) THEN
    RAISE EXCEPTION 'payload is missing a GP with committed sessions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _all_stage_payload p
    LEFT JOIN public.stages st ON st.id=p.stage_id
    WHERE st.id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.sessions s WHERE s.stage_id=p.stage_id AND s.committed IS TRUE
    )
  ) THEN
    RAISE EXCEPTION 'payload contains an unknown or uncommitted GP';
  END IF;

  FOR v_item IN SELECT payload FROM _all_stage_payload ORDER BY stage_id LOOP
    v_stage_id := (v_item->>'stage_id')::uuid;
    -- The existing per-GP scoring functions use transaction-scoped temp tables.
    -- Clear them between calls so many GPs can share this one atomic transaction.
    DROP TABLE IF EXISTS pg_temp._stage_score_payload;
    DROP TABLE IF EXISTS pg_temp._newcomer_desired;
    DROP TABLE IF EXISTS pg_temp._session_score_deltas;
    PERFORM public.apply_stage_scores(
      v_stage_id,
      COALESCE(v_item->'session_scores','[]'::jsonb),
      COALESCE(v_item->'newcomer_bonuses','[]'::jsonb),
      (v_item->>'newcomer_minimum')::integer
    );
    v_recalculated := v_recalculated + 1;
  END LOOP;

  -- This is replacement, not a delta: archive baselines, unknown residuals, and
  -- any historical manual totals are intentionally not part of the rebuilt score.
  UPDATE public.players p
  SET base_pts =
    COALESCE((SELECT SUM(f.score) FROM public.forecasts f JOIN public.sessions s ON s.id=f.session_id
      WHERE f.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(q.score) FROM public.qual_assignments q JOIN public.sessions s ON s.id=q.session_id
      WHERE q.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(b.points) FROM public.stage_newcomer_bonuses b
      WHERE b.player_id=p.id AND EXISTS (
        SELECT 1 FROM public.sessions s WHERE s.stage_id=b.stage_id AND s.type='race' AND s.committed IS TRUE
      )),0);
  GET DIAGNOSTICS v_players = ROW_COUNT;

  RETURN jsonb_build_object('stages_recalculated',v_recalculated,'players_rebuilt',v_players);
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_all_stage_scores(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_stage_scores(jsonb) TO authenticated;

-- Scoring adjustments are not supported: computed results and current rules are the sole source of truth.
DROP FUNCTION IF EXISTS public.apply_player_score_adjustment(uuid,integer,text);
DROP TABLE IF EXISTS public.score_manual_adjustments;

-- Block direct REST/API edits of computed totals while retaining the profile/admin fields
-- currently edited by the client. SECURITY DEFINER scoring functions remain the only writers.
REVOKE UPDATE, INSERT ON public.players FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name,team,is_admin,auth_user_id,last_rank_delta) ON public.players TO authenticated;
GRANT INSERT (name,team) ON public.players TO authenticated;
