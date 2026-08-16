-- Hindi meta description for blogs (2026-08-16)
--
-- blogs already had title_hi/content_hi. Two more customer-facing text fields
-- had no Hindi column at all, so even a fully Hindi-translated blog post still
-- showed English text in these spots:
--   - meta_description: the excerpt line under the title on Home's blog cards.
--     BlogScreen.js's detail view already read `hindi.metaDescription` — the
--     frontend was ahead of the schema, just nothing to read.
--   - excerpt: the excerpt line on the "View All" blog list (BlogList.js),
--     which already read `hindi.excerpt` — same situation.
-- Same admin-fills-it-in pattern as title_hi/content_hi.
--
-- Idempotent — safe to re-run.

ALTER TABLE blogs ADD COLUMN IF NOT EXISTS meta_description_hi text;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS excerpt_hi text;

-- Verify:
-- SELECT title, title_hi, meta_description, meta_description_hi, excerpt, excerpt_hi
--   FROM blogs ORDER BY created_at DESC LIMIT 5;
