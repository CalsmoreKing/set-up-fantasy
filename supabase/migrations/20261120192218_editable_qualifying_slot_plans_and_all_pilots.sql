-- Editable, persisted plans for the final three qualifying rounds, with enough
-- prediction pairs to allocate every remaining starter even to a late newcomer.
ALTER TABLE public.qual_assignments
  ADD COLUMN IF NOT EXISTS pilot_7 text, ADD COLUMN IF NOT EXISTS pred_pos_7 integer,
  ADD COLUMN IF NOT EXISTS pilot_8 text, ADD COLUMN IF NOT EXISTS pred_pos_8 integer,
  ADD COLUMN IF NOT EXISTS pilot_9 text, ADD COLUMN IF NOT EXISTS pred_pos_9 integer,
  ADD COLUMN IF NOT EXISTS pilot_10 text, ADD COLUMN IF NOT EXISTS pred_pos_10 integer,
  ADD COLUMN IF NOT EXISTS pilot_11 text, ADD COLUMN IF NOT EXISTS pred_pos_11 integer,
  ADD COLUMN IF NOT EXISTS pilot_12 text, ADD COLUMN IF NOT EXISTS pred_pos_12 integer,
  ADD COLUMN IF NOT EXISTS pilot_13 text, ADD COLUMN IF NOT EXISTS pred_pos_13 integer,
  ADD COLUMN IF NOT EXISTS pilot_14 text, ADD COLUMN IF NOT EXISTS pred_pos_14 integer,
  ADD COLUMN IF NOT EXISTS pilot_15 text, ADD COLUMN IF NOT EXISTS pred_pos_15 integer,
  ADD COLUMN IF NOT EXISTS pilot_16 text, ADD COLUMN IF NOT EXISTS pred_pos_16 integer,
  ADD COLUMN IF NOT EXISTS pilot_17 text, ADD COLUMN IF NOT EXISTS pred_pos_17 integer,
  ADD COLUMN IF NOT EXISTS pilot_18 text, ADD COLUMN IF NOT EXISTS pred_pos_18 integer,
  ADD COLUMN IF NOT EXISTS pilot_19 text, ADD COLUMN IF NOT EXISTS pred_pos_19 integer,
  ADD COLUMN IF NOT EXISTS pilot_20 text, ADD COLUMN IF NOT EXISTS pred_pos_20 integer,
  ADD COLUMN IF NOT EXISTS pilot_21 text, ADD COLUMN IF NOT EXISTS pred_pos_21 integer,
  ADD COLUMN IF NOT EXISTS pilot_22 text, ADD COLUMN IF NOT EXISTS pred_pos_22 integer;

CREATE TABLE IF NOT EXISTS public.qualifying_slot_plans (
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  stage_order integer NOT NULL CHECK (stage_order IN (23,24,25)),
  slot_count integer NOT NULL DEFAULT 0 CHECK (slot_count BETWEEN 0 AND 22),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, stage_order)
);

ALTER TABLE public.qualifying_slot_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read qualifying slot plans" ON public.qualifying_slot_plans
  FOR SELECT TO public USING (true);
CREATE POLICY "admin manages qualifying slot plans" ON public.qualifying_slot_plans
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
GRANT SELECT ON public.qualifying_slot_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.qualifying_slot_plans TO authenticated;
