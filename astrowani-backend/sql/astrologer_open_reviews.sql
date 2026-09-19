-- Per-astrologer admin switch: allow reviews from customers who have NOT yet had a
-- paid session with this astrologer. Default false = the normal rule (a completed
-- paid session OR a completed free 12-minute call is required).
-- Idempotent. Set from admin -> Astrologers -> Edit -> "Reviews".
ALTER TABLE astrologers
  ADD COLUMN IF NOT EXISTS allow_reviews_without_session boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'astrologers' AND column_name = 'allow_reviews_without_session'
  ) THEN
    RAISE EXCEPTION 'astrologers.allow_reviews_without_session is missing';
  END IF;
END $$;
