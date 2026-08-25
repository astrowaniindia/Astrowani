-- remedy_items.subcategory — the merchandising group a product belongs to.
--
-- Added 2026-08-25 with the Vastu Remedies catalogue.
--
-- WHY A COLUMN RATHER THAN INFERENCE. The shop's category tiles first guessed the group
-- from the product title, the same trick PURPOSE_BY_STONE uses for the gemstone purpose
-- tiles. Measured against 414 real products that guess was right 75% of the time: 17% were
-- filed under the wrong tile and 8% under none. A "Tibetan Om Bell" reads as Vastu Enhancer
-- to a regular expression and is actually Feng Shui. One product in four in the wrong drawer
-- is not a shop, so the group is now stored per product and the inference is only a fallback
-- for rows that have not been given one.
--
-- Deliberately free text rather than an enum: the groups are a merchandising decision that
-- will change, and a CHECK constraint would mean a migration every time somebody wants a new
-- shelf. The admin dropdown is what keeps the values tidy.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.remedy_items
  ADD COLUMN IF NOT EXISTS subcategory text;

-- Only selective for the vastu catalogue, which is the one that filters by it, so the index
-- is partial and stays small.
CREATE INDEX IF NOT EXISTS idx_remedy_items_vastu_subcategory
  ON public.remedy_items (subcategory)
  WHERE type = 'vastu';

DO $$
DECLARE n_total bigint; n_tagged bigint;
BEGIN
  SELECT count(*), count(subcategory) INTO n_total, n_tagged
    FROM public.remedy_items WHERE type = 'vastu';
  RAISE NOTICE 'vastu items: %, of which grouped: %', n_total, n_tagged;
END $$;
