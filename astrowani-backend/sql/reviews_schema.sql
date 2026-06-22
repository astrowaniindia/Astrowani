-- Astrologer Reviews & Ratings schema.
--
-- WHY: Replaces the fully-mocked review endpoints (hardcoded 4.8 / 120 reviews /
-- "Demo User") with real, persisted reviews. One editable review per customer per
-- astrologer, gated to customers who completed a session. The astrologer's average
-- rating + review count are cached on the astrologers row (recomputed by the backend
-- on every write) so list endpoints stay fast. Run in Supabase SQL editor. Safe to re-run.

-- ── Reviews ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id  uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  rating         int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  is_hidden      boolean NOT NULL DEFAULT false,  -- admin moderation (excluded from app + average)
  admin_note     text,                            -- internal admin note
  admin_reply    text,                            -- public reply shown under the review
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One editable review per (astrologer, customer); re-submission upserts on this.
  UNIQUE (astrologer_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_astrologer ON public.reviews (astrologer_id);

-- ── Cached aggregates on the astrologer (maintained by the backend) ─────────────
ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS average_rating numeric NOT NULL DEFAULT 0;
ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS total_reviews  int     NOT NULL DEFAULT 0;

-- ── Realtime: admin Reviews page + profiles refresh on any change ───────────────
ALTER TABLE public.reviews REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
  END IF;
END
$$;

-- ── RLS: public read of non-hidden reviews (anon-key reads); writes via service role ──
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='public read reviews') THEN
    CREATE POLICY "public read reviews" ON public.reviews FOR SELECT USING (is_hidden = false);
  END IF;
END
$$;
