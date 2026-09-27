-- A banner can carry a second image for Hindi customers.
--
-- WHY: banner artwork has its wording baked into the picture, so an English
-- banner still reads as English after the customer switches the app to Hindi.
-- The Title/Description (Hindi) fields already on this table do not help — they
-- are not what the customer sees on a banner, the image is.
--
-- This is the SAME pattern as title_hi / description_hi, and resolves the same
-- way: image_hi when it is there, otherwise image. So an admin who uploads only
-- one banner has changed nothing — every customer keeps seeing it, in either
-- language — and an admin who uploads both gets the right one per customer.
--
-- NOT the existing `language` column, which is a different thing and stays as
-- it is: that HIDES a banner from customers on the other language (tag one
-- 'english' and a Hindi customer sees no banner at all). This column never
-- hides anything. As of 2026-09-27 every banner in production is language
-- 'both', i.e. nobody has ever used that targeting.
--
-- Resolution happens server-side in GET /api/banners/all, whose response is
-- already cached per (app, language, placement) — so `imageUrl` in the payload
-- is the correct image for the language that was asked for, and apps already in
-- the field pick this up with no update.
--
-- Deploy order does not matter: without this column the backend reads
-- b.image_hi as undefined and falls through to b.image, which is exactly
-- today's behaviour.
--
-- Idempotent.

ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS image_hi text;

COMMENT ON COLUMN public.banners.image_hi IS
  'Optional Hindi artwork for this banner. Blank means Hindi customers see `image`.';

-- Self-verifying tail: a half-applied migration here fails silently (the admin
-- would just never be able to save a Hindi image), so say so loudly instead.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'banners' AND column_name = 'image_hi'
  ) THEN
    RAISE EXCEPTION 'banners.image_hi was not created';
  END IF;
  RAISE NOTICE 'banners.image_hi is present.';
END $$;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'banners' AND column_name IN ('image', 'image_hi')
ORDER BY column_name;
