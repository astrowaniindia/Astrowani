-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a customer_id column to vendor_wallet_transactions so the vendor wallet
-- screen can show WHO a transaction was with (a call/chat/video customer, or a
-- gift sender) instead of just an amount + generic description.
--
-- Previously adjust_vendor_wallet() only stored session_id/request_id on the
-- ledger row — those work for call/chat/video earnings (which always have a
-- session), but PROFILE gifting (a gift sent outside of an active session, see
-- CLAUDE.md "Live Streaming + Gifts") passes sessionId: null, leaving the ledger
-- row with no way at all to trace back to the customer who sent it.
--
-- Safe to run whether or not hardening_03_atomic_wallet.sql's functions are
-- already live — CREATE OR REPLACE with a new trailing DEFAULT NULL parameter
-- is backward compatible with existing callers that don't pass it.
-- Idempotent — re-running this file is safe.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.vendor_wallet_transactions
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

CREATE INDEX IF NOT EXISTS idx_vendor_wallet_transactions_customer
  ON public.vendor_wallet_transactions (customer_id);

CREATE OR REPLACE FUNCTION public.adjust_vendor_wallet(
  p_astrologer_id   uuid,
  p_amount          numeric,
  p_description     text    DEFAULT NULL,
  p_session_id      uuid    DEFAULT NULL,
  p_request_id      uuid    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL,
  p_count_earnings  boolean DEFAULT true,
  p_allow_negative  boolean DEFAULT false,
  p_customer_id     uuid    DEFAULT NULL
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
    (vendor_id, type, amount, description, session_id, request_id, idempotency_key, customer_id)
  VALUES
    (p_astrologer_id,
     CASE WHEN p_amount > 0 THEN 'credit' ELSE 'debit' END,
     abs(p_amount), p_description, p_session_id, p_request_id, p_idempotency_key, p_customer_id);

  RETURN v_new_balance;
END;
$$;

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

  -- p_customer_id now also stored on the vendor's ledger row (adjust_customer_wallet's own
  -- ledger already has it implicitly via user_id, but the vendor side previously had no
  -- record of who paid them) — see this file's header comment.
  v_vend := public.adjust_vendor_wallet(
    p_astrologer_id, v_vendor_amount, p_description, p_session_id, p_request_id,
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':v' END,
    true, false, p_customer_id);

  RETURN QUERY SELECT v_cust, v_vend;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_vendor_wallet(uuid, numeric, text, uuid, uuid, text, boolean, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_customer_to_vendor(uuid, uuid, numeric, numeric, text, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.adjust_vendor_wallet(uuid, numeric, text, uuid, uuid, text, boolean, boolean, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_customer_to_vendor(uuid, uuid, numeric, numeric, text, uuid, uuid, text) FROM public, anon, authenticated;
