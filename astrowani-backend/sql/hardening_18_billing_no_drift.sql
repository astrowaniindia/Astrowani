-- ============================================================================
-- hardening_18 — billing clock drifted: customers were charged ~60-65% of real time
-- ============================================================================
-- FOUND 2026-09-24 auditing test sessions: every session billed far fewer minutes than
-- it ran (51 min wall -> 33 billed, 15 -> 10, 10 -> 6, 14 -> 9), i.e. ~Rs3.3/min
-- charged on a Rs5/min consultation.
-- CAUSE: step 9 advanced next_billing_at from GREATEST(next_billing_at, NOW()) + 60s.
-- The billing poll runs every 30s, so a charge that is due at T is usually made at
-- T+0..30s and the next one is scheduled from THAT moment: the period becomes 60-90s
-- and the loss compounds (plus billing pauses while someone is away, which is correct).
-- FIX: advance from the scheduled time, so the grid stays exactly 60s. The outer
-- GREATEST(..., NOW()) is kept so a long outage never causes a burst of catch-up
-- charges (still at most one minute per call).
-- Same signature as before, so CREATE OR REPLACE really replaces it (no overload).
-- NOT APPLIED — this raises what customers are charged (to the advertised rate), so it
-- needs the owner's go-ahead. Apply in the SQL editor, then update
-- process_session_billing.sql to match.
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
    SET next_billing_at = GREATEST(next_billing_at + INTERVAL '60 seconds', NOW())
    WHERE id = p_session_id
    AND is_active = true;

    RETURN true;
END;
$function$
