-- ============================================================================
-- hardening_19 — per-minute chat/call/video billing now splits 50/50 with the platform
-- ============================================================================
-- FOUND 2026-09-29 (owner audit): process_session_billing has, since it was first written,
-- credited the ASTROLOGER with 100% of every per-minute charge on chat, audio and video
-- consultations. There has never been a platform cut on this revenue stream — the ONLY
-- money path in this codebase with none. Everything else already splits or takes a full
-- platform cut:
--   * Gifts (transfer_coins_to_vendor)         -> astrologer 50%, platform 50%
--   * Astro reports (astroRoutes.js)           -> platform 100%, astrologer 0% (no time spent)
--   * Remedy referral commission                -> astrologer ~10%, platform ~90%
--   * Chat / audio / video billing (THIS FILE)  -> astrologer 100%, platform 0%   <- the bug
--
-- FIX: split v_charge into an astrologer share and an admin share that sum EXACTLY to
-- v_charge (no rounding leak in either direction):
--   v_astro_share = ROUND(v_charge * 0.5, 2)
--   v_admin_share = v_charge - v_astro_share
-- The astrologer's wallet_balance/today_earnings/total_earnings and the
-- vendor_wallet_transactions credit row now reflect ONLY v_astro_share (what actually lands
-- in their wallet) — NOT the full amount the customer paid. admin_wallet is credited
-- v_admin_share in the same transaction, using the same "lock the singleton row by id, then
-- UPDATE ... WHERE id" pattern hardening_07 already established (a WHERE-less UPDATE on
-- admin_wallet is silently rejected by this database's pg_safeupdate-style guard — see that
-- file's postmortem). Both credits happen inline in THIS function rather than by calling
-- adjust_admin_wallet, so the whole thing — customer debit, astrologer credit, admin credit,
-- both ledger rows, next_billing_at advance — is one atomic transaction: if the admin_wallet
-- credit somehow fails, the ENTIRE call rolls back (customer is NOT charged, astrologer is
-- NOT credited) and sessionManager.js's poll retries it 30s later. There is no scenario where
-- a customer pays and the platform's share silently goes missing.
--
-- GOING FORWARD ONLY, per the owner's explicit instruction (2026-09-29): earnings already
-- paid out to astrologers under the old 100%-to-astrologer logic are NOT clawed back or
-- adjusted. Only sessions billed AFTER this migration is applied split 50/50. Every OTHER
-- money path (gifts, reports, remedy commission) is UNCHANGED by this file.
--
-- Same signature as before (process_session_billing(uuid) -> boolean), so CREATE OR REPLACE
-- really replaces it — no overload (see hardening_08's postmortem on that exact trap).
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_session_billing(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id uuid;
    v_vendor_id uuid;
    v_charge numeric;
    v_wallet_balance numeric;
    v_request_id uuid;
    v_call_type text;
    v_astro_share numeric;
    v_admin_share numeric;
    v_admin_wallet_id uuid;
BEGIN
    -- 1. Get session details and lock the session row to prevent race conditions.
    -- next_billing_at <= NOW() makes this call safe even if invoked twice for the
    -- same session (see the 2026-08-08 update note in process_session_billing.sql).
    SELECT caller_id, vendor_id, per_minute_charge, request_id, call_type
    INTO v_caller_id, v_vendor_id, v_charge, v_request_id, v_call_type
    FROM public.chat_sessions
    WHERE id = p_session_id AND is_active = true AND next_billing_at <= NOW()
    FOR UPDATE;

    -- If session is not found, not active, or not yet due, return false
    IF v_caller_id IS NULL THEN
        RETURN false;
    END IF;

    -- 2. Lock customer row and get wallet balance
    SELECT wallet_balance INTO v_wallet_balance
    FROM public.customers
    WHERE id = v_caller_id
    FOR UPDATE;

    -- 3. Check wallet_balance >= charge
    IF v_wallet_balance IS NULL OR v_wallet_balance < v_charge THEN
        -- Set chat_sessions.is_active = false
        UPDATE public.chat_sessions
        SET is_active = false
        WHERE id = p_session_id;
        RETURN false;
    END IF;

    -- Split the charge 50/50. ROUND + subtraction (not two separate ROUNDs) guarantees
    -- v_astro_share + v_admin_share == v_charge exactly, so nothing is ever lost or
    -- double-counted to rounding.
    v_astro_share := ROUND(v_charge * 0.5, 2);
    v_admin_share := v_charge - v_astro_share;

    -- 4. Deduct the FULL charge from customers.wallet_balance (the customer pays the
    -- full advertised per-minute rate; the split happens on the revenue side only).
    UPDATE public.customers
    SET wallet_balance = wallet_balance - v_charge
    WHERE id = v_caller_id;

    -- 5. Lock the astrologer row before updating earnings
    PERFORM id
    FROM public.astrologers
    WHERE id = v_vendor_id
    FOR UPDATE;

    -- 6. Credit astrologers.wallet_balance, today_earnings, total_earnings with ONLY
    -- their 50% share.
    UPDATE public.astrologers
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_astro_share,
        today_earnings = COALESCE(today_earnings, 0) + v_astro_share,
        total_earnings = COALESCE(total_earnings, 0) + v_astro_share
    WHERE id = v_vendor_id;

    -- 6b. Lock and credit the singleton admin_wallet row with the platform's 50% share.
    -- Mirrors adjust_admin_wallet's fixed shape (hardening_07): lock the row by id first,
    -- THEN UPDATE ... WHERE id — a WHERE-less UPDATE on this table is rejected outright.
    -- Done inline (not via a call to adjust_admin_wallet) so this whole function is one
    -- atomic transaction: if this fails, everything above rolls back too.
    SELECT id INTO v_admin_wallet_id FROM public.admin_wallet ORDER BY updated_at LIMIT 1 FOR UPDATE;

    IF v_admin_wallet_id IS NULL THEN
        RAISE EXCEPTION 'NO_ADMIN_WALLET_ROW' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.admin_wallet
    SET balance = COALESCE(balance, 0) + v_admin_share,
        updated_at = now()
    WHERE id = v_admin_wallet_id;

    INSERT INTO public.admin_wallet_transactions (
        type,
        amount,
        description,
        service_key,
        customer_id
    ) VALUES (
        'credit',
        v_admin_share,
        'Platform share (50%) of automated ' || COALESCE(v_call_type, 'session') || ' billing, session ' || p_session_id,
        'session_billing',
        v_caller_id
    );

    -- 7. Insert wallet_transactions debit row with request_id — the customer's debit is
    -- always the FULL charge, unaffected by the split.
    INSERT INTO public.wallet_transactions (
        user_id,
        type,
        amount,
        description,
        session_id,
        request_id
    ) VALUES (
        v_caller_id,
        'debit',
        v_charge,
        'Automated ' || COALESCE(v_call_type, 'session') || ' billing',
        p_session_id,
        v_request_id
    );

    -- 8. Insert vendor_wallet_transactions credit row with the astrologer's 50% share
    -- (not the full charge — that would misstate what actually landed in their wallet).
    INSERT INTO public.vendor_wallet_transactions (
        vendor_id,
        type,
        amount,
        description,
        session_id,
        request_id,
        customer_id
    ) VALUES (
        v_vendor_id,
        'credit',
        v_astro_share,
        'Automated ' || COALESCE(v_call_type, 'session') || ' earning (50% platform share)',
        p_session_id,
        v_request_id,
        v_caller_id
    );

    -- 9. Advance chat_sessions.next_billing_at by 60 seconds relative to the scheduled time
    -- (hardening_18's timing fix — kept as-is, unrelated to the split).
    UPDATE public.chat_sessions
    SET next_billing_at = GREATEST(next_billing_at + INTERVAL '60 seconds', NOW())
    WHERE id = p_session_id
    AND is_active = true;

    RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Verify (manual, in the SQL editor) — do NOT run against a real session in production;
-- use scripts/verifyBillingRpc.js or a synthetic session/customer/astrologer instead.
-- ---------------------------------------------------------------------------
-- After applying, the next real billing tick for any active session should show:
--   * customers.wallet_balance drops by the FULL per_minute_charge (unchanged behavior)
--   * astrologers.wallet_balance / today_earnings / total_earnings rise by HALF of it
--   * admin_wallet.balance rises by the other HALF
--   * vendor_wallet_transactions.amount for that row == half the session's per_minute_charge
--   * admin_wallet_transactions gains one new 'credit' row with service_key='session_billing'
