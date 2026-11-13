-- hardening_25 — close the public reads of `notifications` and `call_requests`.
--
-- ============================ APPLY AFTER THE OTA ============================
-- Written 2026-11-13. Apply only once both apps' OTA carrying the 2026-11-13 changes
-- has reached phones (a few days). Applying it early does not crash anything, but on a
-- build that has not updated yet:
--   * notifications: the bell badge reads 0 and the notifications list is empty, until
--     that phone takes the update (both read the table directly on those builds);
--   * call_requests: the FREE INSTANT CALL loses its backup for hearing that the
--     astrologer picked up, and relies on the socket alone. Every other call path has
--     polled the server since 2026-09-30 and is unaffected.
-- Rollback is at the bottom and takes seconds.
--
-- Same check as hardening_24 before applying: Supabase edge logs grouped by
-- log_attributes['request.sb.jwt.apikey.payload.role'] for these two tables. Read it
-- BY ROLE — service_role traffic is our backend and is unaffected by this file.
-- ==========================================================================
--
-- WHAT IS BEING CLOSED (measured 2026-11-13 with the publishable key that ships in
-- both APKs):
--   * notifications — 25,503 rows readable by anyone: support replies, order updates,
--     "your astrologer is free" pushes, each with the customer_id or astrologer_id it
--     belongs to.
--   * call_requests — 3,442 rows: customer_name, which customer rang which astrologer,
--     when, the outcome, room_token and session_id.
-- Neither has any write exposure: anon's UPDATE grants went in hardening_13/17, and
-- authenticated holds nothing since hardening_15.
--
-- WHY THIS IS SAFE FOR OUR OWN CODE. The backend runs on the service role, which
-- bypasses grants and RLS. After the 2026-11-13 app changes neither app reads
-- `notifications` directly (list + badge go through /api/notifications/list,
-- /api/notifications/unread-count, /api/vendor/notifications/list and
-- /api/vendor/notifications/unread-count). The customer app still opens Realtime
-- subscriptions on call_requests as a third, redundant acceptance path; with the grant
-- gone they join and simply never receive an event, which is harmless — the socket and
-- the server poll (utils/awaitRequestOutcome.js, now on all seven call entry points)
-- carry the outcome.
--
-- RLS ON WITH NO POLICY = deny everyone except the service role. That is the intended
-- posture. Do NOT add a permissive policy to quiet the rls_enabled_no_policy lint.

BEGIN;

REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.call_requests FROM anon, authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_requests ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  leftover_grants int;
  leftover_cols int;
  rls_off int;
BEGIN
  SELECT count(*) INTO leftover_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('notifications', 'call_requests')
    AND grantee IN ('anon', 'authenticated');
  IF leftover_grants <> 0 THEN
    RAISE EXCEPTION 'hardening_25: % table grant(s) still held by anon/authenticated', leftover_grants;
  END IF;

  -- Column-level grants survive a table-level REVOKE ALL in some states; check them too.
  SELECT count(*) INTO leftover_cols
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name IN ('notifications', 'call_requests')
    AND grantee IN ('anon', 'authenticated');
  IF leftover_cols <> 0 THEN
    RAISE EXCEPTION 'hardening_25: % column grant(s) still held by anon/authenticated', leftover_cols;
  END IF;

  SELECT count(*) INTO rls_off
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('notifications', 'call_requests')
    AND c.relrowsecurity = false;
  IF rls_off <> 0 THEN
    RAISE EXCEPTION 'hardening_25: RLS still disabled on % of the two tables', rls_off;
  END IF;

  RAISE NOTICE 'hardening_25: notifications and call_requests are closed to anon/authenticated, RLS on.';
END $$;

COMMIT;

-- AFTER APPLYING, check through the REAL REST API with the publishable key:
--   * SELECT on notifications, call_requests -> 401/42501
--   * SELECT on astrologers, app_settings -> still 200
--   * the app's bell badge and notifications list still populate (customer + astrologer)
--   * a free instant call still connects when the astrologer accepts
--
-- ROLLBACK:
--   ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.call_requests DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT ON TABLE public.notifications TO anon;
--   GRANT SELECT ON TABLE public.call_requests TO anon;
-- (anon held SELECT only on these after hardening_13/17; do not grant authenticated.)
