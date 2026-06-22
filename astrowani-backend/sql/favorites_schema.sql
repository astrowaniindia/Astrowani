-- Favorite Astrologers schema.
--
-- WHY: Makes the customer "My Favorites" real (was a mock endpoint returning []).
-- A customer taps the heart on an astrologer profile → a row here; the My Favorites
-- list reads it and live-updates via realtime. Run in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.favorites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  astrologer_id uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_customer ON public.favorites (customer_id);

-- ── Realtime: My Favorites list refreshes when a row is added/removed ───────────
ALTER TABLE public.favorites REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'favorites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.favorites;
  END IF;
END
$$;

-- ── RLS: public read (anon-key reads); writes via service role ──────────────────
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='favorites' AND policyname='public read favorites') THEN
    CREATE POLICY "public read favorites" ON public.favorites FOR SELECT USING (true);
  END IF;
END
$$;
