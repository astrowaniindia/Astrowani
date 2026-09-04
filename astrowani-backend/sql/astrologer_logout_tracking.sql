-- Astrologer logout tracking
--
-- WHY THIS EXISTS: `is_online` is written in exactly one place — the astrologer
-- tapping their own master Online/Offline switch. Logging out never touched it,
-- and neither does a killed app or a dead battery. So an astrologer who switched
-- themselves Online in the morning and logged out at night kept showing as Online
-- with live Chat/Call/Video buttons; every customer who tapped one waited 75
-- seconds for a request that rang nobody before it was swept to 'missed'.
--
-- A logged-out astrologer and one who manually switched all three services off are
-- otherwise INDISTINGUISHABLE — same flags, same row. They are meant to read
-- differently to the customer ("Unavailable" vs "Offline"), so the distinction has
-- to be recorded rather than inferred. Hence this column.
--
-- A timestamp rather than a boolean: "when did they last log out" answers support
-- questions that "are they logged out" cannot, and costs nothing extra. NULL means
-- logged in.
--
-- Idempotent. Additive only — nothing reads this column until the backend that
-- exposes it is deployed, so it is safe to run ahead of the code.

ALTER TABLE astrologers
  ADD COLUMN IF NOT EXISTS logged_out_at timestamptz;

COMMENT ON COLUMN astrologers.logged_out_at IS
  'Set when the astrologer logs out of the vendor app; cleared on successful OTP '
  'verification. NOT NULL means the account is signed out and cannot answer, which '
  'the customer app shows as "Unavailable". Distinct from is_online (their own '
  'Online/Offline switch) and from the three is_*_enabled service toggles.';

-- Partial index: every list query asks "who is signed out", which is the small
-- minority of rows. Indexing only the non-NULLs keeps it tiny.
CREATE INDEX IF NOT EXISTS astrologers_logged_out_idx
  ON astrologers (logged_out_at)
  WHERE logged_out_at IS NOT NULL;

-- Existing rows stay NULL (= logged in). Backfilling them as logged-out would be a
-- guess, and the wrong guess hides every astrologer from every customer at once.
-- They resolve themselves on the next login or logout.

DO $$
DECLARE
  has_col boolean;
  signed_out integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'astrologers' AND column_name = 'logged_out_at'
  ) INTO has_col;

  IF NOT has_col THEN
    RAISE EXCEPTION 'astrologers.logged_out_at was not created';
  END IF;

  SELECT count(*) INTO signed_out FROM astrologers WHERE logged_out_at IS NOT NULL;
  RAISE NOTICE 'astrologers.logged_out_at ready. Currently signed out: %', signed_out;
END $$;

SELECT indexname FROM pg_indexes
WHERE tablename = 'astrologers' AND indexname = 'astrologers_logged_out_idx';
