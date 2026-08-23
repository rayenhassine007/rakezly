-- One-time migration for existing Rakezly Supabase projects.
-- Supabase Dashboard → SQL Editor → New query → paste → Run.

alter table public.profiles add column if not exists study_path jsonb;

-- Refresh PostgREST schema cache (usually automatic within ~1 min).
notify pgrst, 'reload schema';
