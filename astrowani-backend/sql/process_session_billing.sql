-- ============================================================================
-- Astrowani — process_session_billing (exported from production, 2026-08-08)
-- ============================================================================
-- Previously existed ONLY inside the Supabase dashboard — not in the repo, no
-- version control, unreviewable, unrecoverable if lost or accidentally dropped.
-- See DATABASE_HARDENING_HANDOFF.md §5.5 / §7.3. Exported via:
--
--   SELECT pg_get_functiondef(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'process_session_billing';
--
-- Invoked every 30s by astrowani-backend/src/sessionManager.js's polling loop
-- for every chat_sessions row with next_billing_at <= now(). Contract verified
-- against the live deployed function by scripts/verifyBillingRpc.js (12/12
-- assertions passing as of the 2026-08-07 audit): debits the right amount,
-- credits the astrologer + earnings counters, advances next_billing_at by
-- ~60s, refuses (returns false, charges nothing) when the customer can't
-- afford the next minute, never drives a balance negative, does not
-- double-bill a minute that isn't due yet.
--
-- This is a snapshot of what's LIVE. If you change this function, change it
-- here AND in the Supabase SQL editor, in that order — this file is now the
-- source of truth for review, but the dashboard is still what actually runs.
--
-- UPDATE 2026-08-14: vendor_wallet_transactions.customer_id added (see
-- sql/hardening_06_vendor_txn_counterparty.sql — run that migration first, it
-- adds the column) so the vendor wallet screen can show WHO a per-minute
-- billing credit was earned from, not just an amount. Step 8's INSERT below
-- now includes it.
--
-- UPDATE 2026-08-08: reviewed line-by-line (not just behaviorally tested) and
-- found one real latent double-billing race — the original SELECT only checked
-- is_active=true, never re-verifying next_billing_at <= NOW(). Two overlapping
-- calls for the same session (e.g. a slow sessionManager.js poll tick
-- overlapping the next one) would both pass that check; the second would block
-- on the row lock, then bill again once unblocked, since it never re-checked
-- billing was still actually due. Fixed by adding `AND next_billing_at <= NOW()`
-- to the initial lock-acquiring SELECT below, making the function itself safe
-- regardless of caller behavior. Also added `chat_sessions.per_minute_charge`
-- NOT NULL DEFAULT 0 (was nullable; a NULL charge would have silently corrupted
-- a customer's balance to NULL via the sufficiency-check's NULL-comparison
-- semantics — never triggered in practice, but closed as defense-in-depth).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_session_billing(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id uuid;
    v_vendor_id uuid;
    v_charge numeric;
    v_wallet_balance numeric;
    v_request_id uuid;
    v_call_type text;
BEGIN
    -- 1. Get session details and lock the session row to prevent race conditions.
    -- next_billing_at <= NOW() makes this call safe even if invoked twice for the
    -- same session (see the 2026-08-08 update note above).
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

    -- 4. Deduct from customers.wallet_balance
    UPDATE public.customers
    SET wallet_balance = wallet_balance - v_charge
    WHERE id = v_caller_id;

    -- 5. Lock the astrologer row before updating earnings
    PERFORM id
    FROM public.astrologers
    WHERE id = v_vendor_id
    FOR UPDATE;

    -- 6. Credit astrologers.wallet_balance, today_earnings, total_earnings
    UPDATE public.astrologers
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_charge,
        today_earnings = COALESCE(today_earnings, 0) + v_charge,
        total_earnings = COALESCE(total_earnings, 0) + v_charge
    WHERE id = v_vendor_id;

    -- 7. Insert wallet_transactions debit row with request_id
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

    -- 8. Insert vendor_wallet_transactions credit row with request_id + customer_id
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
        v_charge,
        'Automated ' || COALESCE(v_call_type, 'session') || ' earning',
        p_session_id,
        v_request_id,
        v_caller_id
    );

    -- 9. Advance chat_sessions.next_billing_at by 60 seconds relative to the greatest of next_billing_at and NOW()
    UPDATE public.chat_sessions
    SET next_billing_at = GREATEST(next_billing_at, NOW()) + INTERVAL '60 seconds'
    WHERE id = p_session_id
    AND is_active = true;

    RETURN true;
END;
$function$
