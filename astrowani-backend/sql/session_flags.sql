-- Off-platform contact flags (2026-09-25).
--
-- WHY: an astrologer who hands a customer a phone number, email, UPI id or messaging
-- handle takes the consultation (and its revenue) off the platform. src/contactLeakDetector.js
-- describes every chat message; a match is recorded here for an admin to review. The
-- message itself is NEVER blocked -- this is an audit trail, not a filter.
--
--   source      'chat' now; 'call' when call transcripts exist
--   severity    'high' = contact details present, 'low' = wording only (a channel name,
--               a request for a number)
--   kinds       phone | email | upi | link | handle | channel | contact_request
--   excerpt     the message text, capped at 500 chars, so a reviewer sees it without
--               opening the transcript
--
-- Kept like other safety records (customer_reports): it survives account deletion, with
-- the person links set NULL.
--
-- Idempotent. Service-role only: RLS on, no policies, anon/authenticated revoked
-- (see hardening_15 for why `authenticated` must be named).

CREATE TABLE IF NOT EXISTS public.session_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'call')),
  session_id    text,
  message_id    text,
  sender_role   text NOT NULL CHECK (sender_role IN ('astrologer', 'customer')),
  astrologer_id uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  severity      text NOT NULL CHECK (severity IN ('high', 'low')),
  kinds         text[] NOT NULL DEFAULT '{}',
  excerpt       text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  admin_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

-- One flag per message; a redelivered request cannot double-record.
CREATE UNIQUE INDEX IF NOT EXISTS session_flags_message_uniq
  ON public.session_flags (source, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS session_flags_queue_idx
  ON public.session_flags (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS session_flags_astrologer_idx
  ON public.session_flags (astrologer_id, created_at DESC);

ALTER TABLE public.session_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_flags FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.session_flags') IS NULL THEN
    RAISE EXCEPTION 'session_flags missing after migration';
  END IF;
  IF has_table_privilege('anon', 'public.session_flags', 'SELECT')
     OR has_table_privilege('authenticated', 'public.session_flags', 'SELECT') THEN
    RAISE EXCEPTION 'anon/authenticated can still read session_flags';
  END IF;
END $$;
