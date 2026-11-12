-- Scoring and re-scoring use only persisted score columns; do not require scored_input.
-- Keep any pre-existing snapshots untouched, but do not add or depend on those columns.
CREATE OR REPLACE FUNCTION public.apply_session_scores(
  p_session_id uuid,
  p_forecast_scores jsonb DEFAULT '[]'::jsonb,
  p_qual_scores jsonb DEFAULT '[]'::jsonb,
  p_is_recalculation boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
  v_row jsonb;
  v_player_id uuid;
  v_old_score integer;
  v_new_score integer;
  v_forecast_count integer := 0;
  v_qual_count integer := 0;
  v_deltas jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'administrator access required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_forecast_scores,'[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_qual_scores,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'score inputs must be JSON arrays';
  END IF;
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found'; END IF;
  -- Archived rounds may be scored with their date-specific rules; the caller supplies
  -- the calculation produced by the shared scorer and the RPC applies it atomically.
  IF v_session.type = 'qual' THEN
    IF jsonb_array_length(COALESCE(p_forecast_scores,'[]'::jsonb)) <> 0
       OR jsonb_array_length(COALESCE(p_qual_scores,'[]'::jsonb)) <> (SELECT count(*) FROM public.qual_assignments WHERE session_id=p_session_id) THEN
      RAISE EXCEPTION 'qualifying score payload must include every assignment and no forecasts';
    END IF;
  ELSE
    IF jsonb_array_length(COALESCE(p_qual_scores,'[]'::jsonb)) <> 0
       OR jsonb_array_length(COALESCE(p_forecast_scores,'[]'::jsonb)) <> (SELECT count(*) FROM public.forecasts WHERE session_id=p_session_id) THEN
      RAISE EXCEPTION 'forecast score payload must include every forecast and no qualifying assignments';
    END IF;
  END IF;
  IF p_is_recalculation AND v_session.committed IS TRUE AND (
    EXISTS (SELECT 1 FROM public.forecasts WHERE session_id=p_session_id AND score IS NULL)
    OR EXISTS (SELECT 1 FROM public.qual_assignments WHERE session_id=p_session_id AND score IS NULL)
  ) THEN
    RAISE EXCEPTION 'cannot safely re-score a legacy committed session with missing score baselines';
  END IF;
  IF v_session.committed IS NOT TRUE AND (
    EXISTS (SELECT 1 FROM public.forecasts WHERE session_id=p_session_id AND COALESCE(score,0)<>0)
    OR EXISTS (SELECT 1 FROM public.qual_assignments WHERE session_id=p_session_id AND COALESCE(score,0)<>0)
  ) THEN
    RAISE EXCEPTION 'uncommitted session has non-zero stored scores; manual review required before commit';
  END IF;

  DROP TABLE IF EXISTS pg_temp._session_score_deltas;
  CREATE TEMP TABLE _session_score_deltas (player_id uuid PRIMARY KEY, delta integer NOT NULL) ON COMMIT DROP;
  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_forecast_scores,'[]'::jsonb)) LOOP
    SELECT player_id, COALESCE(score,0) INTO v_player_id, v_old_score
      FROM public.forecasts WHERE id = (v_row->>'id')::uuid AND session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'forecast row not found in session'; END IF;
    v_new_score := COALESCE((v_row->>'score')::integer,0);
    UPDATE public.forecasts SET score = v_new_score, score_breakdown = COALESCE(v_row->'score_breakdown','[]'::jsonb)
      WHERE id = (v_row->>'id')::uuid;
    INSERT INTO _session_score_deltas VALUES (v_player_id, v_new_score-v_old_score)
      ON CONFLICT (player_id) DO UPDATE SET delta = _session_score_deltas.delta + EXCLUDED.delta;
    v_forecast_count := v_forecast_count + 1;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_qual_scores,'[]'::jsonb)) LOOP
    SELECT player_id, COALESCE(score,0) INTO v_player_id, v_old_score
      FROM public.qual_assignments WHERE id = (v_row->>'id')::uuid AND session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'qualifying assignment not found in session'; END IF;
    v_new_score := COALESCE((v_row->>'score')::integer,0);
    UPDATE public.qual_assignments SET score = v_new_score WHERE id = (v_row->>'id')::uuid;
    INSERT INTO _session_score_deltas VALUES (v_player_id, v_new_score-v_old_score)
      ON CONFLICT (player_id) DO UPDATE SET delta = _session_score_deltas.delta + EXCLUDED.delta;
    v_qual_count := v_qual_count + 1;
  END LOOP;

  UPDATE public.players SET last_session_delta = 0;
  UPDATE public.players p SET base_pts = COALESCE(p.base_pts,0) + d.delta, last_session_delta = d.delta
    FROM _session_score_deltas d WHERE p.id = d.player_id;
  SELECT COALESCE(jsonb_object_agg(player_id::text,delta),'{}'::jsonb) INTO v_deltas FROM _session_score_deltas;
  UPDATE public.sessions SET is_locked = true, committed = true, committed_at = COALESCE(committed_at,now())
    WHERE id = p_session_id;
  INSERT INTO public.score_recalculation_audit(stage_id,session_id,actor,status,details)
  VALUES (v_session.stage_id,p_session_id,auth.uid(),'completed',jsonb_build_object(
    'is_recalculation',p_is_recalculation,'forecast_rows',v_forecast_count,'qual_rows',v_qual_count,'player_deltas',v_deltas
  ));
  RETURN jsonb_build_object('session_id',p_session_id,'forecast_rows',v_forecast_count,'qual_rows',v_qual_count,'player_deltas',v_deltas);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_session_scores(uuid,jsonb,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_session_scores(uuid,jsonb,jsonb,boolean) TO authenticated;
