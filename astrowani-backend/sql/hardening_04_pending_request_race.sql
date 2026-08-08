-- hardening_04_pending_request_race.sql
--
-- Closes a concurrency race confirmed by scripts/testConcurrency.js: the
-- busy-gate in POST /api/call/initiate and POST /api/chat/initiate
-- (checkAstrologerBusy() read, THEN a separate .insert()) is not atomic.
-- Under concurrent requests to the same astrologer, every request can see
-- "not busy" before any insert lands, so all of them insert a pending row.
-- Measured: 19 of 20 concurrent call/initiate calls to one astrologer all
-- "succeeded", creating 19 pending call_requests rows (19 incoming_call
-- pushes to one astrologer, 19 customers mid-ring for someone who can only
-- answer one).
--
-- chat_sessions already has this backstop (uq_one_active_session_per_vendor,
-- hardening_01). call_requests/chat_requests never got the equivalent — this
-- file adds it. Run in the Supabase SQL editor. Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_call_per_astrologer
  ON public.call_requests (astrologer_id) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_chat_per_astrologer
  ON public.chat_requests (receiver_id) WHERE status = 'pending';

-- index.js's insert handlers now catch the resulting 23505 unique_violation
-- and return the same 409 {busy:true} shape as the pre-check, so a request
-- that loses the race gets the normal "astrologer is busy" UI instead of a
-- 500. See the code comments at both insert sites for the exact handling.
