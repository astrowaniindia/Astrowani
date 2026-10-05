-- Free instant call: an append-only record of EVERY ring attempt (2026-10-05).
--
-- WHY THIS TABLE HAS TO EXIST, rather than reading free_call_bookings:
-- `free_call_bookings` is deliberately MUTATED and partly ERASED as a customer works
-- through the pool. One booking row is reused for every astrologer they try, and when a
-- connection dies before it was a conversation (under 30s, or the astrologer bailed
-- early) sessionManager.finaliseFreeCallBooking NULLs call_session_id, call_ended_at and
-- call_duration_seconds so the customer can retry with somebody else. That is correct
-- product behaviour and it must not change -- but it means the booking row keeps no
-- memory of the attempts that failed, which is exactly the part an owner needs to see.
-- A ring that nobody answered, a call cut at 4 seconds, an astrologer who hung up at 20
-- -- all of it vanished. So attempts are logged HERE instead, append-only, and nothing
-- in this table is ever rewritten by the retry logic.
--
-- One row per RING, written the moment the astrologer's phone is told to ring, then
-- updated in place as that one attempt resolves. `outcome` is the whole story:
--
--   ringing                  written at ring time; still in flight
--   cancelled                the customer cancelled and moved on to someone else
--   missed                   the ring timed out with no answer
--   rejected                 the astrologer declined
--   too_short                connected but under MIN_REAL_CALL_SECONDS (30s) -- the
--                            booking is released, the customer keeps their free call
--   abandoned_by_astrologer  the astrologer hung up before the 3-minute line
--   completed                a real conversation happened
--
-- `ended_by` is the one fact the database never kept anywhere before: who actually hung
-- up. Combined with duration_seconds it answers "who cuts, and at what second".
--
-- PII: no name, phone or message text -- only ids and timings. Deleting a customer or an
-- astrologer sets the link NULL and leaves the row, like customer_reports and
-- session_flags, so historical counts do not silently change.
--
-- Idempotent. Service-role only: RLS on, no policies, anon/authenticated revoked
-- (see hardening_15 for why `authenticated` must be named explicitly).

CREATE TABLE IF NOT EXISTS public.free_call_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid,
  customer_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  astrologer_id    uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,
  request_id       uuid,
  session_id       uuid,
  -- Which astrologer in the sequence this was for this booking: 1 = the first person
  -- they tried. This is what makes "customers give up after N tries" answerable.
  attempt_no       integer,
  outcome          text NOT NULL DEFAULT 'ringing'
                   CHECK (outcome IN ('ringing', 'cancelled', 'missed', 'rejected',
                                      'too_short', 'abandoned_by_astrologer', 'completed')),
  -- Who hung up: 'customer' | 'astrologer' | 'system' (a backstop sweep ended it).
  ended_by         text CHECK (ended_by IN ('customer', 'astrologer', 'system')),
  rang_at          timestamptz NOT NULL DEFAULT now(),
  answered_at      timestamptz,
  ended_at         timestamptz,
  -- Seconds of actual conversation. NULL while ringing or if never answered; 0 is a real
  -- answer that produced no talk time and is NOT the same as NULL.
  duration_seconds integer,
  -- Seconds between the phone starting to ring and it being answered/given up on, so
  -- "how long will a customer wait" is measurable.
  ring_seconds     integer,
  -- What the platform paid the astrologer for this attempt, in rupees.
  payout_amount    numeric(10, 2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The attempt is looked up by session when the call ends, and by request when the
-- customer cancels. Both are the hot paths.
CREATE UNIQUE INDEX IF NOT EXISTS free_call_attempts_request_uniq
  ON public.free_call_attempts (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS free_call_attempts_session_idx
  ON public.free_call_attempts (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS free_call_attempts_recent_idx
  ON public.free_call_attempts (rang_at DESC);
CREATE INDEX IF NOT EXISTS free_call_attempts_customer_idx
  ON public.free_call_attempts (customer_id, rang_at DESC);
CREATE INDEX IF NOT EXISTS free_call_attempts_astrologer_idx
  ON public.free_call_attempts (astrologer_id, rang_at DESC);
CREATE INDEX IF NOT EXISTS free_call_attempts_booking_idx
  ON public.free_call_attempts (booking_id);

ALTER TABLE public.free_call_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_call_attempts FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.free_call_attempts') IS NULL THEN
    RAISE EXCEPTION 'free_call_attempts missing after migration';
  END IF;
  IF has_table_privilege('anon', 'public.free_call_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.free_call_attempts', 'SELECT') THEN
    RAISE EXCEPTION 'anon/authenticated can still read free_call_attempts';
  END IF;
  IF has_table_privilege('anon', 'public.free_call_attempts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.free_call_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'anon/authenticated can still write free_call_attempts';
  END IF;
END $$;
