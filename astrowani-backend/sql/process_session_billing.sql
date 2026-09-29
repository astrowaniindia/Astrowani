-- ============================================================================
-- Astrowani — process_session_billing
-- ============================================================================
-- Invoked every 30s by astrowani-backend/src/sessionManager.js's polling loop
-- for every chat_sessions row with next_billing_at <= now(). Debits the
-- customer one minute, splits it 50/50 between the astrologer and the platform,
-- writes all three ledger rows, and advances next_billing_at by ~60s. Refuses
-- (returns false, charges nothing) when the customer can't afford the next
-- minute, never drives a balance negative, and does not double-bill a minute
-- that isn't due yet.
--
-- THIS FILE IS THE SOURCE OF TRUTH. It is applied to production with the same
-- text. If you change the function, change it HERE and apply this file — never
-- edit it only in the Supabase dashboard. (Between 2026-08-08 and 2026-09-30
-- the two diverged: the split below was added live while this file still said
-- 100% to the astrologer, so re-running the file would silently have reverted
-- the platform's entire consultation revenue.)
--
-- ── 2026-09-30: 50/50 platform split (recorded here; was live-only) ──────────
-- The astrologer is credited HALF of what the customer pays; the platform keeps
-- the rest in admin_wallet. Two details that are load-bearing:
--
--   * The astrologer's share is ROUNDed and the platform takes the REMAINDER
--     (v_charge - v_astro_share), so the two always sum to exactly what the
--     customer was debited. Rounding both halves independently would leak or
--     mint a paisa on any odd charge.
--   * The admin_wallet UPDATE is keyed `WHERE id =` after a `SELECT ... FOR
--     UPDATE`. This database rejects a WHERE-less UPDATE (a pg_safeupdate-style
--     guard) even inside a SECURITY DEFINER function — that is exactly what kept
--     adjust_admin_wallet silently failing for months, see
--     sql/hardening_07_admin_wallet_where_clause.sql. The row is picked the same
--     way adjust_admin_wallet picks it (ORDER BY updated_at LIMIT 1) so both
--     money paths credit the same wallet.
--
-- ── 2026-09-30: the platform leg is BEST-EFFORT, and must stay that way ──────
-- The first version of the split RAISEd if admin_wallet held no row. Because the
-- whole function is one transaction, that rolled EVERYTHING back: the customer
-- was not charged, the astrologer was not paid, and next_billing_at was not
-- advanced — so sessionManager.processBilling (which only logs a failed RPC)
-- retried every 30s forever and every consultation on the platform ran FREE,
-- silently. One missing row was a platform-wide revenue outage.
--
-- So the platform leg now sits in its own BEGIN/EXCEPTION sub-block: if it
-- fails, the failure is logged as a WARNING and the consultation still bills
-- normally. Losing the ledger entry for one minute is recoverable (the customer
-- debit in wallet_transactions is the record, and admin_wallet can be corrected
-- by hand). Refusing to bill at all is not. This matches how every JS money
-- path here treats admin_wallet — astroRoutes.js and orderRoutes.js both wrap
-- their adjustAdminWallet call in a log-only try/catch for the same reason.
-- DO NOT turn that WARNING back into an EXCEPTION.
--
-- ── Earlier history ─────────────────────────────────────────────────────────
-- 2026-09-24: step 11 no longer drifts (hardening_18_billing_no_drift.sql);
--   search_path pinned to public.
-- 2026-08-14: vendor_wallet_transactions.customer_id added (see
--   sql/hardening_06_vendor_txn_counterparty.sql — run that migration first) so
--   the vendor wallet screen can show WHO a credit was earned from.
-- 2026-08-08: exported out of the Supabase dashboard into version control for
--   the first time, and reviewed line-by-line. That review found a real latent
--   double-billing race — the lock-acquiring SELECT only checked is_active, never
--   re-verifying next_billing_at <= NOW(), so two overlapping calls for the same
--   session (a slow sessionManager poll tick overlapping the next) would both
--   pass, and the second would bill again once the row lock released. Fixed by
--   adding `AND next_billing_at <= NOW()` below, which makes the function safe
--   regardless of caller behaviour. Also made chat_sessions.per_minute_charge
--   NOT NULL DEFAULT 0 (a NULL charge would have corrupted a balance to NULL via
--   the sufficiency check's NULL-comparison semantics).
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
    -- same session (see the 2026-08-08 note above).
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

    -- 3. Check wallet_balance >= charge. The customer is always quoted and
    -- charged the FULL per-minute rate; the split below is invisible to them.
    IF v_wallet_balance IS NULL OR v_wallet_balance < v_charge THEN
        UPDATE public.chat_sessions
        SET is_active = false
        WHERE id = p_session_id;
        RETURN false;
    END IF;

    -- 4. Split the minute. Remainder to the platform so the two halves sum to
    -- exactly v_charge (see the header note).
    v_astro_share := ROUND(v_charge * 0.5, 2);
    v_admin_share := v_charge - v_astro_share;

    -- 5. Deduct the full charge from the customer
    UPDATE public.customers
    SET wallet_balance = wallet_balance - v_charge
    WHERE id = v_caller_id;

    -- 6. Lock the astrologer row before updating earnings
    PERFORM id
    FROM public.astrologers
    WHERE id = v_vendor_id
    FOR UPDATE;

    -- 7. Credit the astrologer their half, into the balance and both earnings
    -- counters (today_earnings drives the vendor dashboard, total_earnings the
    -- 30-day figure — see sessionManager.checkEarningsResets).
    UPDATE public.astrologers
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_astro_share,
        today_earnings = COALESCE(today_earnings, 0) + v_astro_share,
        total_earnings = COALESCE(total_earnings, 0) + v_astro_share
    WHERE id = v_vendor_id;

    -- 8. Credit the platform its half — BEST EFFORT. A failure here must never
    -- abort the billing transaction; see the header note before changing this.
    IF v_admin_share > 0 THEN
        BEGIN
            SELECT id INTO v_admin_wallet_id
            FROM public.admin_wallet
            ORDER BY updated_at
            LIMIT 1
            FOR UPDATE;

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
        EXCEPTION WHEN OTHERS THEN
            -- Loud, because this is unrecorded platform revenue: the customer HAS
            -- been charged and the money is ours, it just never reached the ledger.
            RAISE WARNING 'process_session_billing: platform share of % for session % NOT recorded (%: %) — bill still applied, correct admin_wallet by hand',
                v_admin_share, p_session_id, SQLSTATE, SQLERRM;
        END;
    END IF;

    -- 9. Insert wallet_transactions debit row (the FULL charge — this is the
    -- customer's own record of what they paid, and what every revenue query sums)
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

    -- 10. Insert vendor_wallet_transactions credit row (the astrologer's half)
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

    -- 11. Advance next_billing_at by 60 seconds relative to the greatest of
    -- next_billing_at and NOW() (no drift — hardening_18)
    UPDATE public.chat_sessions
    SET next_billing_at = GREATEST(next_billing_at + INTERVAL '60 seconds', NOW())
    WHERE id = p_session_id
    AND is_active = true;

    RETURN true;
END;
$function$;
