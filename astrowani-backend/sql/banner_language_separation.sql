-- Per-language banners.
--
-- WHY: title_hi/description_hi (sql/hindi_translations.sql) only cover bilingual TEXT
-- on a single shared image — a banner is usually a graphic with the text baked into the
-- image itself, so two languages often need two different images, not just two strings.
-- `language` is one of: 'english' | 'hindi' | 'both'. Mirrors the exact `app` column
-- pattern in banner_app_separation.sql (same default, same OR-filter shape in the API).
-- Run in Supabase SQL editor. Safe to re-run — existing rows default to 'both' so nothing
-- that's already live disappears from either language.

ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'both';
