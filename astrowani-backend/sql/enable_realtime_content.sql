-- Enable Supabase Realtime for the admin-authored content tables.
--
-- WHY: The customer app subscribes to `postgres_changes` on `public.blogs` (and
-- optionally banners / thoughts / categories) so that when the admin publishes or
-- edits content in the dashboard, the customer Home / BlogList screens refresh
-- near-instantly. Without the tables in the `supabase_realtime` publication those
-- subscriptions silently receive nothing (focus-refresh still works as a fallback).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & Run.
-- (DDL on a publication — cannot be applied via the JS client / service-role key.)
-- Safe to re-run: each DO block checks membership first.

ALTER TABLE public.blogs      REPLICA IDENTITY FULL;
ALTER TABLE public.banners    REPLICA IDENTITY FULL;
ALTER TABLE public.thoughts   REPLICA IDENTITY FULL;
ALTER TABLE public.categories REPLICA IDENTITY FULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['blogs', 'banners', 'thoughts', 'categories'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
