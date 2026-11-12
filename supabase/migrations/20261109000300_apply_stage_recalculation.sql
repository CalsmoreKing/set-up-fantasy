-- Recalculate every session of one GP and reconcile its newcomer race bonus atomically.
CREATE OR REPLACE FUNCTION public.apply_stage_scores(
  p_stage_id uuid,
  p_session_scores jsonb DEFAULT '[]'::jsonb,
  p_newcomer_bonuses jsonb DEFAULT '[]'::jsonb,
  p_newcomer_minimum integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_session_id uuid;
  v_session_count integer;
  v_processed integer := 0;
  v_bonus_result jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'administrator access required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_session_scores,'[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_newcomer_bonuses,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'stage score inputs must be JSON arrays';
  END IF;

  PERFORM 1 FROM public.stages WHERE id=p_stage_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;

  SELECT count(*) INTO v_session_count FROM public.sessions WHERE stage_id=p_stage_id;
  IF v_session_count=0 OR jsonb_array_length(COALESCE(p_session_scores,'[]'::jsonb))<>v_session_count THEN
    RAISE EXCEPTION 'recalculation must include every session in the GP';
  END IF;

  CREATE TEMP TABLE _stage_score_payload (
    session_id uuid PRIMARY KEY,
    payload jsonb NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _stage_score_payload(session_id,payload)
    SELECT (value->>'session_id')::uuid,value
    FROM jsonb_array_elements(COALESCE(p_session_scores,'[]'::jsonb));
  IF EXISTS (
    SELECT 1 FROM _stage_score_payload p
    LEFT JOIN public.sessions s ON s.id=p.session_id AND s.stage_id=p_stage_id
    WHERE s.id IS NULL OR s.committed IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'every supplied session must belong to this GP and already be committed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sessions s
    LEFT JOIN _stage_score_payload p ON p.session_id=s.id
    WHERE s.stage_id=p_stage_id AND p.session_id IS NULL
  ) THEN
    RAISE EXCEPTION 'recalculation payload is missing a GP session';
  END IF;

  FOR v_row IN
    SELECT p.payload FROM _stage_score_payload p
    JOIN public.sessions s ON s.id=p.session_id
    ORDER BY CASE s.type WHEN 'qual' THEN 1 WHEN 'sprint' THEN 2 WHEN 'race' THEN 3 ELSE 4 END,s.id
  LOOP
    v_session_id := (v_row->>'session_id')::uuid;
    PERFORM public.apply_session_scores(
      v_session_id,
      COALESCE(v_row->'forecast_scores','[]'::jsonb),
      COALESCE(v_row->'qual_scores','[]'::jsonb),
      true
    );
    v_processed := v_processed + 1;
  END LOOP;

  -- The helper replaces old newcomer awards with differences, so repeats never double-add points.
  v_bonus_result := public.apply_stage_newcomer_bonuses(
    p_stage_id,
    COALESCE(p_newcomer_bonuses,'[]'::jsonb),
    p_newcomer_minimum
  );
  RETURN jsonb_build_object(
    'stage_id',p_stage_id,
    'sessions_recalculated',v_processed,
    'newcomer_reconciliation',v_bonus_result
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stage_scores(uuid,jsonb,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_stage_scores(uuid,jsonb,jsonb,integer) TO authenticated;
