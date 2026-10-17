-- free_call_attempts.outcome: add 'interrupted'
--
-- WHY: endOverdueFreeCalls() used to close a free call left open by a crash or a restart
-- by recording its duration as start + the offer's configured length. On 2026-10-17 the
-- VPS was restarted for a kernel CVE while a customer was forty seconds into her free
-- call, and the sweep wrote it down as a completed ELEVEN-MINUTE call: her one free call
-- was spent and the four-minute milestone was paid on a duration nobody observed.
--
-- There is no record anywhere of how long an interrupted free call really ran (free
-- sessions are kept out of the billing poll, the presence maps are in-memory, and
-- free_call_attempts writes nothing between answered_at and the end of the call), so the
-- sweep now says so instead of guessing. 'interrupted' is that answer: duration_seconds
-- stays NULL and payout_amount stays 0.
--
-- It is NOT 'too_short'. That value asserts the call was under MIN_REAL_CALL_SECONDS,
-- which is a claim about its length, and the whole point here is that we have none.
--
-- Widening a CHECK constraint cannot invalidate an existing row, so this is safe to apply
-- before the code that writes the value. Idempotent.

ALTER TABLE public.free_call_attempts
  DROP CONSTRAINT IF EXISTS free_call_attempts_outcome_check;

ALTER TABLE public.free_call_attempts
  ADD CONSTRAINT free_call_attempts_outcome_check
  CHECK (outcome IN ('ringing', 'cancelled', 'missed', 'rejected',
                     'too_short', 'abandoned_by_astrologer', 'completed',
                     'interrupted'));

-- Self-verifying tail: an index swap or a constraint rename that silently did not take
-- effect is the failure mode this project has been bitten by before, so assert the end
-- state rather than trusting that the statements above ran.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conrelid = 'public.free_call_attempts'::regclass
     AND conname = 'free_call_attempts_outcome_check';
  IF def IS NULL THEN
    RAISE EXCEPTION 'free_call_attempts_outcome_check is missing after migration';
  END IF;
  IF def NOT LIKE '%interrupted%' THEN
    RAISE EXCEPTION 'free_call_attempts_outcome_check does not allow ''interrupted'': %', def;
  END IF;
  -- Every pre-existing value must still be accepted, or an old row becomes unwritable.
  IF def NOT LIKE '%ringing%' OR def NOT LIKE '%too_short%'
     OR def NOT LIKE '%abandoned_by_astrologer%' OR def NOT LIKE '%completed%'
     OR def NOT LIKE '%cancelled%' OR def NOT LIKE '%missed%' OR def NOT LIKE '%rejected%' THEN
    RAISE EXCEPTION 'free_call_attempts_outcome_check dropped an existing value: %', def;
  END IF;
END $$;
