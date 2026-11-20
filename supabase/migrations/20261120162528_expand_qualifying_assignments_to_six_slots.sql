-- Final-round catch-up requires some late entrants to submit up to six unique
-- qualifying pilot/position predictions in a single GP. Preserve the original
-- three columns and add three nullable pairs for backwards-compatible history.
ALTER TABLE public.qual_assignments
  ADD COLUMN IF NOT EXISTS pilot_4 text,
  ADD COLUMN IF NOT EXISTS pred_pos_4 integer,
  ADD COLUMN IF NOT EXISTS pilot_5 text,
  ADD COLUMN IF NOT EXISTS pred_pos_5 integer,
  ADD COLUMN IF NOT EXISTS pilot_6 text,
  ADD COLUMN IF NOT EXISTS pred_pos_6 integer;

COMMENT ON COLUMN public.qual_assignments.pilot_4 IS 'Fourth qualifying pilot prediction slot (6/3/1 scoring).';
COMMENT ON COLUMN public.qual_assignments.pred_pos_4 IS 'Predicted qualifying position for pilot_4.';
COMMENT ON COLUMN public.qual_assignments.pilot_5 IS 'Fifth qualifying pilot prediction slot (6/3/1 scoring).';
COMMENT ON COLUMN public.qual_assignments.pred_pos_5 IS 'Predicted qualifying position for pilot_5.';
COMMENT ON COLUMN public.qual_assignments.pilot_6 IS 'Sixth qualifying pilot prediction slot (6/3/1 scoring).';
COMMENT ON COLUMN public.qual_assignments.pred_pos_6 IS 'Predicted qualifying position for pilot_6.';
