-- hardening_11 — revoke the public key's UPDATE on astrologers.fcm_token.
--
-- WHY: measured 2026-09-11, the public (anon) key — shipped inside both APKs — could
-- UPDATE astrologers.fcm_token on ANY row. fcm_token is where incoming-call pushes are
-- sent, so anyone holding the key could point another astrologer's rings at their own
-- device (or blank it, so the astrologer silently stops being rung).
--
-- ⚠ DO NOT APPLY YET. Installed vendor builds from before 2026-09-11 still write this
-- column directly (utils/Firebase.js syncTokenWithBackend). Revoking now makes their
-- token refreshes fail silently, so astrologers on old builds would keep a stale token
-- and stop being rung after FCM rotates it. Apply only once:
--   1. the backend carrying POST /api/vendor/fcm-token is deployed (it is), and
--   2. the vendor OTA that switched to it has been picked up — i.e. the app has been
--      opened at least twice since (hot-updater applies a bundle on the NEXT launch).
--   Login also sets the token server-side, so the residual risk after applying is only a
--   missed refresh on a build that has not updated for a long time.
--
-- Column-scoped on purpose: the vendor app still writes is_available / is_online /
-- the service toggles directly, so a table-level REVOKE would break going online.
--
-- Idempotent. Run in the Supabase SQL editor.

REVOKE UPDATE (fcm_token) ON public.astrologers FROM anon;
REVOKE UPDATE (fcm_token) ON public.astrologers FROM authenticated;

-- ── Self-verifying tail ─────────────────────────────────────────────────────
-- A column REVOKE is a no-op if anon holds TABLE-level UPDATE on astrologers
-- (a table grant covers every column). That would read as "done" while leaving the
-- hole open, so raise instead — the fix then is to replace the table grant with
-- column grants for exactly the columns the vendor app writes.
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.astrologers', 'fcm_token', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can STILL update astrologers.fcm_token — it probably holds table-level UPDATE; see the note above';
  END IF;
  -- The vendor app's go-online toggle must keep working.
  IF NOT has_column_privilege('anon', 'public.astrologers', 'is_available', 'UPDATE') THEN
    RAISE NOTICE 'note: anon has no UPDATE on astrologers.is_available — expected only if that write has also moved server-side';
  END IF;
  RAISE NOTICE 'hardening_11 OK: anon cannot UPDATE astrologers.fcm_token';
END $$;

-- ROLLBACK (only if an app write turns out to need it):
--   GRANT UPDATE (fcm_token) ON public.astrologers TO anon;
