-- ============================================================================
-- Astrowani — the platform's 50% leg of session billing must be BEST EFFORT
-- (2026-09-30)  ** APPLIED TO PRODUCTION **
-- ============================================================================
-- Supersedes the platform-share block in hardening_19_billing_50_50_split.sql and
-- hardening_20_admin_wallet_session_id.sql. Those two are still the record of how
-- the split and admin_wallet_transactions.session_id arrived; do NOT re-run either
-- of them after this file, because both reinstate the bug described below.
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- hardening_19/20 ended the admin_wallet leg with:
--
--     IF v_admin_wallet_id IS NULL THEN
--         RAISE EXCEPTION 'NO_ADMIN_WALLET_ROW' USING ERRCODE = 'P0002';
--     END IF;
--
-- process_session_billing is ONE transaction, so that RAISE rolls back everything
-- it had already done: the customer is not debited, the astrologer is not credited,
-- no ledger row is written, and — the part that turns a missing row into an outage —
-- next_billing_at is never advanced.
--
-- sessionManager.processBilling only logs a failed RPC (`catch (err) { console.error
-- (...) }`), so the session is not ended either. It simply comes due again on the
-- next 30s tick, fails again, and repeats. Net effect of one missing admin_wallet
-- row: EVERY consultation on the platform runs FREE, indefinitely, with nothing but
-- a log line to show for it. Before the 50/50 split, admin_wallet could not affect
-- consultation billing at all; hardening_19 made it a single point of failure for
-- all consultation revenue.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- The platform leg now runs inside its own BEGIN/EXCEPTION sub-block. A failure is
-- logged as a WARNING and billing continues normally.
--
-- Losing the platform's ledger entry for one minute is recoverable: the customer's
-- debit in wallet_transactions is the authoritative record of what was charged, and
-- admin_wallet can be corrected by hand afterwards. Refusing to bill at all is not
-- recoverable — that minute of consultation is given away and never comes back.
--
-- This is the same posture every JS money path here already takes with admin_wallet:
-- astroRoutes.js (paid reports), orderRoutes.js (remedy checkout), freeServicesRoutes.js
-- and the gift path in index.js all wrap their adjustAdminWallet call in a log-only
-- try/catch, for exactly this reason — by the time it runs, the customer has been
-- charged and the counterparty paid.
--
-- DO NOT turn that WARNING back into an EXCEPTION.
--
-- ── MONITORING, since the failure is now silent by design ────────────────────
-- scripts/dbHealthCheck.js gained an 'Admin wallet singleton' check: it reports
-- CRITICAL if admin_wallet holds anything other than exactly one row. Zero rows means
-- the platform share of every billed minute, paid report and gift is going unrecorded;
-- more than one row is also wrong, because this function and adjust_admin_wallet both
-- take `ORDER BY updated_at LIMIT 1` and then stamp updated_at, so the balance would
-- alternate between rows and neither would hold the true total.
--
-- ── HOW TO APPLY / WHERE THE FUNCTION LIVES ─────────────────────────────────
-- The full current function body is sql/process_session_billing.sql, which has been
-- brought back in sync with production (it still said 100%-to-the-astrologer while
-- the live function had been split — so re-running it would have reverted the
-- platform's entire consultation revenue). Apply THAT file; it is the source of
-- truth. This file is the reasoning, and the verification below.
--
-- ── VERIFIED 2026-09-30, against the live database ───────────────────────────
-- Both cases were run for real inside a transaction that was then aborted, so nothing
-- persisted (synthetic session on the store-reviewer accounts):
--
--   * admin_wallet emptied entirely, charge ₹21:
--       rpc returned TRUE, customer 500 -> 479, astrologer +10.50, today_earnings
--       +10.50, customer ledger 21, vendor ledger 10.50, admin ledger rows 0,
--       next_billing_at advanced.  <- the outage is gone: billing completed with no
--       admin_wallet row in existence.
--   * normal case, charge ₹25:
--       customer -25, astrologer +12.50, admin_wallet +12.50, admin ledger 12.50,
--       the two halves sum to exactly the charge, and an immediate second call for
--       the same minute returned FALSE (no double-bill).
-- ============================================================================

-- Nothing to run here. Apply sql/process_session_billing.sql.
-- Confirm the deployed function carries the guard:

SELECT
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%EXCEPTION WHEN OTHERS%'
       THEN 'OK — platform share is best-effort'
       ELSE 'BROKEN — a missing admin_wallet row will stop ALL consultation billing; re-apply sql/process_session_billing.sql'
  END AS platform_leg_posture,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%v_astro_share := ROUND%'
       THEN 'OK — 50/50 split present'
       ELSE 'BROKEN — astrologer is being paid 100%'
  END AS split_posture
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'process_session_billing';
