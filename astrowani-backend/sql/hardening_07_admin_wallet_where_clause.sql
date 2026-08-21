-- ============================================================================
-- Astrowani — fix adjust_admin_wallet: it has never once succeeded (2026-08-21)
-- ============================================================================
-- WHY: hardening_04_atomic_admin_wallet.sql reasoned that "admin_wallet is a
-- singleton table (exactly one row), so no id/WHERE clause is needed" and wrote:
--
--     UPDATE public.admin_wallet
--        SET balance = coalesce(balance, 0) + p_amount, updated_at = now()
--     RETURNING balance INTO v_new_balance;
--
-- This database rejects any WHERE-less UPDATE ("UPDATE requires a WHERE clause"
-- — a pg_safeupdate-style guard), and that guard applies inside SECURITY DEFINER
-- functions too. So every call to adjust_admin_wallet raises, and because both
-- call sites deliberately wrap it in a try/catch that only logs (correctly — the
-- customer has already been charged by that point, so a platform-ledger failure
-- must not fail their purchase), it has been failing SILENTLY.
--
-- EVIDENCE: public.admin_wallet_transactions contains ZERO rows, and
-- admin_wallet.balance is still 0, despite the singleton row existing since
-- 2026-07-08. Confirmed by probing the function directly.
--
-- IMPACT — this is wider than the feature that found it:
--   * astroRoutes.js POST /api/astro/:key — 100% platform revenue on every paid
--     JyotishamAstroAPI report has never been recorded.
--   * orderRoutes.js /api/orders/checkout + /:id/cancel — the new remedies
--     wallet-payment revenue and its refund reversal (2026-08-21).
-- Customer wallets are NOT affected: adjust_customer_wallet and
-- adjust_vendor_wallet are keyed by id and always had a WHERE clause, so every
-- customer debit and vendor credit is correct. Only the platform's own
-- revenue-reporting ledger is missing entries.
--
-- NOT BACKFILLED. The historical credits can be reconstructed from
-- wallet_transactions (the customer-side debits are all present and correct),
-- but doing that automatically would risk double-counting against any manual
-- bookkeeping already done. Reconstruct deliberately if the figures are needed.
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
  v_wallet_id   uuid;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'ZERO_AMOUNT' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: a repeated call for the same key is a no-op returning the
  -- current balance, exactly as adjust_customer_wallet does.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT true INTO v_exists FROM public.admin_wallet_transactions
     WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_exists THEN
      SELECT balance INTO v_new_balance FROM public.admin_wallet LIMIT 1;
      RETURN v_new_balance;
    END IF;
  END IF;

  -- THE FIX. Resolve the singleton row's id and lock it, then UPDATE ... WHERE id.
  --
  -- FOR UPDATE is what actually makes this atomic: two concurrent purchases now
  -- serialise on the row lock instead of both reading the same balance. The
  -- original had no WHERE at all, so besides being rejected outright it also
  -- offered no ordering guarantee. Do NOT "simplify" this back to a WHERE-less
  -- UPDATE, however singleton the table is — that is the bug this file exists to
  -- fix, and the failure is silent.
  SELECT id INTO v_wallet_id FROM public.admin_wallet ORDER BY updated_at LIMIT 1 FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'NO_ADMIN_WALLET_ROW' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.admin_wallet
     SET balance = coalesce(balance, 0) + p_amount,
         updated_at = now()
   WHERE id = v_wallet_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.admin_wallet_transactions
    (type, amount, description, service_key, customer_id, idempotency_key)
  VALUES
    (CASE WHEN p_amount > 0 THEN 'credit' ELSE 'debit' END,
     abs(p_amount), p_description, p_service_key, p_customer_id, p_idempotency_key);

  RETURN v_new_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- Should return 1 (and leave a matching admin_wallet_transactions row), where
-- before this file it raised "UPDATE requires a WHERE clause":
--   SELECT public.adjust_admin_wallet(1, 'post-fix probe', NULL, NULL, 'probe-2026-08-21');
--   SELECT * FROM public.admin_wallet_transactions WHERE idempotency_key = 'probe-2026-08-21';
-- Then undo the probe:
--   SELECT public.adjust_admin_wallet(-1, 'undo probe', NULL, NULL, 'probe-2026-08-21-undo');
--   SELECT balance FROM public.admin_wallet;  -- back to its previous value
