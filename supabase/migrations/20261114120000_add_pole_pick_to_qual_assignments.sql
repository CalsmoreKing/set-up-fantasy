-- Before Canada, qualifying forecasts were a single pole-winner pick. Keep this
-- player-submitted value separate from the admin-managed roulette assignment
-- columns (pilot_1..pilot_3), so an assigned driver cannot score as a forecast.
ALTER TABLE public.qual_assignments
  ADD COLUMN IF NOT EXISTS pole_pick text;

COMMENT ON COLUMN public.qual_assignments.pole_pick IS
  'Player-submitted pole winner prediction for pre-Canada qualifying rounds; distinct from admin pilot assignments.';
