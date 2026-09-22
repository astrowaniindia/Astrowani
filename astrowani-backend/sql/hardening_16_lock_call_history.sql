-- hardening_16_lock_call_history.sql
--
-- `call_history` was readable in full by the `anon` role — i.e. by anyone holding
-- the publishable key, which ships inside both APKs and is not secret. All 14
-- columns, including `client_name`, `astrologer_name`, `client_avatar`,
-- `astrologer_avatar`, `charge_per_minute`, `total_charge` and `duration_minutes`:
-- a complete, downloadable log of who consulted whom, for how long, and for how
-- much. Found 2026-09-23 while working through the Supabase advisory that
-- prompted hardening_15.
--
-- The tell that these columns are PII is in our own code: the account-deletion
-- purge (src/accountRoutes.js) explicitly NULLs `client_name`/`client_avatar` and
-- `astrologer_name`/`astrologer_avatar` out of this table when someone deletes
-- their account. We already treat them as personal data on the way out; they were
-- world-readable on the way in.
--
-- WHY THIS IS SAFE
-- The table has NO readers at all. Verified across all three codebases
-- (astrowani_customer-main/src, astrowani_vendors-main/src, astrowani-admin/src):
-- zero `.from('call_history')` calls. The only references anywhere are the two
-- account-deletion UPDATEs above, which run through the backend's SERVICE ROLE
-- key — that bypasses both column grants and RLS, so it is unaffected by either
-- statement below. The live session log the apps actually read is `chat_sessions`.
--
-- RLS is enabled as well as the grant being revoked: belt and braces, and it
-- clears the `rls_disabled_in_public` ERROR the Supabase linter raises for this
-- table. With no policies, RLS denies every non-service role outright, which is
-- exactly right for a table nothing is supposed to read from the client.
--
-- Idempotent. Safe to re-run.

BEGIN;

REVOKE ALL ON TABLE public.call_history FROM anon;
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Self-verifying tail: a privilege migration that silently does nothing looks
-- identical to one that worked, so assert instead of assuming.
DO $$
DECLARE
  anon_privs int;
  rls_on boolean;
BEGIN
  SELECT count(*) INTO anon_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'call_history' AND grantee = 'anon';

  SELECT relrowsecurity INTO rls_on
  FROM pg_class WHERE oid = 'public.call_history'::regclass;

  IF anon_privs > 0 THEN
    RAISE EXCEPTION 'hardening_16 FAILED: anon still holds % privilege(s) on call_history.', anon_privs;
  END IF;
  IF NOT rls_on THEN
    RAISE EXCEPTION 'hardening_16 FAILED: RLS is not enabled on call_history.';
  END IF;

  RAISE NOTICE 'hardening_16 OK: call_history is closed to anon and has RLS enabled.';
END $$;

-- ROLLBACK (nothing reads this table, so this should never be needed):
--   ALTER TABLE public.call_history DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT ON public.call_history TO anon;
