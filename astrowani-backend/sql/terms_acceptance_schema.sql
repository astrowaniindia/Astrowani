-- Terms & Conditions acceptance record (2026-08-16)
--
-- Both sign-up screens now require a ticked checkbox before the account can be
-- created, but a checkbox that only gates a button proves nothing after the
-- fact. These columns are what makes the acceptance evidence: they are written
-- by the BACKEND at the moment the account row is inserted, never from a
-- client-supplied field, so they cannot be back-dated or forged by a modified
-- app.
--
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS terms_version text;
-- Which surface the acceptance came from. 'signup_form' = the explicit checkbox
-- on the Register screen. 'login_notice' = an account created straight from the
-- Login screen, which carries the "By signing up, you agree to our Terms…"
-- notice rather than a checkbox. Recorded separately because the two are NOT
-- equivalent evidence and a future audit should be able to tell them apart.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS terms_accepted_source text;

-- ---------------------------------------------------------------------------
-- astrologers
-- ---------------------------------------------------------------------------
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS terms_accepted_source text;

-- ---------------------------------------------------------------------------
-- Existing accounts
-- ---------------------------------------------------------------------------
-- Deliberately NOT backfilled. Every row created before this deploy has a NULL
-- terms_accepted_at, which is the truthful state: those users were never shown
-- a checkbox, so claiming a timestamp for them would be manufacturing evidence.
-- NULL means "no recorded acceptance", and that is the correct answer for them.
--
-- If the business needs existing users to accept the current terms, that is a
-- re-consent prompt on next launch, not an UPDATE statement here.

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name IN ('customers','astrologers')
--    AND column_name LIKE 'terms_%'
--  ORDER BY table_name, column_name;
