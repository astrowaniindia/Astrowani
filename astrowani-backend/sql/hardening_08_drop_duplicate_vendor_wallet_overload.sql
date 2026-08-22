-- ─────────────────────────────────────────────────────────────────────────────
-- FIXES A LIVE MONEY BUG: every call to adjust_vendor_wallet() from the API has
-- been failing, which is what produced "Withdrawal request failed" in the vendor
-- app.
--
-- ROOT CAUSE
-- `hardening_03_atomic_wallet.sql` created adjust_vendor_wallet() with 8
-- parameters. `hardening_06_vendor_txn_counterparty.sql` then added a 9th
-- (p_customer_id) using CREATE OR REPLACE, on the stated assumption that "a new
-- trailing DEFAULT NULL parameter is backward compatible". That assumption is
-- wrong: in PostgreSQL, CREATE OR REPLACE FUNCTION can only replace a function
-- with the IDENTICAL argument list. Change the parameter count and you create a
-- second, OVERLOADED function instead of replacing the first.
--
-- So the database ended up holding both. Node's callers pass 8 NAMED arguments,
-- which match both candidates (the 9th has a default), so PostgREST cannot
-- resolve the call and returns:
--
--   PGRST203: Could not choose the best candidate function between:
--     public.adjust_vendor_wallet(...8 args...),
--     public.adjust_vendor_wallet(...8 args..., p_customer_id => uuid)
--
-- WHY SESSION BILLING KEPT WORKING
-- transfer_customer_to_vendor() calls adjust_vendor_wallet with NINE POSITIONAL
-- arguments, which can only match the 9-arg version — unambiguous. Only the
-- API-level 8-named-argument calls broke. Verified against production: one
-- withdrawal succeeded on 2026-07-19, before hardening_06 was applied.
--
-- WHAT BROKE (all three callers of wallet.adjustVendorWallet)
--   1. POST /vendor/wallet/withdraw          — the reported bug
--   2. POST /api/admin/astrologers/:id/wallet — admin adjusting a vendor balance
--   3. Admin REJECTING a withdrawal          — so held money could not be returned
--
-- THE FIX
-- Drop the obsolete 8-arg version and keep the 9-arg one. This is safe because
-- the 9-arg version is an exact superset: the first 8 parameters have identical
-- names, types and defaults, so every existing caller resolves to it cleanly.
--
-- Idempotent — safe to re-run. Uses the exact argument-type list so it can only
-- ever drop the intended overload, never the one we want to keep.
-- ─────────────────────────────────────────────────────────────────────────────

-- Before: shows how many overloads exist (expected 2, becomes 1).
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'adjust_vendor_wallet';
  RAISE NOTICE 'adjust_vendor_wallet overloads before: %', n;
END $$;

-- The obsolete 8-argument version. Note there is no p_customer_id here — that
-- is what distinguishes it from the one we keep.
DROP FUNCTION IF EXISTS public.adjust_vendor_wallet(
  uuid,     -- p_astrologer_id
  numeric,  -- p_amount
  text,     -- p_description
  uuid,     -- p_session_id
  uuid,     -- p_request_id
  text,     -- p_idempotency_key
  boolean,  -- p_count_earnings
  boolean   -- p_allow_negative
);

-- After: assert exactly one overload remains, and that it is the 9-arg one.
-- Fails loudly rather than leaving the money path quietly broken.
DO $$
DECLARE
  n         integer;
  n_args    integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'adjust_vendor_wallet';

  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 adjust_vendor_wallet after this migration, found %. '
                    'Every vendor wallet write will keep failing with PGRST203 until this is 1.', n;
  END IF;

  SELECT p.pronargs INTO n_args
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'adjust_vendor_wallet';

  IF n_args <> 9 THEN
    RAISE EXCEPTION 'The surviving adjust_vendor_wallet takes % arguments, expected 9 '
                    '(the p_customer_id version from hardening_06). The wrong overload was dropped — '
                    're-run hardening_06_vendor_txn_counterparty.sql.', n_args;
  END IF;

  RAISE NOTICE 'OK — one adjust_vendor_wallet remains, with 9 arguments.';
END $$;

-- Re-assert grants on the surviving function. Dropping an overload does not
-- affect the other's privileges, but re-stating them makes this file safe to run
-- on a database where only hardening_03 was ever applied.
GRANT EXECUTE ON FUNCTION public.adjust_vendor_wallet(uuid, numeric, text, uuid, uuid, text, boolean, boolean, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.adjust_vendor_wallet(uuid, numeric, text, uuid, uuid, text, boolean, boolean, uuid) FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- GUARD AGAINST A REPEAT
-- Any future change to a money function's PARAMETER LIST must DROP the old
-- signature explicitly in the same file. CREATE OR REPLACE alone silently
-- creates an overload and takes the path down with a PGRST203 that surfaces as a
-- generic 500. This query lists every duplicated function name in public —
-- expect zero rows.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT p.proname, count(*) AS overloads
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public'
   AND p.proname IN ('adjust_customer_wallet', 'adjust_vendor_wallet',
                     'adjust_admin_wallet', 'transfer_customer_to_vendor',
                     'process_session_billing')
 GROUP BY p.proname
HAVING count(*) > 1;
