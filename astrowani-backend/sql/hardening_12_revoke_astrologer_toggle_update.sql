-- hardening_12 — revoke the public key's UPDATE on the astrologer availability toggles.
--
-- WHY: measured 2026-09-11, the public (anon) key — shipped inside both APKs — could
-- UPDATE is_online / is_available / is_chat_enabled / is_call_enabled /
-- is_video_call_enabled on ANY astrologer. Anyone holding the key could take every
-- astrologer offline (a marketplace-wide outage for the cost of one request), or switch
-- a suspended astrologer back on. The vendor app now goes through
-- POST /api/vendor/availability, which takes the astrologer from our JWT.
--
-- ⚠ DO NOT APPLY YET. Installed vendor builds from before 2026-09-11 still write these
-- columns directly (HomeScreen.js updateToggleStatus / toggleLiveStatus). Revoking now
-- makes their online switch fail: with the new build the switch flips back and says so,
-- but OLD builds show the switch as changed while nothing happened. Apply once the vendor
-- OTA carrying the change has been picked up (the app opened at least twice since —
-- hot-updater applies on the next launch). Apply together with, or after, hardening_11.
--
-- Idempotent. Run in the Supabase SQL editor.

REVOKE UPDATE (is_online, is_available, is_chat_enabled, is_call_enabled, is_video_call_enabled)
  ON public.astrologers FROM anon;
REVOKE UPDATE (is_online, is_available, is_chat_enabled, is_call_enabled, is_video_call_enabled)
  ON public.astrologers FROM authenticated;

-- ── Self-verifying tail ─────────────────────────────────────────────────────
-- Raises if any of the five is still writable (e.g. through a table-level grant, which a
-- column REVOKE cannot remove), and lists every OTHER astrologers column anon can still
-- update, so what remains is visible rather than assumed.
DO $$
DECLARE
  col text;
  still text := '';
BEGIN
  FOREACH col IN ARRAY ARRAY['is_online','is_available','is_chat_enabled','is_call_enabled','is_video_call_enabled'] LOOP
    IF has_column_privilege('anon', 'public.astrologers', col, 'UPDATE') THEN
      RAISE EXCEPTION 'anon can STILL update astrologers.% — probably a table-level UPDATE grant', col;
    END IF;
  END LOOP;
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'astrologers'
  LOOP
    IF has_column_privilege('anon', 'public.astrologers', col, 'UPDATE') THEN
      still := still || col || ' ';
    END IF;
  END LOOP;
  IF still <> '' THEN
    RAISE NOTICE 'hardening_12 OK for the toggles; anon can still UPDATE astrologers: %', still;
  ELSE
    RAISE NOTICE 'hardening_12 OK: anon can no longer UPDATE any astrologers column';
  END IF;
END $$;

-- ROLLBACK (only if an app write turns out to need it):
--   GRANT UPDATE (is_online, is_available, is_chat_enabled, is_call_enabled, is_video_call_enabled)
--     ON public.astrologers TO anon;
