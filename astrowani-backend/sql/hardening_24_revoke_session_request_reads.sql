-- hardening_24 — close the last two rls_disabled_in_public findings.
--
-- ============================ DO NOT APPLY YET ============================
-- This file is written and ready. It must NOT be applied until the OTA carrying the app
-- changes has actually reached phones. Applying it early breaks every installed build
-- that still reads these tables directly — including, on the vendor side, the screen that
-- shows an astrologer an incoming chat request.
--
-- PRECONDITIONS, all three:
--   1. The backend is deployed (sessionReadRoutes + the incoming_chat / request_cancelled
--      emits in index.js). Without it the apps have nothing to read instead.
--   2. Both apps have been OTA'd and the bundle has had time to be picked up. Installed
--      builds take it on their next launch, so allow a few days.
--   3. The Supabase API logs show NO anon reads of these tables for a day or two. This is
--      the check that actually settles it, and it is strictly better evidence than any
--      device test, because it covers the whole installed base:
--
--        query_logs on source = 'edge_logs', grouped by
--          log_attributes['request.sb.jwt.apikey.payload.role']
--
--      READ IT BY ROLE, NOT BY RAW COUNT. On 2026-09-23 the raw counts showed thousands
--      of requests against these tables and looked like live direct traffic; broken down
--      by role, every one was service_role — our own backend, which bypasses column
--      grants entirely and cannot be affected by a revoke. Zero anon. The raw number was
--      measuring the thing that was never at risk. (CLAUDE.md CU.)
-- ==========================================================================
--
-- WHAT IS BEING CLOSED. chat_requests and chat_sessions are the last two tables in
-- `public` with RLS off and an anon SELECT grant. Between them, anyone holding the
-- publishable key that ships inside both APKs could download who consulted which
-- astrologer, when, for how long and at what rate — 9 columns including caller_name (82
-- real names as of 2026-10-21) and 14 including per_minute_charge, room_id and the
-- session timestamps. There is NO write exposure: anon holds SELECT only and
-- authenticated holds nothing at all, since hardening_15/17. So the Supabase advisory
-- email's "read, edit, and delete all data" does not describe this project.
--
-- WHY RLS ALONE IS THE WHOLE FIX HERE. The apps do not use Supabase Auth — they use our
-- own Express JWT — so auth.uid() is always NULL and no useful policy can be expressed on
-- these tables (subsystem U). RLS on with NO policy means deny-everyone, which is the
-- correct posture for a table only the service role should touch. The backend runs on the
-- service role, which bypasses both RLS and column grants, so none of our own API is
-- affected. Do NOT "fix" the resulting rls_enabled_no_policy INFO lint by adding a
-- permissive policy; there are 45 tables already in that state deliberately.

BEGIN;

-- 1. Take the read grants away from the two app-facing roles.
REVOKE ALL ON TABLE public.chat_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_sessions FROM anon, authenticated;

-- 2. Turn RLS on, so there is a second line of defence behind the grant — and so a future
--    default privilege cannot silently re-open the table. supabase_admin's default
--    privileges still auto-grant to anon AND authenticated on new tables and could not be
--    altered from here (CLAUDE.md CT), which is exactly why this step is not optional.
ALTER TABLE public.chat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- 3. Self-verifying tail. A migration that reports success while leaving the end state
--    wrong is worse than one that fails: this raises rather than letting a half-applied
--    revoke look done (the lesson from the index-swap migrations).
DO $$
DECLARE
  leftover_grants int;
  rls_off int;
BEGIN
  SELECT count(*) INTO leftover_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('chat_requests', 'chat_sessions')
    AND grantee IN ('anon', 'authenticated');
  IF leftover_grants <> 0 THEN
    RAISE EXCEPTION 'hardening_24: % grant(s) still held by anon/authenticated on the two tables',
      leftover_grants;
  END IF;

  SELECT count(*) INTO rls_off
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('chat_requests', 'chat_sessions')
    AND c.relrowsecurity = false;
  IF rls_off <> 0 THEN
    RAISE EXCEPTION 'hardening_24: RLS still disabled on % of the two tables', rls_off;
  END IF;

  RAISE NOTICE 'hardening_24: chat_requests and chat_sessions are closed to anon/authenticated, RLS on.';
END $$;

COMMIT;

-- AFTER APPLYING, check these through the REAL REST API with the publishable key, not just
-- in SQL — the grant and the gateway are different layers:
--   * SELECT on chat_requests  -> 401/42501
--   * SELECT on chat_sessions  -> 401/42501
--   * SELECT on astrologers, app_settings, call_requests, notifications -> still 200,
--     so the apps keep working (those grants are untouched here)
--   * every backend endpoint -> still 200
--   * get_advisors(security) -> rls_disabled_in_public findings go from 2 to ZERO
--
-- And on a real pair of handsets, because this is the part no query proves:
--   * a customer sends a chat request and the astrologer's phone shows the popup
--   * the customer cancels, and the popup goes away on its own
--   * My Sessions, Session History and Missed Sessions all still list rows
--
-- ROLLBACK, if an installed build turns out to still need the read:
--   ALTER TABLE public.chat_requests DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.chat_sessions DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT ON TABLE public.chat_requests TO anon;
--   GRANT SELECT ON TABLE public.chat_sessions TO anon;
-- (anon held SELECT only; authenticated held nothing. Do not grant it anything.)
