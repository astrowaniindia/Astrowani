-- Free 12-minute introductory call: make it a REAL in-app call, not a phone dialler.
--
-- The astrologer rings the customer from inside the vendor app and both land on the
-- same WebRTC call screens the paid calls already use. Those screens are keyed on a
-- chat_sessions row: socket join_session, signal_connection and /api/call/end all
-- verify membership against caller_id / vendor_id on that table (see index.js —
-- deliberately, it is what stopped session-room eavesdropping in the 2026-08-08
-- audit). So a free call needs a real chat_sessions row too.
--
-- Which raises the one thing that must not go wrong: that row must NEVER be billed.
-- It is marked is_free, and sessionManager's billing loop skips those rows outright.
-- per_minute_charge is also written as 0, so even if the flag were somehow missed the
-- amount is zero — belt and braces on the only money path this feature touches.
--
-- Idempotent. Safe to run more than once.

-- ── 1. chat_sessions: mark a session as never-billable ──────────────────────
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

-- The billing poll filters on (is_active, next_billing_at, is_free) every 30s for as
-- long as anything is live, so it is worth an index rather than a scan.
CREATE INDEX IF NOT EXISTS chat_sessions_active_free_idx
  ON public.chat_sessions (is_active, next_billing_at)
  WHERE is_free = false;

-- Finding the free session belonging to a booking, when the call ends.
CREATE INDEX IF NOT EXISTS chat_sessions_free_idx
  ON public.chat_sessions (id)
  WHERE is_free = true;

-- ── 2. free_call_bookings: what happened on the call ────────────────────────
ALTER TABLE public.free_call_bookings
  ADD COLUMN IF NOT EXISTS call_session_id        uuid,
  ADD COLUMN IF NOT EXISTS call_started_at        timestamptz,
  ADD COLUMN IF NOT EXISTS call_ended_at          timestamptz,
  ADD COLUMN IF NOT EXISTS call_duration_seconds  integer,
  ADD COLUMN IF NOT EXISTS call_attempts          integer NOT NULL DEFAULT 0;

-- terminateSession stamps the booking by this id when a free session ends.
CREATE INDEX IF NOT EXISTS free_call_bookings_call_session_idx
  ON public.free_call_bookings (call_session_id)
  WHERE call_session_id IS NOT NULL;

-- ── 3. Verify, loudly ───────────────────────────────────────────────────────
-- A half-applied migration here is the dangerous case: without is_free the billing
-- loop cannot tell a free call apart, and the code falls back to billing every
-- session it sees. The backend degrades safely (per_minute_charge is 0), but it
-- should never be left in that state silently.
DO $$
DECLARE missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='chat_sessions' AND column_name='is_free')
  THEN missing := missing || ' chat_sessions.is_free'; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='free_call_bookings' AND column_name='call_session_id')
  THEN missing := missing || ' free_call_bookings.call_session_id'; END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'free_call_in_app.sql did not apply cleanly. Missing:%', missing;
  END IF;
  RAISE NOTICE 'free_call_in_app.sql applied: free calls are excluded from billing.';
END $$;

SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'chat_sessions'      AND column_name = 'is_free')
     OR (table_name = 'free_call_bookings' AND column_name LIKE 'call\_%'))
 ORDER BY table_name, column_name;
