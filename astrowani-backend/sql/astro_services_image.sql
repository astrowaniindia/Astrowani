-- Adds an admin-editable image to each Astro Report card (Kundli Report, Kundli Matching, etc.)
-- so the customer app no longer relies on a hardcoded client-side icon-per-category mapping.
ALTER TABLE public.astro_services ADD COLUMN IF NOT EXISTS image text;
