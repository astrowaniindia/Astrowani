-- Enable Supabase Realtime for the `astrologers` table.
--
-- WHY: The customer app (Home / Chat / Video / Call list screens) subscribes to
-- `postgres_changes` on `public.astrologers` so that when a vendor flips a service
-- toggle (is_chat_enabled / is_call_enabled / is_video_call_enabled), goes live
-- (is_available), or changes charges, the customer lists refresh near-instantly.
-- Without the table in the `supabase_realtime` publication, those subscriptions
-- silently receive nothing (focus-refresh still works as a fallback).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & Run.
-- (This cannot be applied via the JS client / service-role key — it is DDL on a
--  publication and must run on the Postgres connection.)
--
-- Safe to re-run: the DO block checks membership first.

-- Ensure UPDATE payloads include the full new row (needed so the client can read
-- the changed toggle/charge values). 'full' is recommended for tables you filter on.
ALTER TABLE public.astrologers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'astrologers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.astrologers;
  END IF;
END
$$;

-- Verify:
--   SELECT schemaname, tablename
--   FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'astrologers';
