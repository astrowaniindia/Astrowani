-- Hindi/English localization: adds Hindi text columns to tables whose content
-- is admin/vendor-entered and shown to customers. `blogs` already has this
-- pattern (title_en/content_en/title_hi/content_hi) — this migration extends
-- it to categories, banners, remedy_items, and thoughts.
-- Run in the Supabase SQL editor. See astrowani-backend/HINDI_I18N_BACKEND.md.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_hi text;

ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS title_hi text,
  ADD COLUMN IF NOT EXISTS description_hi text;

ALTER TABLE remedy_items
  ADD COLUMN IF NOT EXISTS title_hi text,
  ADD COLUMN IF NOT EXISTS description_hi text;

ALTER TABLE thoughts
  ADD COLUMN IF NOT EXISTS text_hi text,
  ADD COLUMN IF NOT EXISTS author_hi text;
