-- Persist which scoring rows have been manually reviewed by an administrator.
ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS manual_reviewed_at timestamptz;
ALTER TABLE public.qual_assignments
  ADD COLUMN IF NOT EXISTS manual_reviewed_at timestamptz;

COMMENT ON COLUMN public.forecasts.manual_reviewed_at IS 'Timestamp when an administrator manually approved this forecast score.';
COMMENT ON COLUMN public.qual_assignments.manual_reviewed_at IS 'Timestamp when an administrator manually approved this qualifying score.';
