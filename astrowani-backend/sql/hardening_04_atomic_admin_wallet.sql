-- ============================================================================
-- Astrowani — atomic admin_wallet credit
-- ============================================================================
-- WHY: astroRoutes.js's POST /api/astro/:key credits platform revenue for every
-- paid report with a plain SELECT balance -> add in Node -> UPDATE, then a
-- separate admin_wallet_transactions INSERT — the exact non-atomic
-- read-modify-write pattern that hardening_03_atomic_wallet.sql already fixed
-- for customer/vendor wallets (2026-08-07 audit, ₹5,865 drift). Two concurrent
-- astro-report purchases can race on admin_wallet.balance the same way.
--
-- Mirrors adjust_customer_wallet's shape: the balance change and the ledger
-- insert happen in one statement inside one transaction. admin_wallet is a
-- singleton table (exactly one row), so no id/WHERE clause is needed.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adjust_admin_wallet(
  p_amount          numeric,
  p_description     text DEFAULT NULL,
  p_service_key     text DEFAULT NULL,
  p_customer_id     uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
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

  IF p_idempotency_key IS NOT NULL THEN
    SELECT true INTO v_exists FROM public.admin_wallet_transactions
     WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_exists THEN
      SELECT balance INTO v_new_balance FROM public.admin_wallet LIMIT 1;
      RETURN v_new_balance;
    END IF;
  END IF;

  UPDATE public.admin_wallet
     SET balance = coalesce(balance, 0) + p_amount,
         updated_at = now()
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ADMIN_WALLET_ROW' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_wallet_transactions
    (type, amount, description, service_key, customer_id, idempotency_key)
  VALUES
    (CASE WHEN p_amount > 0 THEN 'credit' ELSE 'debit' END,
     abs(p_amount), p_description, p_service_key, p_customer_id, p_idempotency_key);

  RETURN v_new_balance;
END;
$$;

ALTER TABLE public.admin_wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_wallet_tx_idempotency
  ON public.admin_wallet_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;
