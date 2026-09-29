-- ============================================================================
-- Astrowani — admin_wallet_delete_transactions (2026-09-30)  ** APPLIED **
-- ============================================================================
-- Lets an admin remove test/mistaken rows from admin_wallet_transactions (the
-- Platform Wallet ledger) WITHOUT corrupting admin_wallet.balance. A raw
-- `DELETE FROM admin_wallet_transactions` would delete the row but leave the
-- balance still counting it — the same class of drift this project's money
-- functions (adjust_admin_wallet etc.) exist to prevent everywhere else.
--
-- Takes an ARRAY of transaction ids, not a single id, because the admin
-- Platform Wallet page shows one FOLDED entry per consultation (see
-- src/sessionFolding.js) — a single displayed row can be several real
-- admin_wallet_transactions rows (one per billed minute) underneath. Deleting
-- "the row you see" means deleting every real row behind it in one atomic
-- transaction, or the balance would only be partially reversed.
--
-- Locks the singleton admin_wallet row FOR UPDATE before touching it — same
-- pattern as adjust_admin_wallet and process_session_billing — so a delete
-- racing a real credit (a live gift, a paid report) can never lose one side.
--
-- Reverses each row by its OWN type: a credit's amount is subtracted from the
-- balance, a debit's amount is added back. Missing ids are silently skipped
-- (already deleted / never existed) rather than raising, so a retried delete
-- is a no-op, not an error.

CREATE OR REPLACE FUNCTION public.admin_wallet_delete_transactions(p_ids uuid[])
 RETURNS TABLE(deleted_count int, reversed_amount numeric, new_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_wallet_id uuid;
    v_reversal numeric := 0;
    v_deleted int := 0;
    v_balance numeric;
BEGIN
    IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
        SELECT balance INTO v_balance FROM public.admin_wallet ORDER BY updated_at LIMIT 1;
        RETURN QUERY SELECT 0, 0::numeric, COALESCE(v_balance, 0);
        RETURN;
    END IF;

    SELECT id INTO v_wallet_id FROM public.admin_wallet ORDER BY updated_at LIMIT 1 FOR UPDATE;
    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'NO_ADMIN_WALLET_ROW' USING ERRCODE = 'P0002';
    END IF;

    -- Sum what reversing these rows costs the balance: a credit being removed
    -- takes money OUT (it was never really earned); a debit being removed
    -- gives money BACK (it was never really spent).
    SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0), COUNT(*)
    INTO v_reversal, v_deleted
    FROM public.admin_wallet_transactions
    WHERE id = ANY(p_ids);

    DELETE FROM public.admin_wallet_transactions WHERE id = ANY(p_ids);

    UPDATE public.admin_wallet
    SET balance = COALESCE(balance, 0) - v_reversal,
        updated_at = now()
    WHERE id = v_wallet_id
    RETURNING balance INTO v_balance;

    RETURN QUERY SELECT v_deleted, v_reversal, v_balance;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_wallet_delete_transactions(uuid[]) FROM PUBLIC, anon, authenticated;

-- Self-verifying tail
DO $$
DECLARE v_overloads int;
BEGIN
  SELECT count(*) INTO v_overloads FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='admin_wallet_delete_transactions';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'admin_wallet_delete_transactions: expected exactly 1 overload, found %', v_overloads;
  END IF;
  RAISE NOTICE 'admin_wallet_delete_transactions installed OK';
END $$;
