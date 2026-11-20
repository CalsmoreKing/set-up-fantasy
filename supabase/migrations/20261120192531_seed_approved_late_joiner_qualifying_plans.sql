INSERT INTO public.qualifying_slot_plans (player_id, stage_order, slot_count)
SELECT p.id, plan.stage_order, plan.slot_count
FROM public.players p
JOIN (VALUES
  ('Даня',23,5),('Даня',24,6),('Даня',25,5),
  ('Педрі',23,4),('Педрі',24,4),('Педрі',25,4),
  ('Хексі',23,4),('Хексі',24,5),('Хексі',25,5)
) AS plan(player_name,stage_order,slot_count) ON plan.player_name=p.name
ON CONFLICT (player_id,stage_order) DO NOTHING;
