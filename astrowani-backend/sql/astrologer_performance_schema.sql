-- Astrologer performance metrics (response time, acceptance rate, repeat-customer rate).
--
-- WHY: call_requests/chat_requests only ever recorded a final status (accepted/rejected/
-- missed/cancelled), never WHEN the astrologer actually responded — so response time (a
-- core metric for the vendor performance dashboard + admin leaderboard) couldn't be
-- computed. responded_at is set once, the moment an astrologer accepts or rejects a
-- request (see incomingRequestActions.js) — left null for missed/cancelled requests,
-- since there was no response to time.
-- No RLS — matches the rest of these tables, written by the app's anon-key client.
-- Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.call_requests ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE public.chat_requests ADD COLUMN IF NOT EXISTS responded_at timestamptz;
