-- Astrologer "notify me" waitlist schema.
--
-- WHY: Part of the busy-astrologer gating feature — when a customer can't reach an
-- astrologer because they're already in a session/pending request with someone else,
-- they can tap "Notify me" instead of retrying manually. Fire-once: when the astrologer
-- becomes free (session ends, or their only pending request expires), the first few
-- waiters get a push notification and their row is deleted. Not a live auto-connect
-- queue — the customer still has to tap to actually initiate once notified.
-- Run in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.astrologer_waitlist (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  request_type  text NOT NULL DEFAULT 'chat', -- 'chat' | 'audio' | 'video' — informational only
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (astrologer_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_astrologer_waitlist_astro ON public.astrologer_waitlist (astrologer_id);

-- ── RLS: writes/reads go through the backend (service role) only — no client-direct access ──
ALTER TABLE public.astrologer_waitlist ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='astrologer_waitlist' AND policyname='service role full access') THEN
    CREATE POLICY "service role full access" ON public.astrologer_waitlist FOR ALL USING (auth.role() = 'service_role');
  END IF;
END
$$;
