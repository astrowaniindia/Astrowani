-- First-ever session (any astrologer, any type) is free, to let a brand-new customer try
-- the platform before their wallet is ever touched.
--
-- WHY: eligibility (customer has zero prior chat_sessions rows) is checked client-side at
-- request time and stamped onto the session row here; sessionManager.js's billing loop
-- reads this flag to skip charging for the first few minutes without needing to touch the
-- opaque process_session_billing RPC at all. No RLS — matches chat_sessions, which the
-- backend/apps already write to with the anon-key client. Run in Supabase SQL editor.
-- Safe to re-run.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS is_free_session boolean NOT NULL DEFAULT false;
