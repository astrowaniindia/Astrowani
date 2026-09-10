-- hardening_10 — revoke the public key's UPDATE on chat_sessions.
--
-- WHY: measured 2026-09-11, the public (anon) key — shipped inside both APKs —
-- could still UPDATE chat_sessions.is_active and chat_sessions.ended_at on ANY row.
-- There is no row ownership check (the apps authenticate with our own JWT, not
-- Supabase Auth, so no RLS policy can express "your own session"). That let anyone
-- holding the key:
--   * end any live consultation mid-call (is_active = false), or
--   * re-activate an ended one with next_billing_at still NULL — the documented
--     "zombie session" that busyStatus.js counts as busy while sessionManager never
--     bills it, locking that astrologer out of all work indefinitely.
--
-- SAFE TO APPLY: neither app writes chat_sessions any more. Verified by a full scan
-- of both apps' direct Supabase calls — chat_sessions is only SELECTed and
-- subscribed to (realtime), and both of those need SELECT, which this leaves alone.
-- Session creation, activation and termination all go through the backend, which
-- uses the service-role key and is unaffected.
--
-- Idempotent. Run in the Supabase SQL editor.

REVOKE UPDATE ON public.chat_sessions FROM anon;
REVOKE UPDATE ON public.chat_sessions FROM authenticated;

-- Column-level grants survive a table-level REVOKE in some configurations, so revoke
-- the two known columns explicitly as well.
REVOKE UPDATE (is_active, ended_at) ON public.chat_sessions FROM anon;
REVOKE UPDATE (is_active, ended_at) ON public.chat_sessions FROM authenticated;

-- ── Self-verifying tail ─────────────────────────────────────────────────────
-- A revoke that silently did not take effect reads as "done" and leaves the hole
-- open. Raise instead.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.chat_sessions', 'UPDATE') THEN
    RAISE EXCEPTION 'anon still has table-level UPDATE on chat_sessions';
  END IF;
  IF has_column_privilege('anon', 'public.chat_sessions', 'is_active', 'UPDATE')
     OR has_column_privilege('anon', 'public.chat_sessions', 'ended_at', 'UPDATE') THEN
    RAISE EXCEPTION 'anon still has column-level UPDATE on chat_sessions';
  END IF;
  -- The apps still need to READ sessions (history screens, realtime). Make sure
  -- this file did not take that away by accident.
  IF NOT has_table_privilege('anon', 'public.chat_sessions', 'SELECT') THEN
    RAISE EXCEPTION 'anon lost SELECT on chat_sessions — the apps need it; re-GRANT SELECT';
  END IF;
  RAISE NOTICE 'hardening_10 OK: anon cannot UPDATE chat_sessions; SELECT kept';
END $$;

-- ROLLBACK (only if an app write turns out to need it):
--   GRANT UPDATE (is_active, ended_at) ON public.chat_sessions TO anon;
