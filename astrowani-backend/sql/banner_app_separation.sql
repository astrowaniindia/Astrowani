-- Per-app banners.
--
-- WHY: Lets the admin manage Customer-app and Vendor-app home banners separately,
-- and seeds the two previously-bundled fallback banners as real, removable rows.
-- `app` is one of: 'customer' | 'vendor' | 'both'. Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'both';

-- Seed the existing (formerly hard-coded) banners as manageable rows — only if the
-- table is currently empty, so re-running never duplicates.
INSERT INTO public.banners (title, description, image, link, sort_order, is_active, app)
SELECT * FROM (VALUES
  ('Welcome Banner', '', 'https://astrowani.onrender.com/public/images/banner1.jpeg', '', 1, true, 'both'),
  ('Astrowani Banner', '', 'https://astrowani.onrender.com/public/images/banner2.jpeg', '', 2, true, 'both')
) AS seed(title, description, image, link, sort_order, is_active, app)
WHERE NOT EXISTS (SELECT 1 FROM public.banners);
