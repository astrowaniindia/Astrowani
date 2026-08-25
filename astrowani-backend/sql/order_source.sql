-- orders.source — which storefront placed an order.
--
-- Added 2026-08-25 with the shop.astrowani.com commerce build. Before this, an order
-- placed on the web storefront and one placed inside the customer app were
-- indistinguishable in the admin dashboard, which made it impossible to tell whether the
-- web store was actually selling anything.
--
-- Purely DESCRIPTIVE. No money, no gate and no fulfilment logic reads this column; it
-- exists so the admin Orders page can filter and so the numbers can be attributed. That is
-- why the default is 'app': every row that predates this migration was placed in the app
-- (the web store took no payments before today), so backfilling to 'app' is not a guess,
-- it is the fact.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_source_check'
  ) THEN
    -- Added NOT VALID deliberately: it applies to every future write immediately, without
    -- a full table scan and without any chance of failing the migration on a legacy row.
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_source_check CHECK (source IN ('app', 'web')) NOT VALID;
    RAISE NOTICE 'added orders_source_check';
  ELSE
    RAISE NOTICE 'orders_source_check already present';
  END IF;
END $$;

-- The admin Orders page filters on this alongside status, so it is worth an index only
-- where it is selective. 'web' is the rare value today, so a partial index on it stays
-- tiny while still serving the query that matters ("show me the web orders").
CREATE INDEX IF NOT EXISTS idx_orders_source_web
  ON public.orders (created_at DESC)
  WHERE source = 'web';

DO $$
DECLARE n_web bigint; n_app bigint;
BEGIN
  SELECT count(*) FILTER (WHERE source = 'web'), count(*) FILTER (WHERE source = 'app')
    INTO n_web, n_app FROM public.orders;
  RAISE NOTICE 'orders by source — app: %, web: %', n_app, n_web;
END $$;
