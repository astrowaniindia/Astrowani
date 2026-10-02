-- ============================================================================
-- Astrowani — session connectivity flag
-- ============================================================================
-- Owner's request 2026-10-02, right after watching both sides of a live test: the
-- in-chat "Network problem" notice and the frozen timer explain a drop WHILE it is
-- happening, but nothing about it was ever written down. A customer or astrologer
-- looking at their session history later — or an admin reviewing a dispute — sees a
-- plain "2 min, ₹2.50 earned" row with no reason the numbers don't look like a clean
-- 2-minute call, which is exactly the kind of gap that becomes a "I was shortchanged"
-- complaint. This column is the record that survives after the live notice is gone.
--
-- Set from ONE place only: sessionManager.bothParticipantsPresent(), the instant a
-- participant is first noticed absent (the same moment billing pauses for that
-- session). Never cleared — once a session has had a connectivity gap, it always
-- did; the card label is a historical fact about what happened, not a live status.
--
-- Deliberately a bare boolean, not a timestamp or a dropped-side enum: the session
-- card just needs "something happened here, don't be surprised by the numbers" —
-- richer detail (who dropped, how many times, for how long) is already sitting in
-- the backend logs for whoever needs to investigate a specific dispute, and is not
-- worth a UI commitment on three different screens.
-- ============================================================================

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS had_connectivity_issue boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_sessions.had_connectivity_issue IS
  'True if either participant was ever detected absent from the session room during '
  'this consultation (sessionManager.bothParticipantsPresent). Billing paused for at '
  'least part of the session when this is true. Set once, never cleared.';

-- No new GRANT needed. hardening_02_access_control.sql already did
-- `GRANT SELECT ON public.chat_sessions TO anon` with no column list, and a
-- table-level grant with no column list covers every column including ones added
-- later — verified below, the same way hardening_10 self-verifies its own grant.
DO $$
BEGIN
  IF NOT has_column_privilege('anon', 'public.chat_sessions', 'had_connectivity_issue', 'SELECT') THEN
    RAISE EXCEPTION 'anon cannot SELECT the new column — check the table-level GRANT on chat_sessions';
  END IF;
  RAISE NOTICE 'session_connectivity_flag OK: column added, anon can read it, default is false';
END $$;
