-- hardening_09_chat_messages_read.sql
--
-- Close the last read hole left open by hardening_02: `anon` could SELECT
-- public.chat_messages, including the `message` column.
--
-- WHAT WAS ACTUALLY EXPOSED (verified by probe against production, 2026-09-05, using
-- only the publishable key that ships inside both APKs):
--
--     GET /rest/v1/chat_messages?select=*&limit=1
--       -> 200, columns: id, room_id, session_id, sender_id, receiver_id,
--                        message, created_at
--     Content-Range: 0-0/86
--
-- i.e. every private consultation transcript on the platform, readable by anyone who
-- unzips the APK. 86 rows at the time of writing only because the platform has not
-- launched; this scales with every conversation the business ever hosts.
--
-- Writes were already closed — INSERT returned 42501 — and hardening_02 had already
-- locked down `customers`, `wallet_transactions` and the astrologer bank columns. This
-- file finishes that job.
--
-- WHY hardening_02 LEFT THE GRANT IN PLACE, AND WHY IT CAN GO NOW
--
-- Its comment reads "anon keeps SELECT only (both apps still read/subscribe to their
-- own chat history directly)". That was true then. It is no longer true: chat history
-- now loads through GET /api/chat/messages, which resolves the caller from their JWT
-- and refuses anyone who is not one of the two participants of that session/room.
--
--   customer  src/screens/ChatSessionScreen.js   -> GET /api/chat/messages?sessionId=
--   vendor    src/screens/VendorChatSession.js   -> GET /api/chat/messages?sessionId=
--   vendor    src/Chating/Chat.js                -> GET /api/chat/messages?roomId=
--
-- LIVE MESSAGE DELIVERY IS UNAFFECTED. Both live chat screens already receive new
-- messages over the Socket.io session room (`new_chat_message`), not over Supabase
-- Realtime — that migration happened earlier and is why this is now safe.
--
-- ⚠️ DEPLOY ORDER MATTERS FOR THIS ONE, unlike most files in this directory.
-- Running this BEFORE the backend carrying GET /api/chat/messages is deployed will
-- leave installed apps unable to load chat history (live messages keep working; the
-- backlog renders empty). Deploy the backend first, then run this. Rolling back is a
-- one-line re-GRANT, shown at the bottom.
--
-- Idempotent: REVOKE on an already-revoked privilege is a no-op.

-- ── The revoke ───────────────────────────────────────────────────────────────
-- ALL, not just SELECT: hardening_02 intended anon to have nothing but SELECT here,
-- so revoking everything and granting nothing back leaves the table with no anon
-- privileges at all, which is the intended end state.
REVOKE ALL ON public.chat_messages FROM anon;

-- `authenticated` is not used by this project (the apps carry our own Express JWT, not
-- a Supabase Auth session — see hardening_02's "why RLS cannot simply be turned on"),
-- but revoke it too so a future switch to Supabase Auth cannot silently re-open this.
REVOKE ALL ON public.chat_messages FROM authenticated;

-- The backend reads and writes this table with the SERVICE ROLE key (index.js's
-- `supabaseService`), which bypasses grants entirely, so no GRANT is needed for the
-- app to keep working.

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Fails loudly rather than leaving a security migration silently half-applied — the
-- same self-verifying tail free_call_booking_pool.sql needed after its DROP INDEX did
-- not take effect.
DO $$
DECLARE
  anon_privs int;
BEGIN
  SELECT count(*) INTO anon_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'chat_messages'
    AND grantee IN ('anon', 'authenticated');

  IF anon_privs > 0 THEN
    RAISE EXCEPTION
      'hardening_09 FAILED: anon/authenticated still hold % privilege(s) on chat_messages', anon_privs;
  END IF;

  RAISE NOTICE 'hardening_09 OK: anon and authenticated have no privileges on public.chat_messages.';
END $$;

-- Should return zero rows. If it does not, the revoke did not take.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'chat_messages'
  AND grantee IN ('anon', 'authenticated');

-- ── Rollback, if the apps in the field turn out to still need direct reads ───
-- GRANT SELECT ON public.chat_messages TO anon;
