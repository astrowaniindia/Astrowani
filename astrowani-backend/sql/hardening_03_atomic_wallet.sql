-- ============================================================================
-- Astrowani — atomic wallet mutations
-- ============================================================================
-- WHY: every balance change in the backend is currently a read-modify-write in
-- JavaScript —
--     SELECT wallet_balance  ->  add in Node  ->  UPDATE wallet_balance
-- followed by a SEPARATE INSERT into the ledger. Two statements, no transaction.
-- Two consequences, both already visible in production:
--
--   1. Lost updates. Two concurrent requests both read 100, both write 90, and
--      one ₹10 debit silently vanishes. Today that is rare because traffic is
--      low; it becomes routine the moment a customer has a call and a gift and
--      a recharge in flight together.
--   2. Torn writes. If the process dies between the UPDATE and the INSERT, the
--      money moved with no ledger row — or the reverse. The audit on 2026-08-07
--      found ₹5,865 across 3 accounts that no longer reconciles.
--
-- These functions do the balance change and the ledger write in ONE statement
-- inside ONE transaction, and the balance check happens inside the UPDATE's
-- WHERE clause so it cannot be raced. This is the same shape as the
-- wallet_recharges flow that already works correctly.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- RUN THIS BEFORE deploying the matching backend change (src/wallet.js). The
-- backend degrades to the old non-atomic path with a loud warning if these
-- functions are missing, so deploy order will not take the API down either way.
-- ============================================================================


-- ── Idempotency ─────────────────────────────────────────────────────────────
-- A retried HTTP request, a socket reconnect, or a duplicate webhook must not
-- apply the same money movement twice. Callers pass a stable key; the second
-- attempt becomes a no-op that returns the current balance.
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.vendor_wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_idempotency
  ON public.wallet_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_wallet_tx_idempotency
  ON public.vendor_wallet_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;


