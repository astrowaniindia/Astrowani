-- hardening_13 — revoke the public key's UPDATE on request statuses and notification
-- read flags.
--
-- WHY: measured 2026-09-11, the public (anon) key — shipped inside both APKs — could
-- UPDATE call_requests.status, chat_requests.status and notifications.is_read on ANY
-- row. That let anyone holding the key cancel other customers' pending consultations,
-- or flip a pending request to 'accepted'/'rejected' and confuse both apps.
--
-- The apps now go through the backend:
--   POST /api/requests/:kind/:id/status   (customer, own pending request only)
--   POST /api/notifications/read          (customer or astrologer, own rows only)
--
-- ⚠ DO NOT APPLY YET. Installed builds from before 2026-09-11 still write these directly.
-- Harm if applied early:
--   * request statuses: an old customer build's cancel stops updating the row. The socket
--     cancel_call still dismisses the astrologer's popup, and the backend's 75s sweep
--     marks the row missed, so the damage is a wrong 'missed' instead of 'cancelled'.
--   * notifications: old builds' "mark read" silently stops sticking (badge comes back).
-- Apply once BOTH apps' OTAs carrying the change have been picked up (each app opened at
-- least twice since — hot-updater applies on the next launch).
--
-- Only UPDATE is revoked. The apps still READ these tables (SELECT + Realtime), which
-- this file leaves alone and verifies it did not take away.
--
-- Idempotent. Run in the Supabase SQL editor.

REVOKE UPDATE (status) ON public.call_requests FROM anon, authenticated;
REVOKE UPDATE (status) ON public.chat_requests FROM anon, authenticated;
REVOKE UPDATE (is_read) ON public.notifications FROM anon, authenticated;

-- ── Self-verifying tail ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.call_requests', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can STILL update call_requests.status — probably a table-level UPDATE grant';
  END IF;
  IF has_column_privilege('anon', 'public.chat_requests', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can STILL update chat_requests.status — probably a table-level UPDATE grant';
  END IF;
  IF has_column_privilege('anon', 'public.notifications', 'is_read', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can STILL update notifications.is_read — probably a table-level UPDATE grant';
  END IF;
  -- Reads must survive: history screens, badges and Realtime all depend on SELECT.
  IF NOT has_table_privilege('anon', 'public.call_requests', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.chat_requests', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.notifications', 'SELECT') THEN
    RAISE NOTICE 'note: anon lacks SELECT on one of these tables — check it was not removed by accident';
  END IF;
  RAISE NOTICE 'hardening_13 OK: anon cannot UPDATE request statuses or notification read flags';
END $$;

-- ROLLBACK (only if an app write turns out to need it):
--   GRANT UPDATE (status) ON public.call_requests TO anon;
--   GRANT UPDATE (status) ON public.chat_requests TO anon;
--   GRANT UPDATE (is_read) ON public.notifications TO anon;
