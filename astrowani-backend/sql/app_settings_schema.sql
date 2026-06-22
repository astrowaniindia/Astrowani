-- App Settings (key/value) schema.
--
-- WHY: Holds admin-tunable global settings the apps read at runtime. First use:
-- `banner_interval_seconds` — how long each home banner shows before rotating, set
-- from the admin Banners page and applied in both the customer + vendor apps.
-- Run in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Default banner rotation interval (seconds).
INSERT INTO public.app_settings (key, value)
SELECT 'banner_interval_seconds', '4'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'banner_interval_seconds');

-- ── RLS: public read (anon-key reads); writes via service role ──────────────────
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='public read app_settings') THEN
    CREATE POLICY "public read app_settings" ON public.app_settings FOR SELECT USING (true);
  END IF;
END
$$;
