-- Astrologer badges (Verified / Celebrity / Top Rated).
--
-- WHY: Admin-only recognition badges shown on astrologer cards in the customer app
-- (see CLAUDE.md "Astrologer Badges" subsystem). Admin-set only — astrologers cannot
-- set this themselves, there is no vendor-app write path to this column.
-- Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS badge text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'astrologers_badge_check'
  ) THEN
    ALTER TABLE public.astrologers
      ADD CONSTRAINT astrologers_badge_check
      CHECK (badge IS NULL OR badge IN ('verified', 'celebrity', 'top_rated'));
  END IF;
END
$$;
