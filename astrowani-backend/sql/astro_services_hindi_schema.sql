-- Hindi name/description for the paid Astro Reports catalog (2026-08-16)
--
-- The "ज्योतिष रिपोर्ट" section on Home showed card titles like "Tarot
-- Reading" and "PDF Astrology Report" in English even with the Hindi toggle
-- on — astro_services had no Hindi columns at all, so there was nothing to
-- select. Same pattern as categories.name_hi / blogs.title_hi: admin fills
-- these in from astrowani-admin's Astro Services page; the app falls back to
-- the English name/description until an admin does.
--
-- Idempotent — safe to re-run.

ALTER TABLE astro_services ADD COLUMN IF NOT EXISTS name_hi text;
ALTER TABLE astro_services ADD COLUMN IF NOT EXISTS description_hi text;

-- Verify:
-- SELECT key, name, name_hi, description, description_hi FROM astro_services ORDER BY sort_order;
