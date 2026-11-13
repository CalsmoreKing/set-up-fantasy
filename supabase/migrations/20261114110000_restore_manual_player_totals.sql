-- Retired before application: manual_pts and manual-total functions were
-- deliberately removed by 20261113181526_remove_manual_points_and_rebuild_totals.sql.
-- Keep this migration version as a no-op so a future `supabase db push` cannot
-- reintroduce the forbidden manual score column or override computed totals.
SELECT 1;
