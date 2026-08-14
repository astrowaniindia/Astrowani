-- Remedies shop — the 4 top-level category cards (Puja / Gemstones / Specific Puja /
-- Life Reports) shown on the Remedies landing screen (astrowani_customer-main's
-- Remedies.js). These were previously hardcoded in the app (title/description/image
-- baked into a local JS array with bundled images) — this table makes them
-- admin-editable via astrowani-admin's Remedies page, the same way remedy_items
-- (the individual items *inside* each category) already are.
--
-- image left NULL in the seed on purpose: the customer app falls back to its bundled
-- local images when a category's image is unset, same "silent fallback" pattern as
-- PlacementBanner's fallbackImages — nothing breaks visually until an admin uploads one.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & Run. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.remedy_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL UNIQUE CHECK (type IN ('puja','gemstone','specific_puja','life_report')),
  title           text NOT NULL,
  title_hi        text,
  description     text,
  description_hi  text,
  image           text,                     -- URL or base64 data-URI; NULL = use bundled fallback
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.remedy_categories (type, title, description, sort_order) VALUES
  ('puja', 'Puja', 'Join shared rituals by renowned Purohits and Pandits for blessings and positivity.', 1),
  ('gemstone', 'Gemstones', 'Buy certified gemstones to balance energies and support your astrological goals.', 2),
  ('specific_puja', 'Specific Puja', 'Book a dedicated puja performed specifically for you.', 3),
  ('life_report', 'Life Reports', 'One-time detailed reports on your career, marriage, health, or finances.', 4)
ON CONFLICT (type) DO NOTHING;

-- ── Realtime: not subscribed to from the app (this table changes rarely — the
-- customer screen just refetches on focus), but added for parity with every other
-- admin-authored content table in this codebase.
ALTER TABLE public.remedy_categories REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'remedy_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.remedy_categories;
  END IF;
END
$$;

-- ── RLS: public read (anon-key reads); writes via service role ──────────────────
ALTER TABLE public.remedy_categories ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='remedy_categories' AND policyname='public read remedy_categories') THEN
    CREATE POLICY "public read remedy_categories" ON public.remedy_categories FOR SELECT USING (true);
  END IF;
END
$$;
