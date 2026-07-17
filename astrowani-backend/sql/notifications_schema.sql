-- Unified notification system schema.
--
-- WHY: a `notifications` table already existed (id, created_at, astrologer_id, customer_id,
-- title, body, is_read) — built earlier alongside the vendor app's Notification screen, but
-- with no matching migration file anywhere in the repo. Rather than replace it, this adapts
-- to it: exactly one of astrologer_id/customer_id is set per row to identify the recipient,
-- and we just add the two columns the new admin-send flow needs (`type`, `data`). Fanned out
-- one row per recipient at send time — same style as call_requests/chat_sessions elsewhere in
-- this schema. `notification_broadcasts` is a new, compact admin-facing send log that stays
-- small regardless of audience size. Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'admin_broadcast';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_astrologer ON public.notifications (astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON public.notifications (customer_id, created_at DESC);

-- Compact admin-facing send log — doesn't grow with audience size.
CREATE TABLE IF NOT EXISTS public.notification_broadcasts (
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

-- ── Realtime — bell badge + notification list live updates ─────────────────────
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

-- ── RLS — same trust model as reviews/favorites/call_requests: these apps don't use
-- Supabase Auth sessions, so reads/writes are public at the RLS layer and scoped
-- client-side by a known id (customer/astrologer id already held by the app). Only
-- enable if this table doesn't already have RLS configured differently. ───────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='public read notifications') THEN
    CREATE POLICY "public read notifications" ON public.notifications FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='public update notifications') THEN
    CREATE POLICY "public update notifications" ON public.notifications FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END
$$;
