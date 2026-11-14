-- The Saudi Arabian GP was officially cancelled. Stage foreign keys cascade
-- to its sessions, predictions, and result rows.
DELETE FROM public.stages WHERE key = 'saudi';
