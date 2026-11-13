-- otp_failure_guard — a cap on WRONG OTP guesses per phone number that survives
-- the code itself (security audit 2026-11-13). APPLIED 2026-11-14.
--
-- WHY. A code burns after 5 wrong guesses (OTP_MAX_ATTEMPTS), but a new one could be
-- requested every 45 seconds, forever, with a fresh 5-guess budget each time. That is
-- ~400 guesses an hour at one victim, roughly a 25-30% chance of breaking a chosen
-- account within a month — and an astrologer account controls where payouts go.
-- The counters on otp_codes cannot carry this: that row is replaced on every send
-- and deleted on success or expiry.
--
-- RULE (src/otpGuard.js): 15 wrong guesses inside a rolling 6-hour window lock that
-- number for 6 hours — no new SMS, no verification. Caps an attacker at ~60 guesses a
-- day (~0.2% a month). A successful login clears the counter.

CREATE TABLE IF NOT EXISTS public.otp_failure_guard (
  phone_number      text PRIMARY KEY,
  failures          integer     NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until      timestamptz
);

ALTER TABLE public.otp_failure_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.otp_failure_guard FROM anon, authenticated;

-- Atomic: concurrent wrong guesses must each count. A read-then-write in Node would let
-- a burst of parallel verifies all read the same count and only record one failure.
CREATE OR REPLACE FUNCTION public.otp_guard_record_failure(
  p_phone text, p_max integer, p_window_seconds integer, p_lock_seconds integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.otp_failure_guard;
BEGIN
  INSERT INTO public.otp_failure_guard AS g (phone_number, failures, window_started_at)
  VALUES (p_phone, 1, now())
  ON CONFLICT (phone_number) DO UPDATE SET
    failures = CASE WHEN g.window_started_at < now() - make_interval(secs => p_window_seconds)
                    THEN 1 ELSE g.failures + 1 END,
    window_started_at = CASE WHEN g.window_started_at < now() - make_interval(secs => p_window_seconds)
                    THEN now() ELSE g.window_started_at END
  RETURNING * INTO v_row;

  IF v_row.failures >= p_max THEN
    UPDATE public.otp_failure_guard
       SET locked_until = now() + make_interval(secs => p_lock_seconds),
           failures = 0, window_started_at = now()
     WHERE phone_number = p_phone
     RETURNING locked_until INTO v_row.locked_until;
  END IF;
  RETURN v_row.locked_until;
END $$;

REVOKE ALL ON FUNCTION public.otp_guard_record_failure(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public' AND table_name='otp_failure_guard'
               AND grantee IN ('anon','authenticated')) THEN
    RAISE EXCEPTION 'otp_failure_guard: anon/authenticated still hold a grant';
  END IF;
  IF has_function_privilege('anon', 'public.otp_guard_record_failure(text,integer,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'otp_failure_guard: anon can execute the function';
  END IF;
END $$;
