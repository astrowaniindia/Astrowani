-- remedy_items.channel — which storefront a product belongs to.
--
-- Added 2026-08-25. There are two shops and they are NOT the same shop:
--
--   'app'   the Remedies row on the customer app's Home screen. Four fixed categories
--           (puja, gemstone, specific_puja, life_report) rendered by RemedyShop.js.
--   'shop'  Wani Shop, the web storefront at shop.astrowani.com.
--   'both'  visible in both. What every existing row is, because that is what they have
--           actually been doing until now.
--
-- Until this column existed the two surfaces read the same rows, so an item added for one
-- appeared in the other whether or not that was wanted. Nothing separated them.
--
-- THE DEFAULT IS DELIBERATE. Backfilling every existing row to 'both' changes nothing that
-- is live today: the app keeps its 47 items and the web shop keeps its 33 gemstones. The
-- separation is then something an admin performs product by product, from either section,
-- rather than something this migration decides on their behalf and silently empties half a
-- shop doing it.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.remedy_items
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'both';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remedy_items_channel_check') THEN
    -- NOT VALID: applies to every future write immediately, with no full table scan and no
    -- chance of failing the migration on a legacy row.
    ALTER TABLE public.remedy_items
      ADD CONSTRAINT remedy_items_channel_check CHECK (channel IN ('app', 'shop', 'both')) NOT VALID;
    RAISE NOTICE 'added remedy_items_channel_check';
  ELSE
    RAISE NOTICE 'remedy_items_channel_check already present';
  END IF;
END $$;

-- The vastu catalogue is Wani Shop's alone. Those 450 rows were seeded before this column
-- existed, so the DEFAULT above would hand every one of them to the app's Home remedies row
-- as well - a shop the customer has never been shown them in. Claimed explicitly here rather
-- than left to a default that happens to be wrong for them.
--
-- Scoped to rows that are still on the default: an admin who has already moved something is
-- not overruled by a re-run.
UPDATE public.remedy_items
   SET channel = 'shop'
 WHERE type = 'vastu' AND channel = 'both';

-- Both listings filter on this on every page load, so it earns an index.
CREATE INDEX IF NOT EXISTS idx_remedy_items_channel_type
  ON public.remedy_items (channel, type)
  WHERE is_active = true;

DO $$
DECLARE n_app bigint; n_shop bigint; n_both bigint;
BEGIN
  SELECT count(*) FILTER (WHERE channel = 'app'),
         count(*) FILTER (WHERE channel = 'shop'),
         count(*) FILTER (WHERE channel = 'both')
    INTO n_app, n_shop, n_both FROM public.remedy_items;
  RAISE NOTICE 'remedy_items by channel - app: %, shop: %, both: %', n_app, n_shop, n_both;
END $$;
