-- Live stream comment moderation (2026-09-16).
--
-- WHY: live stream comments are written by customers and shown to everyone watching.
-- App Store Guideline 1.2 (and Google Play's UGC policy) require a way to report
-- objectionable content, block abusive users, and for the developer to act on
-- reports. Before this there was none: comments were relayed unauthenticated with a
-- client-supplied name.
--
--   live_comment_reports  -- a customer or an astrologer reports one comment
--   live_comment_bans     -- admin removes a customer's ability to comment on ANY stream
--
-- (An astrologer blocking a commenter on their own streams reuses customer_blocks,
-- which already blocks calls and chat; see src/customerModeration.js.)
--
-- Idempotent. Both tables are service-role only: RLS on, no policies, anon revoked.

CREATE TABLE IF NOT EXISTS public.live_comment_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            text NOT NULL,
  astrologer_id         uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,
  reported_customer_id  uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  reporter_customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  reporter_astrologer_id uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,
  comment_text          text,
  reason                text NOT NULL,
  note                  text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'reviewed', 'actioned')),
  admin_note            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_at           timestamptz
);

CREATE INDEX IF NOT EXISTS live_comment_reports_status_idx
  ON public.live_comment_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.live_comment_bans (
  customer_id  uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  reason       text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_comment_bans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_comment_reports FROM anon, authenticated;
REVOKE ALL ON public.live_comment_bans FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.live_comment_reports') IS NULL
     OR to_regclass('public.live_comment_bans') IS NULL THEN
    RAISE EXCEPTION 'live comment moderation tables missing after migration';
  END IF;
  IF has_table_privilege('anon', 'public.live_comment_reports', 'SELECT')
     OR has_table_privilege('anon', 'public.live_comment_bans', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read live comment moderation tables';
  END IF;
END $$;
