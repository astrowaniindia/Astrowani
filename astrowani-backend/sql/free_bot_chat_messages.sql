-- free_bot_chat_messages — transcript of the free 5-minute welcome chat.
--
-- WHY THIS TABLE EXISTS
--   The free bot chat (customer FreeBotChatScreen.js) never persisted anything: its
--   messages lived in component state and died with the screen. Real consultations
--   are in `chat_messages`, keyed by two real participant uuids — the bot has no
--   astrologer row, so it cannot go there without inventing a fake astrologer id and
--   polluting the vendor-side chat-threads queries that read that table.
--
-- IDEMPOTENT WRITES
--   The app re-posts the whole accumulated transcript after each message rather than
--   one append per message, so a dropped request self-heals on the next one. That
--   only works because (customer_id, client_id) is UNIQUE and the insert ignores
--   duplicates. `client_id` is `<chat_id>:<local message id>`, NOT the bare local id:
--   local ids restart at 1 for every chat, so a customer granted a second free chat
--   (admin reset) would otherwise have its messages swallowed as duplicates of the
--   first chat's.
--
-- RETENTION
--   Deliberately NOT purged on account deletion, matching the owner's 2026-09-25
--   decision for `chat_messages` (chats are kept; the profile/personal-data purge
--   does not touch them). The customer_id simply stops resolving to a live row.
--
-- ACCESS
--   Service role only: RLS on with no policies, and no grants to anon/authenticated.
--   Every read and write goes through the backend (POST /api/free-bot-chat/messages,
--   GET /api/customer/free-chat-thread).

CREATE TABLE IF NOT EXISTS public.free_bot_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  chat_id     text NOT NULL,
  client_id   text NOT NULL,
  sender      text NOT NULL CHECK (sender IN ('customer', 'bot')),
  message     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The idempotency key the re-post strategy above depends on.
CREATE UNIQUE INDEX IF NOT EXISTS free_bot_chat_messages_client_uniq
  ON public.free_bot_chat_messages (customer_id, client_id);

-- The read path: one customer's transcript in order.
CREATE INDEX IF NOT EXISTS free_bot_chat_messages_customer_created
  ON public.free_bot_chat_messages (customer_id, created_at);

ALTER TABLE public.free_bot_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS on with zero policies means deny-everyone, which is the intended posture for a
-- service-role-only table (see CLAUDE.md: the 31 rls_enabled_no_policy INFO lints are
-- correct, not a to-do). These REVOKEs are belt-and-braces against the Supabase
-- project template's default privileges, which still auto-grant to anon AND
-- authenticated for tables created by supabase_admin.
REVOKE ALL ON public.free_bot_chat_messages FROM anon;
REVOKE ALL ON public.free_bot_chat_messages FROM authenticated;

-- Self-verifying tail: fail loudly rather than leaving a half-applied migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'free_bot_chat_messages_client_uniq'
  ) THEN
    RAISE EXCEPTION 'free_bot_chat_messages_client_uniq missing — idempotent re-posts would duplicate rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'free_bot_chat_messages'
       AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'free_bot_chat_messages is still reachable by anon/authenticated';
  END IF;
END $$;