-- ── Customer wallet ─────────────────────────────────────────────────────────
-- p_amount is SIGNED: positive credits, negative debits.
-- Raises INSUFFICIENT_FUNDS rather than allowing a negative balance, unless the
-- caller explicitly opts in (admin corrections legitimately may).
CREATE OR REPLACE FUNCTION public.adjust_customer_wallet(
  p_customer_id     uuid,
  p_amount          numeric,
  p_description     text    DEFAULT NULL,
  p_session_id      uuid    DEFAULT NULL,
  p_request_id      uuid    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL,
  p_allow_negative  boolean DEFAULT false
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_exists      boolean;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'ZERO_AMOUNT' USING ERRCODE = '22023';
  END IF;

  -- Replay of an already-applied movement: return current balance, change nothing.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT true INTO v_exists FROM public.wallet_transactions
     WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_exists THEN
      SELECT wallet_balance INTO v_new_balance FROM public.customers WHERE id = p_customer_id;
      RETURN v_new_balance;
    END IF;
  END IF;

  -- The balance test lives in the WHERE clause, so the row lock taken by UPDATE
  -- serialises concurrent callers. There is no window between reading and writing.
  UPDATE public.customers
     SET wallet_balance = coalesce(wallet_balance, 0) + p_amount
   WHERE id = p_customer_id
     AND (p_allow_negative OR coalesce(wallet_balance, 0) + p_amount >= 0)
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    SELECT true INTO v_exists FROM public.customers WHERE id = p_customer_id;
    IF v_exists THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'NO_SUCH_CUSTOMER' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Same transaction as the balance change: these two cannot come apart.
  INSERT INTO public.wallet_transactions
    (user_id, type, amount, description, session_id, request_id, idempotency_key)
  VALUES
    (p_customer_id,
     CASE WHEN p_amount > 0 THEN 'credit' ELSE 'debit' END,
     abs(p_amount), p_description, p_session_id, p_request_id, p_idempotency_key);

  RETURN v_new_balance;
END;
$$;


-- ── Astrologer wallet ───────────────────────────────────────────────────────
-- Same contract, plus the earnings counters. Earnings only ever move UP: a
-- withdrawal reduces wallet_balance but must not reduce today_earnings or
-- total_earnings, which are reporting figures reset on their own schedule by
-- sessionManager.checkEarningsResets().
CREATE OR REPLACE FUNCTION public.adjust_vendor_wallet(
  p_astrologer_id   uuid,
  p_amount          numeric,
  p_description     text    DEFAULT NULL,
  p_session_id      uuid    DEFAULT NULL,
  p_request_id      uuid    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL,
  p_count_earnings  boolean DEFAULT true,
  p_allow_negative  boolean DEFAULT false
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_exists      boolean;
  v_earn        numeric;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'ZERO_AMOUNT' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT true INTO v_exists FROM public.vendor_wallet_transactions
     WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_exists THEN
      SELECT wallet_balance INTO v_new_balance FROM public.astrologers WHERE id = p_astrologer_id;
      RETURN v_new_balance;
    END IF;
  END IF;

  v_earn := CASE WHEN p_count_earnings AND p_amount > 0 THEN p_amount ELSE 0 END;

  UPDATE public.astrologers
     SET wallet_balance  = coalesce(wallet_balance, 0)  + p_amount,
         today_earnings  = coalesce(today_earnings, 0)  + v_earn,
         total_earnings  = coalesce(total_earnings, 0)  + v_earn
   WHERE id = p_astrologer_id
     AND (p_allow_negative OR coalesce(wallet_balance, 0) + p_amount >= 0)
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    SELECT true INTO v_exists FROM public.astrologers WHERE id = p_astrologer_id;
    IF v_exists THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'NO_SUCH_ASTROLOGER' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.vendor_wallet_transactions
    (vendor_id, type, amount, description, session_id, request_id, idempotency_key)
  VALUES
    (p_astrologer_id,
     CASE WHEN p_amount > 0 THEN 'credit' ELSE 'debit' END,
     abs(p_amount), p_description, p_session_id, p_request_id, p_idempotency_key);

  RETURN v_new_balance;
END;
$$;


-- ── Customer -> astrologer transfer ─────────────────────────────────────────
-- Per-minute billing and gifting both move money from one wallet to the other.
-- Doing it as two separate calls leaves a window where the customer has been
-- debited and the astrologer not yet credited. This wraps both in one
-- transaction: either both sides move or neither does.
-- p_vendor_amount is what the astrologer receives; the difference between it and
-- p_amount is platform revenue (gifts credit the astrologer 50%).
CREATE OR REPLACE FUNCTION public.transfer_customer_to_vendor(
  p_customer_id     uuid,
  p_astrologer_id   uuid,
  p_amount          numeric,
  p_vendor_amount   numeric DEFAULT NULL,
  p_description     text    DEFAULT NULL,
  p_session_id      uuid    DEFAULT NULL,
  p_request_id      uuid    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL
) RETURNS TABLE (customer_balance numeric, vendor_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_amount numeric := coalesce(p_vendor_amount, p_amount);
  v_cust          numeric;
  v_vend          numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;

  v_cust := public.adjust_customer_wallet(
    p_customer_id, -p_amount, p_description, p_session_id, p_request_id,
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':c' END);

  v_vend := public.adjust_vendor_wallet(
    p_astrologer_id, v_vendor_amount, p_description, p_session_id, p_request_id,
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':v' END);

  RETURN QUERY SELECT v_cust, v_vend;
END;
$$;


-- ── Privileges ──────────────────────────────────────────────────────────────
-- These functions move money. Only the backend (service role) may call them.
-- SECURITY DEFINER above means they run as the owner, so the explicit REVOKE
-- from anon/authenticated is what keeps them out of reach of the app key.
REVOKE ALL ON FUNCTION public.adjust_customer_wallet(uuid, numeric, text, uuid, uuid, text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_vendor_wallet(uuid, numeric, text, uuid, uuid, text, boolean, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_customer_to_vendor(uuid, uuid, numeric, numeric, text, uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_customer_wallet(uuid, numeric, text, uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_vendor_wallet(uuid, numeric, text, uuid, uuid, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_customer_to_vendor(uuid, uuid, numeric, numeric, text, uuid, uuid, text) TO service_role;


-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('adjust_customer_wallet','adjust_vendor_wallet','transfer_customer_to_vendor')
 ORDER BY 1;
