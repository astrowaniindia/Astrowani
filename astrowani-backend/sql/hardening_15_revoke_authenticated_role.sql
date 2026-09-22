-- hardening_15_revoke_authenticated_role.sql
--
-- WHAT THIS CLOSES
-- Every table in `public` granted the Postgres `authenticated` role full
-- INSERT/SELECT/UPDATE/REFERENCES on every column — all 55 of them, including
-- `admins` (login rows), `astrologers` (bank_account_number, bank_ifsc, upi_id,
-- wallet_balance, today_earnings, phone_number, voip_token), `customers`
-- (mobile, wallet_balance, coin_balance, dob), `otp_codes`, `withdrawal_requests`,
-- and both wallet ledgers. Measured 2026-09-23, after a Supabase advisory email
-- flagged `rls_disabled_in_public` + `sensitive_columns_exposed`.
--
-- WHY IT EXISTED
-- Nobody granted this. It is the Supabase project template's DEFAULT PRIVILEGES:
--
--   pg_default_acl, schema public, objtype 'r' (tables):
--     supabase_admin -> {anon=arwdDxtm, authenticated=arwdDxtm, service_role=...}
--     postgres       -> {authenticated=arwdDxtm, service_role=...}
--
-- so every CREATE TABLE in this schema has auto-granted ALL to `authenticated`
-- since the project was created. That is also why hardening_01..14 never caught
-- it: every one of those passes reasoned about the `anon` role (the key shipped
-- inside both apps) and none of them looked at `authenticated`.
--
-- WHY IT WAS EXPLOITABLE
-- The apps do NOT use Supabase Auth — they authenticate with our own Express JWT
-- (see CLAUDE.md: `auth.uid()` is always NULL here, which is why RLS policies are
-- not expressible on the core tables). `select count(*) from auth.users` = 0.
-- But GoTrue is enabled on every Supabase project by default and is reachable
-- with the publishable/anon key, which ships inside both APKs and is not secret.
-- Anyone who signed up through Supabase directly — no app involvement at all —
-- would receive a valid `role: authenticated` JWT and, with it, full read/write
-- on every table above. RLS being off on the core tables means there was no
-- second line of defence behind the grant.
--
-- WHY THIS IS SAFE TO RUN
-- Nothing legitimate uses the `authenticated` role:
--   - the backend uses the SERVICE ROLE key (bypasses grants and RLS entirely);
--   - both apps + the admin read through the `anon` role, which this file does
--     NOT touch — every existing anon grant is left exactly as it is;
--   - `grep -r "supabase.auth."` across both apps and the admin: zero hits.
--
-- DELIBERATELY NOT IN THIS FILE
--   - Enabling RLS on the 8 `rls_disabled_in_public` tables. Those are read
--     directly by the apps over `anon`; RLS with no policy denies everyone,
--     including anon, so turning it on here would break the live astrologer
--     list. That needs explicit per-table permissive policies written to match
--     the existing anon column grants — a separate, app-testable change.
--   - `anon`'s own grants and default privileges. Note `supabase_admin`'s
--     default still auto-grants ALL to anon on new tables; tables created from
--     the SQL editor / MCP are owned by `postgres` (whose default no longer
--     includes anon), so this is latent rather than live. Worth closing later.
--   - Function EXECUTE for `anon`. The 14 hot-updater routines
--     (get_update_info_by_app_version, is_cohort_eligible, …) are called by the
--     OTA update-server edge function; revoking anon's EXECUTE could stop every
--     installed app from receiving updates. The money functions were already
--     locked down in hardening_14 and are confirmed absent from the anon grant.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- 1. Existing objects.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- 2. Future objects — without this, the very next CREATE TABLE re-opens
--    everything closed above. This is the actual root cause.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;

-- `supabase_admin` owns its own default ACL entry and we may not be able to
-- alter it from here. Attempt it, but never fail the migration over it — the
-- postgres-owned default above is the one that governs tables we create.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
       || 'REVOKE ALL ON TABLES FROM authenticated';
  RAISE NOTICE 'supabase_admin default privileges for TABLES revoked from authenticated.';
EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
  RAISE NOTICE 'Could not alter supabase_admin default privileges (%). Tables created '
    'by supabase_admin (Supabase-internal only) may still auto-grant to authenticated.',
    SQLERRM;
END $$;

COMMIT;

-- 3. Self-verifying tail. A half-applied privilege migration fails SILENTLY —
--    everything keeps working and the hole simply stays open — so assert rather
--    than trusting the statements above to have done anything.
DO $$
DECLARE
  remaining_tables int;
  remaining_default int;
BEGIN
  SELECT count(DISTINCT table_name) INTO remaining_tables
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'authenticated';

  IF remaining_tables > 0 THEN
    RAISE EXCEPTION 'hardening_15 FAILED: % table(s) in public still grant privileges '
      'to the authenticated role.', remaining_tables;
  END IF;

  SELECT count(*) INTO remaining_default
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND d.defaclobjtype = 'r'
    AND pg_get_userbyid(d.defaclrole) = 'postgres'
    AND d.defaclacl::text LIKE '%authenticated=%';

  IF remaining_default > 0 THEN
    RAISE EXCEPTION 'hardening_15 FAILED: postgres default privileges in public still '
      'auto-grant to authenticated — the next CREATE TABLE would re-open this.';
  END IF;

  RAISE NOTICE 'hardening_15 OK: authenticated has no privileges on public tables, '
    'and new tables will not grant any.';
END $$;

-- Expect ZERO rows from each of these afterwards.
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'authenticated'
ORDER BY table_name;

SELECT pg_get_userbyid(defaclrole) AS grantor, defaclobjtype AS objtype, defaclacl::text AS acl
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' AND d.defaclacl::text LIKE '%authenticated=%';

-- ROLLBACK (only if something genuinely depended on this role, which nothing
-- in this codebase does):
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO authenticated;
