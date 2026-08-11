-- Admin-triggerable referral popup — history log + default message config.
-- Mirrors notification_broadcasts (sql/notifications_schema.sql). Run in the Supabase
-- SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.referral_popup_broadcasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience        text NOT NULL, -- 'all_customers' | 'all_astrologers' | 'customer' | 'astrologer'
  target_id       uuid,
  target_name     text,
  title           text NOT NULL,
  body            text NOT NULL,
  recipient_count int NOT NULL DEFAULT 0,
  push_success    int NOT NULL DEFAULT 0,
  push_failure    int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_popup_broadcasts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referral_popup_broadcasts' AND policyname='public read referral_popup_broadcasts') THEN
    CREATE POLICY "public read referral_popup_broadcasts" ON public.referral_popup_broadcasts FOR SELECT USING (true);
  END IF;
END
$$;

-- Default title/message the admin "Referral Popup" page pre-fills at send time — reuses
-- the existing app_settings key/value table (already powers the banner rotation interval
-- and session-replay toggle). Editable per-send in the admin UI; this is just the starting
-- point so nobody has to retype it from scratch every time.
INSERT INTO public.app_settings (key, value) VALUES
  ('referral_popup_default_title', 'Invite friends, earn rewards!')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_settings (key, value) VALUES
  ('referral_popup_default_body', 'Share your referral code with friends — you earn a reward every time someone joins and completes their first session.')
ON CONFLICT (key) DO NOTHING;
