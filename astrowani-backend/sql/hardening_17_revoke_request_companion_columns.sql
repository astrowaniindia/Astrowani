-- hardening_17_revoke_request_companion_columns.sql
--
-- Finishes what hardening_13 started. That file revoked anon/authenticated UPDATE
-- on `call_requests.status` and `chat_requests.status`, but not on the columns the
-- app used to write in the SAME statement as the status:
--
--   call_requests : responded_at, session_id
--   chat_requests : responded_at
--
-- After hardening_13 these were the ONLY write privileges left anywhere in the
-- database for anon or authenticated. `session_id` is the one worth naming: with a
-- table-wide UPDATE grant, anyone holding the publishable key could repoint a
-- request row at a different session id.
--
-- WHY IT IS SAFE (measured 2026-09-23, not assumed)
--  - Supabase edge logs, trailing 24h: every PATCH to call_requests (2,876),
--    chat_requests (2,888) and astrologers (159) carried
--    `request.sb.jwt.apikey.payload.role = service_role` with
--    `x_client_info: supabase-js/2.108.2; runtime=node`. That is the backend, and
--    the service role bypasses column grants entirely. ZERO anon writes to any
--    table in the window — the only non-service-role traffic at all was 814 OTA
--    update-check RPCs.
--  - Both apps' remaining access to these two tables is `.select()` only. Verified
--    by grep across astrowani_customer-main/src and astrowani_vendors-main/src:
--    no .update(), .insert() or .delete() on either table. The writes moved to
--    POST /api/requests/:kind/:id/status (CLAUDE.md subsystem BW), and the vendor
--    accept path writes through the backend.
--  - These columns were only ever written alongside `status`, which hardening_13
--    already revoked — so any code still attempting it was broken regardless.
--
-- Idempotent. Safe to re-run.

BEGIN;

REVOKE UPDATE (responded_at, session_id) ON public.call_requests FROM anon, authenticated;
REVOKE UPDATE (responded_at)             ON public.chat_requests FROM anon, authenticated;

COMMIT;

-- Self-verifying tail. This one asserts the GLOBAL end state rather than just its
-- own columns: after this file, neither anon nor authenticated should hold a
-- single INSERT/UPDATE/DELETE privilege anywhere in `public`. Stating it that way
-- means the next person to add a write grant gets caught by re-running this.
DO $$
DECLARE
  leftover text := '';
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name, privilege_type, string_agg(column_name, ',' ORDER BY column_name) AS cols
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    GROUP BY table_name, privilege_type
  LOOP
    leftover := leftover || format('%s.%s(%s) ', r.table_name, r.privilege_type, r.cols);
  END LOOP;

  IF leftover <> '' THEN
    RAISE EXCEPTION 'hardening_17: write privileges still held by anon/authenticated: %', leftover;
  END IF;

  RAISE NOTICE 'hardening_17 OK: anon and authenticated hold NO write privilege anywhere in public.';
END $$;

-- ROLLBACK (nothing in either app writes these columns):
--   GRANT UPDATE (responded_at, session_id) ON public.call_requests TO anon;
--   GRANT UPDATE (responded_at) ON public.chat_requests TO anon;
