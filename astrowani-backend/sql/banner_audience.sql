-- Banners can target where a customer is in their journey.
--
-- WHY: the free 5-minute chat is now offered by TAPPING a Home banner rather than
-- by a popup that opens itself. That means the Home banners have two jobs: before
-- the customer has used the free chat they advertise it, and afterwards they should
-- advertise something else entirely (chat / call with a real astrologer). Rather
-- than hardcoding "swap this banner once the free chat is used", the admin marks
-- each banner with who it is for, exactly like the existing app / language columns.
--
--   all       shown to everyone (the default, so every existing banner is unchanged)
--   new       only while the customer can still claim the free chat
--   returning only once they no longer can
--
-- The app decides which of the two a viewer is and filters client-side; the
-- /api/banners/all response is shared and cached across customers, so audience is
-- returned as data rather than filtered server-side.
--
-- Idempotent.

ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'banners_audience_check'
  ) THEN
    -- Only added if nothing already violates it, so a stray value can never make
    -- the migration fail halfway.
    IF EXISTS (SELECT 1 FROM public.banners WHERE audience NOT IN ('all','new','returning')) THEN
      RAISE NOTICE 'banners.audience has rows outside (all,new,returning) — CHECK not added.';
    ELSE
      ALTER TABLE public.banners
        ADD CONSTRAINT banners_audience_check CHECK (audience IN ('all','new','returning'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='banners' AND column_name='audience')
  THEN RAISE EXCEPTION 'banner_audience.sql did not apply: banners.audience is missing'; END IF;
  RAISE NOTICE 'banner_audience.sql applied.';
END $$;

SELECT audience, count(*) FROM public.banners GROUP BY audience ORDER BY audience;
