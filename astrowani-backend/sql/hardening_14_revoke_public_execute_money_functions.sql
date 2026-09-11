-- hardening_14 — the public key must not be able to call the SECURITY DEFINER money functions.
--
-- WHY: measured 2026-09-12 with Supabase's security advisor plus has_function_privilege:
-- these five functions run as their owner (SECURITY DEFINER, so row-level security and
-- column grants don't apply inside them) and were executable by `anon`, meaning anyone
-- holding the publishable key shipped inside both apps. None of them checks the caller:
--   * adjust_customer_coins     — credit ANY number of coins to ANY customer
--   * transfer_coins_to_vendor  — move ANY customer's coins into ANY astrologer's wallet
--                                 (withdrawable as money)
--   * adjust_admin_wallet       — set the admin wallet to anything
--   * process_session_billing   — bills a due active session; bounded, but not the public's to call
--   * rls_auto_enable           — an event-trigger helper; harmless over RPC, still not public
--
-- The grant came from Postgres's default (EXECUTE to PUBLIC on every new function), not
-- from a deliberate GRANT. The other money functions (adjust_customer_wallet,
-- adjust_vendor_wallet, transfer_customer_to_vendor) were already locked to service_role;
-- these five were created later and missed it.
--
-- SAFE TO APPLY: only the backend calls these (src/coins.js, src/wallet.js,
-- src/sessionManager.js and the test scripts), and the backend uses the service-role key.
-- Neither app calls any of them (grep-verified). Internal calls keep working: they run
-- as the function owner (transfer_coins_to_vendor -> adjust_customer_coins /
-- adjust_vendor_wallet), and event triggers do not check EXECUTE when they fire.
--
-- Abuse check at the time of writing: coin_transactions had zero rows, and every
-- admin_wallet_transactions row carried an idempotency key (the backend's pattern). No
-- sign this was used.
--
-- Idempotent. Run in the Supabase SQL editor.

REVOKE EXECUTE ON FUNCTION public.adjust_customer_coins(uuid, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_coins_to_vendor(uuid, uuid, integer, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_admin_wallet(numeric, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_session_billing(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.adjust_customer_coins(uuid, integer, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_coins_to_vendor(uuid, uuid, integer, numeric, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_admin_wallet(numeric, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_session_billing(uuid) TO service_role;

-- The advisor also flagged process_session_billing for a mutable search_path. A SECURITY
-- DEFINER function should never resolve names through the caller's search_path.
ALTER FUNCTION public.process_session_billing(uuid) SET search_path = public;

-- ── Self-verifying tail ─────────────────────────────────────────────────────
-- A REVOKE that silently did not take effect reads as "done" and leaves the hole open.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.adjust_customer_coins(uuid, integer, text, text, text, text)',
    'public.transfer_coins_to_vendor(uuid, uuid, integer, numeric, text, uuid, text)',
    'public.adjust_admin_wallet(numeric, text, text, uuid, text)',
    'public.process_session_billing(uuid)',
    'public.rls_auto_enable()'
  ] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'hardening_14: % is still executable by anon/authenticated', f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.adjust_customer_coins(uuid, integer, text, text, text, text)',
    'public.transfer_coins_to_vendor(uuid, uuid, integer, numeric, text, uuid, text)',
    'public.adjust_admin_wallet(numeric, text, text, uuid, text)',
    'public.process_session_billing(uuid)'
  ] LOOP
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'hardening_14: service_role lost EXECUTE on % — the backend would break', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'hardening_14 OK: money functions are callable by service_role only';
END $$;
