ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS manual_pts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.set_player_manual_total(p_player_id uuid, p_total integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger integer;
  v_manual integer;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_total IS NULL OR p_total < -100000 OR p_total > 100000 THEN
    RAISE EXCEPTION 'score must be between -100000 and 100000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  SELECT
    COALESCE((SELECT SUM(f.score) FROM public.forecasts f JOIN public.sessions s ON s.id=f.session_id
      WHERE f.player_id=p_player_id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(q.score) FROM public.qual_assignments q JOIN public.sessions s ON s.id=q.session_id
      WHERE q.player_id=p_player_id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(b.points) FROM public.stage_newcomer_bonuses b
      WHERE b.player_id=p_player_id AND EXISTS (
        SELECT 1 FROM public.sessions s WHERE s.stage_id=b.stage_id AND s.type='race' AND s.committed IS TRUE
      )),0)
  INTO v_ledger;

  v_manual := p_total - v_ledger;
  UPDATE public.players SET manual_pts=v_manual, base_pts=p_total WHERE id=p_player_id;
  RETURN v_manual;
END;
$$;
REVOKE ALL ON FUNCTION public.set_player_manual_total(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_player_manual_total(uuid,integer) TO authenticated;

-- Full recalculation replaces computed scores while retaining the explicit admin-set offset.
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

  CREATE TEMP TABLE _all_stage_payload (stage_id uuid PRIMARY KEY, payload jsonb NOT NULL) ON COMMIT DROP;
  INSERT INTO _all_stage_payload(stage_id,payload)
    SELECT (value->>'stage_id')::uuid,value FROM jsonb_array_elements(p_stages);

  IF EXISTS (
    SELECT 1 FROM public.stages st
    WHERE EXISTS (SELECT 1 FROM public.sessions s WHERE s.stage_id=st.id AND s.committed IS TRUE)
      AND NOT EXISTS (SELECT 1 FROM _all_stage_payload p WHERE p.stage_id=st.id)
  ) THEN RAISE EXCEPTION 'payload is missing a GP with committed sessions'; END IF;
  IF EXISTS (
    SELECT 1 FROM _all_stage_payload p LEFT JOIN public.stages st ON st.id=p.stage_id
    WHERE st.id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.sessions s WHERE s.stage_id=p.stage_id AND s.committed IS TRUE
    )
  ) THEN RAISE EXCEPTION 'payload contains an unknown or uncommitted GP'; END IF;

  FOR v_item IN SELECT payload FROM _all_stage_payload ORDER BY stage_id LOOP
    v_stage_id := (v_item->>'stage_id')::uuid;
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

  UPDATE public.players p
  SET base_pts = COALESCE((SELECT SUM(f.score) FROM public.forecasts f JOIN public.sessions s ON s.id=f.session_id
      WHERE f.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(q.score) FROM public.qual_assignments q JOIN public.sessions s ON s.id=q.session_id
      WHERE q.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(b.points) FROM public.stage_newcomer_bonuses b WHERE b.player_id=p.id AND EXISTS (
        SELECT 1 FROM public.sessions s WHERE s.stage_id=b.stage_id AND s.type='race' AND s.committed IS TRUE
      )),0),
    manual_pts = 0;
  GET DIAGNOSTICS v_players = ROW_COUNT;
  RETURN jsonb_build_object('stages_recalculated',v_recalculated,'players_rebuilt',v_players);
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_all_stage_scores(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_stage_scores(jsonb) TO authenticated;
