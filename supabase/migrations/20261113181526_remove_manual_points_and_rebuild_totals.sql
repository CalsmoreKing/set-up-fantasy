-- Remove all hand-entered score offsets. Scores for each completed GP were just recalculated;
-- rebuild each player's total exclusively from the per-session ledger and race bonuses.
UPDATE public.players SET manual_pts = 0;

DROP FUNCTION IF EXISTS public.set_player_manual_total(uuid, integer);

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
  CREATE TEMP TABLE _all_stage_payload (stage_id uuid PRIMARY KEY,payload jsonb NOT NULL) ON COMMIT DROP;
  INSERT INTO _all_stage_payload(stage_id,payload)
    SELECT (value->>'stage_id')::uuid,value FROM jsonb_array_elements(p_stages);
  IF EXISTS (
    SELECT 1 FROM public.stages st
    WHERE EXISTS (SELECT 1 FROM public.sessions s WHERE s.stage_id=st.id AND s.committed IS TRUE)
      AND NOT EXISTS (SELECT 1 FROM _all_stage_payload p WHERE p.stage_id=st.id)
  ) THEN RAISE EXCEPTION 'payload is missing a GP with committed sessions'; END IF;
  IF EXISTS (
    SELECT 1 FROM _all_stage_payload p LEFT JOIN public.stages st ON st.id=p.stage_id
    WHERE st.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.sessions s WHERE s.stage_id=p.stage_id AND s.committed IS TRUE)
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
  SET base_pts = COALESCE((SELECT SUM(f.score) FROM public.forecasts f JOIN public.sessions s ON s.id=f.session_id WHERE f.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(q.score) FROM public.qual_assignments q JOIN public.sessions s ON s.id=q.session_id WHERE q.player_id=p.id AND s.committed IS TRUE),0)
    + COALESCE((SELECT SUM(b.points) FROM public.stage_newcomer_bonuses b WHERE b.player_id=p.id AND EXISTS (
        SELECT 1 FROM public.sessions s WHERE s.stage_id=b.stage_id AND s.type='race' AND s.committed IS TRUE
      )),0);
  GET DIAGNOSTICS v_players = ROW_COUNT;
  RETURN jsonb_build_object('stages_recalculated',v_recalculated,'players_rebuilt',v_players);
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_all_stage_scores(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_stage_scores(jsonb) TO authenticated;

ALTER TABLE public.players DROP COLUMN manual_pts;

UPDATE public.players p
SET base_pts = COALESCE((SELECT SUM(f.score) FROM public.forecasts f JOIN public.sessions s ON s.id=f.session_id WHERE f.player_id=p.id AND s.committed IS TRUE),0)
  + COALESCE((SELECT SUM(q.score) FROM public.qual_assignments q JOIN public.sessions s ON s.id=q.session_id WHERE q.player_id=p.id AND s.committed IS TRUE),0)
  + COALESCE((SELECT SUM(b.points) FROM public.stage_newcomer_bonuses b WHERE b.player_id=p.id AND EXISTS (
      SELECT 1 FROM public.sessions s WHERE s.stage_id=b.stage_id AND s.type='race' AND s.committed IS TRUE
    )),0);
