-- astrowani-backend/sql/acquisition_source.sql
--
-- Where each customer came from, captured once at signup.
--
-- WHY THIS EXISTS: offline QR posters (Haridwar / Rishikesh, 2026-09) need per-poster
-- attribution. Each poster's QR points at a Play Store link carrying its own
-- `referrer=utm_source=qr_<place>`; Android hands that same string back to the app via
-- the Play Install Referrer API on first run, and the app sends it along with the
-- signup that follows. These two columns are where it lands.
--
-- THE NAMING RULE THAT KEEPS THE CHANNELS APART, and the whole reason this works:
--   every QR poster's utm_source MUST start with `qr_`.
-- Google Ads sets its own utm_source (google-play / a gclid-bearing string) and organic
-- Play browsing sets `utm_source=google-play&utm_medium=organic`. Neither can ever
-- collide with a `qr_` prefix, so "QR customers" is a prefix match and never needs a
-- second column to disambiguate it from paid or organic. Do NOT name a QR source
-- without that prefix — the admin QR page finds them by prefix and nothing else.
--
-- Both columns are nullable and stay null forever for:
--   - every customer who signed up before this shipped (not backfillable — Play does
--     not retain a referrer we never asked for),
--   - every iOS customer (no Play Install Referrer equivalent exists without a paid
--     attribution SDK), and
--   - sideloaded / APK-direct installs.
-- Null therefore means "unknown", NOT "organic". The admin page says so; do not write
-- a query that treats them as the same thing.
--
-- Idempotent. Safe to re-run.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
-- acquisition_source: the parsed utm_source alone (e.g. 'qr_har_ki_pauri'). This is
--   what everything groups by.
-- acquisition_raw: the untouched referrer string Play returned. Kept because the
--   parsed source alone cannot tell you the medium or campaign, and because when an
--   attribution looks wrong this is the only evidence of what actually arrived.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS acquisition_source text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS acquisition_raw text;

-- ── 2. Index ─────────────────────────────────────────────────────────────────
-- The admin QR routes scan by source and by prefix. Partial, because the column is
-- null for the large majority of rows (every pre-2026-09 customer and every iOS one)
-- and those rows are never selected by source.
CREATE INDEX IF NOT EXISTS customers_acquisition_source_idx
  ON customers (acquisition_source)
  WHERE acquisition_source IS NOT NULL;

-- ── 3. Verify ────────────────────────────────────────────────────────────────
-- A half-applied migration here fails SILENTLY: the backend's insert path drops the
-- columns and carries on (isMissingColumnError in index.js), so signups keep working
-- and every QR would read zero forever with nothing to indicate why. Raise instead.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'acquisition_source'
  ) THEN
    RAISE EXCEPTION 'customers.acquisition_source was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'acquisition_raw'
  ) THEN
    RAISE EXCEPTION 'customers.acquisition_raw was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'customers_acquisition_source_idx'
  ) THEN
    RAISE EXCEPTION 'customers_acquisition_source_idx was not created';
  END IF;

  RAISE NOTICE 'acquisition_source: columns + index present.';
END $$;

-- What is actually there now.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
  AND column_name IN ('acquisition_source', 'acquisition_raw');
