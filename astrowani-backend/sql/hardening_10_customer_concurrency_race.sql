-- ============================================================================
-- hardening_10_customer_concurrency_race.sql
--
-- Closes concurrency and double-click races on the customer side:
--
-- 1. uq_one_pending_call_per_customer:
--    Prevents a customer from having more than one 'pending' call_requests row.
--    Tapping 'Call' rapidly on multiple astrologers cannot create simultaneous
--    pending call rings.
--
-- 2. uq_one_pending_chat_per_customer:
--    Prevents a customer from having more than one 'pending' chat_requests row.
--    Tapping 'Chat' rapidly cannot create simultaneous pending chat requests.
--
-- 3. uq_one_active_session_per_customer:
--    Prevents a customer from having more than one 'is_active = true' row in
--    chat_sessions. Even if two requests somehow raced, only ONE active session
--    can exist for a customer, physically preventing double per-minute billing.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_call_per_customer
  ON public.call_requests (customer_id) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_chat_per_customer
  ON public.chat_requests (caller_id) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_session_per_customer
  ON public.chat_sessions (caller_id) WHERE is_active = true;
