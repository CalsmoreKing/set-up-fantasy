-- The first Bahrain stage was cancelled. The stage foreign keys are configured
-- with ON DELETE CASCADE, so this also removes its sessions and their forecasts/results.
DELETE FROM public.stages WHERE key = 'bahrain';
