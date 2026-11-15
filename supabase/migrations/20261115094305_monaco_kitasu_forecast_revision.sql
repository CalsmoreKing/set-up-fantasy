-- One-record owner-directed Monaco forecast revision for #44993.
-- The audit row stores the complete previous forecast and player row before mutation.
CREATE OR REPLACE FUNCTION public.apply_monaco_kitasu_forecast_revision()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forecast public.forecasts%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_old_total integer;
  v_new_total integer;
  v_old_sum integer;
  v_old_min integer;
  v_new_min integer;
  v_new_predictions jsonb := '{"1":"Verstappen","2":"Antonelli","3":"Leclerc","4":"Hamilton","5":"Russell","6":"Norris","7":"Piastri","8":"Hadjar","9":"Gasly","10":"Albon"}'::jsonb;
  v_new_input jsonb;
  v_new_breakdown jsonb := '[
    {"pts":2,"label":"P2 Antonelli → факт P1"},
    {"pts":1,"label":"P4 Hamilton → факт P2"},
    {"pts":1,"label":"P7 Piastri → факт P4"},
    {"pts":2,"label":"P9 Gasly → факт P7"},
    {"pts":2,"label":"P10 Albon → факт P8"}
  ]'::jsonb;
BEGIN
  IF session_user NOT IN ('postgres','service_role') AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'administrator access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_forecast
  FROM public.forecasts
  WHERE id = 'b8bdc837-34c7-4831-a34f-b22eb5b61557'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target Monaco forecast not found'; END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = v_forecast.session_id
  FOR UPDATE;
  SELECT * INTO v_player
  FROM public.players
  WHERE id = v_forecast.player_id
  FOR UPDATE;

  IF v_forecast.player_id <> '2a3e37b6-52b3-4563-a443-aa94d09fe408'
     OR v_forecast.session_id <> '29571964-207f-498d-bbeb-ce5299c1f20d'
     OR v_session.type <> 'race'
     OR v_session.stage_id <> '9e876055-a0d2-4296-9d9f-e2959ea45ccb'
     OR v_session.committed IS DISTINCT FROM true
     OR v_session.is_locked IS DISTINCT FROM true
     OR v_session.results <> '{"1":"Antonelli","2":"Hamilton","3":"Hadjar","4":"Piastri","5":"Lawson","6":"Lindblad","7":"Gasly","8":"Albon","9":"Ocon","10":"Alonso"}'::jsonb
     OR v_session.fl_pilot <> 'Antonelli'
     OR v_session.ov_pilot <> 'Alonso' THEN
    RAISE EXCEPTION 'Monaco player/session/results precondition mismatch';
  END IF;

  IF v_forecast.score IS DISTINCT FROM 10
     OR v_forecast.fl_pick IS DISTINCT FROM 'Antonelli'
     OR COALESCE(v_forecast.ov_pick,'') <> ''
     OR v_forecast.predictions <> '{"1":"Antonelli","2":"Leclerc","3":"Verstappen","4":"Hamilton","5":"Russell","6":"Norris","7":"Piastri","8":"Hadjar","9":"Lawson","10":"Gasly"}'::jsonb
     OR v_forecast.scored_input <> '{"fl_pick":"Antonelli","ov_pick":"","predictions":{"1":"Antonelli","2":"Leclerc","3":"Verstappen","4":"Hamilton","5":"Russell","6":"Norris","7":"Piastri","8":"Hadjar","9":"Lawson","10":"Gasly"}}'::jsonb
     OR v_forecast.manual_reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'forecast changed since backup or is manually reviewed';
  END IF;

  SELECT COALESCE(sum(f.score),0)
       + (SELECT COALESCE(sum(q.score),0) FROM public.qual_assignments q JOIN public.sessions qs ON qs.id=q.session_id WHERE q.player_id=v_player.id AND qs.committed IS TRUE)
       + (SELECT COALESCE(sum(b.points),0) FROM public.stage_newcomer_bonuses b WHERE b.player_id=v_player.id AND EXISTS (SELECT 1 FROM public.sessions bs WHERE bs.stage_id=b.stage_id AND bs.type='race' AND bs.committed IS TRUE))
    INTO v_old_sum
  FROM public.forecasts f JOIN public.sessions fs ON fs.id=f.session_id
  WHERE f.player_id=v_player.id AND fs.committed IS TRUE;
  IF v_old_sum IS DISTINCT FROM 418 OR v_player.base_pts IS DISTINCT FROM v_old_sum THEN
    RAISE EXCEPTION 'player aggregate no longer matches the backed-up total';
  END IF;

  SELECT min(score) INTO v_old_min
  FROM public.forecasts
  WHERE session_id=v_session.id;
  SELECT min(score) INTO v_new_min
  FROM (
    SELECT score FROM public.forecasts WHERE session_id=v_session.id AND id <> v_forecast.id
    UNION ALL SELECT 8
  ) AS corrected_scores;
  IF v_old_min IS DISTINCT FROM v_new_min THEN
    RAISE EXCEPTION 'correction would change the GP newcomer-bonus minimum; dependent bonus review required';
  END IF;

  v_new_input := jsonb_build_object('predictions',v_new_predictions,'fl_pick','Leclerc','ov_pick','');
  v_old_total := v_player.base_pts;
  v_new_total := v_old_total + (8 - v_forecast.score);

  INSERT INTO public.score_recalculation_audit(stage_id,session_id,actor,status,details)
  VALUES (
    v_session.stage_id,
    v_session.id,
    auth.uid(),
    'completed',
    jsonb_build_object(
      'kind','owner_directed_forecast_revision',
      'source','#44993',
      'forecast_id',v_forecast.id,
      'player_name',v_player.name,
      'before_forecast',to_jsonb(v_forecast),
      'before_player',to_jsonb(v_player),
      'after_scored_input',v_new_input,
      'after_score',8,
      'after_score_breakdown',v_new_breakdown,
      'player_total_delta',-2,
      'newcomer_minimum_unchanged',v_old_min
    )
  );

  UPDATE public.forecasts
  SET predictions=v_new_predictions,
      fl_pick='Leclerc',
      ov_pick='',
      score=8,
      score_breakdown=v_new_breakdown,
      scored_input=v_new_input,
      updated_at=now()
  WHERE id=v_forecast.id;

  UPDATE public.players
  SET base_pts=v_new_total
  WHERE id=v_player.id AND base_pts=v_old_total;
  IF NOT FOUND THEN RAISE EXCEPTION 'player aggregate update lost its expected baseline'; END IF;

  RETURN jsonb_build_object(
    'forecast_id',v_forecast.id,
    'old_score',v_forecast.score,
    'new_score',8,
    'score_delta',-2,
    'player_id',v_player.id,
    'old_player_total',v_old_total,
    'new_player_total',v_new_total,
    'newcomer_minimum',v_old_min
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_monaco_kitasu_forecast_revision() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_monaco_kitasu_forecast_revision() TO authenticated;
