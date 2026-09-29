-- ============================================================================
-- hardening_20 — admin_wallet_transactions gets a real session_id column
-- ============================================================================
-- WHY: hardening_19 (chat/call/video billing 50/50 split, 2026-09-29) started writing
-- one admin_wallet_transactions row per BILLED MINUTE for session billing
-- (service_key='session_billing') — the same one-row-per-minute shape
-- wallet_transactions / vendor_wallet_transactions always had. The new admin "Platform
-- Wallet" page (built the same day) showed these as 5-8 separate small rows per real
-- conversation — exactly the readability problem already fixed for the customer and
-- vendor apps' own transaction history (see index.js's GET /api/wallet and
-- GET /api/vendor/wallet folding fix, same day). Those two tables already carry a real
-- `session_id` column to group rows on; admin_wallet_transactions did not, so
-- hardening_19 could only embed the session id as text inside `description` — not
-- groupable.
--
-- FIX: a real `session_id uuid` column, so the admin ledger can fold the same way.
-- process_session_billing now writes it as a column instead of burying it in text, and
-- the description is shortened accordingly (the session id is now structural, not text).
--
-- Same signature as before (process_session_billing(uuid) -> boolean), so CREATE OR
-- REPLACE really replaces it — no overload (see hardening_08's postmortem on that trap).
-- Only affects session_billing rows going forward; older rows keep their session id
-- embedded in `description` text only (not backfilled — harmless, they just won't fold).
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor. Safe to re-run.
-- ============================================================================

ALTER TABLE public.admin_wallet_transactions ADD COLUMN IF NOT EXISTS session_id uuid;
CREATE INDEX IF NOT EXISTS idx_admin_wallet_transactions_session_id
  ON public.admin_wallet_transactions (session_id) WHERE session_id IS NOT NULL;

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
    SELECT caller_id, vendor_id, per_minute_charge, request_id, call_type
    INTO v_caller_id, v_vendor_id, v_charge, v_request_id, v_call_type
    FROM public.chat_sessions
    WHERE id = p_session_id AND is_active = true AND next_billing_at <= NOW()
    FOR UPDATE;

    IF v_caller_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT wallet_balance INTO v_wallet_balance
    FROM public.customers
    WHERE id = v_caller_id
    FOR UPDATE;

    IF v_wallet_balance IS NULL OR v_wallet_balance < v_charge THEN
        UPDATE public.chat_sessions
        SET is_active = false
        WHERE id = p_session_id;
        RETURN false;
    END IF;

    v_astro_share := ROUND(v_charge * 0.5, 2);
    v_admin_share := v_charge - v_astro_share;

    UPDATE public.customers
    SET wallet_balance = wallet_balance - v_charge
    WHERE id = v_caller_id;

    PERFORM id
    FROM public.astrologers
    WHERE id = v_vendor_id
    FOR UPDATE;

    UPDATE public.astrologers
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_astro_share,
        today_earnings = COALESCE(today_earnings, 0) + v_astro_share,
        total_earnings = COALESCE(total_earnings, 0) + v_astro_share
    WHERE id = v_vendor_id;

    SELECT id INTO v_admin_wallet_id FROM public.admin_wallet ORDER BY updated_at LIMIT 1 FOR UPDATE;

    IF v_admin_wallet_id IS NULL THEN
        RAISE EXCEPTION 'NO_ADMIN_WALLET_ROW' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.admin_wallet
    SET balance = COALESCE(balance, 0) + v_admin_share,
        updated_at = now()
    WHERE id = v_admin_wallet_id;

    -- session_id is now a real column (this file's whole point) — the admin Platform
    -- Wallet page groups on it, same as wallet_transactions/vendor_wallet_transactions.
    INSERT INTO public.admin_wallet_transactions (
        type,
        amount,
        description,
        service_key,
        customer_id,
        session_id
    ) VALUES (
        'credit',
        v_admin_share,
        'Platform share (50%) of automated ' || COALESCE(v_call_type, 'session') || ' billing',
        'session_billing',
        v_caller_id,
        p_session_id
    );

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

    UPDATE public.chat_sessions
    SET next_billing_at = GREATEST(next_billing_at + INTERVAL '60 seconds', NOW())
    WHERE id = p_session_id
    AND is_active = true;

    RETURN true;
END;
$function$;
