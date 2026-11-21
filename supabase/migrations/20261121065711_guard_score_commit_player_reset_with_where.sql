-- Keep the score-commit RPC safe under database environments that reject unfiltered UPDATEs.
-- Only touch players whose session delta is not already zero; subsequent score deltas remain
-- scoped to the players represented by this session's assignments/forecasts.
DO $migration$
DECLARE
  v_definition text;
  v_old_statement constant text := '  UPDATE public.players SET last_session_delta = 0;';
  v_new_statement constant text := '  UPDATE public.players SET last_session_delta = 0 WHERE last_session_delta IS DISTINCT FROM 0;';
BEGIN
  SELECT pg_get_functiondef('public.apply_session_scores(uuid,jsonb,jsonb,boolean)'::regprocedure)
  INTO v_definition;
  IF position(v_old_statement IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected unfiltered last_session_delta reset was not found; refusing to modify score RPC.';
  END IF;
  EXECUTE replace(v_definition, v_old_statement, v_new_statement);
END;
$migration$;
