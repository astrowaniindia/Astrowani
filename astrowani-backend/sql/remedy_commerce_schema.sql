-- Remedies shop → real commerce: cart orders, saved addresses, order tracking (2026-08-21)
--
-- WHY: The remedies shop shipped as a catalogue plus a one-item form, and the form was
-- deliberately inert — RemedyShop.js's placeOrder() never called POST /api/orders and
-- never touched the wallet, it just showed the admin-editable "we're not delivering to
-- your location yet" popup (see remedy_unavailable_popup_schema.sql). Underneath there
-- was nothing e-commerce-shaped at all: no cart, no line items, no address book, no
-- delivery fee, no stock, no order history, and no payment leg — orders.payment_status
-- was only ever flipped by hand from the admin Orders page.
--
-- This migration adds the missing data layer for a real multi-item checkout paid by
-- Razorpay or from the Astrowani wallet.
--
-- TWO THINGS THIS FILE IS DELIBERATELY CAREFUL ABOUT:
--
--  1. `orders` is LIVE for item_type='life_report' — those rows are read by the customer
--     app's MyOrdersScreen and delivered by an admin writing report_content. So the
--     existing inline single-item columns (item_id/item_title/item_type/price/quantity)
--     are LEFT IN PLACE and keep being written for that path. Multi-item cart orders put
--     their lines in the new `order_items` child table instead, and readers fall back to
--     the inline columns when a row has no children. Nothing here rewrites existing rows.
--
--  2. `orders` predates every convention this codebase later adopted (no FK, no CHECKs,
--     no indexes, no RLS — see the 2026-08-07 data-layer audit in CLAUDE.md). The new
--     tables below follow the wallet_recharge_schema.sql standard instead of matching
--     their neighbour, and the CHECK/index gaps on `orders` itself are retrofitted at
--     the bottom, guarded so a pre-existing odd value cannot fail the whole migration.
--
-- Idempotent. Run in Supabase SQL editor. Safe to re-run.


-- ---------------------------------------------------------------------------
-- Saved delivery addresses
-- ---------------------------------------------------------------------------
-- There was no address model anywhere: orders.address is one free-text blob the client
-- supplied per order, and the customer profile's city/state are BIRTH data, not shipping.
-- A real delivery operation needs a pincode it can trust.
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label        text NOT NULL DEFAULT 'home' CHECK (label IN ('home', 'work', 'other')),
  full_name    text NOT NULL,
  phone        text NOT NULL,
  house_flat   text NOT NULL,          -- flat / house no. / building
  street_area  text,                   -- street, area, locality
  landmark     text,
  city         text NOT NULL,
  state        text,
  pincode      text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
  ON public.customer_addresses (customer_id);

-- One default per customer, enforced by the DB rather than by whichever endpoint happens
-- to remember to clear the old one first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_addresses_one_default
  ON public.customer_addresses (customer_id) WHERE is_default;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customer_addresses' AND policyname='service role full access') THEN
    CREATE POLICY "service role full access" ON public.customer_addresses FOR ALL USING (auth.role() = 'service_role');
  END IF;
END
$$;


-- ---------------------------------------------------------------------------
-- Order line items
-- ---------------------------------------------------------------------------
-- One order = many items. Every money/description column here is a SNAPSHOT taken at
-- checkout: editing or deactivating a remedy_item later, or an admin deleting it (the FK
-- is ON DELETE SET NULL), must never change what a past order says the customer bought or
-- what they paid for it.
CREATE TABLE IF NOT EXISTS public.order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_id     uuid REFERENCES public.remedy_items(id) ON DELETE SET NULL,
  item_title  text NOT NULL,
  item_type   text,
  image       text,
  unit_price  numeric NOT NULL CHECK (unit_price >= 0),
  quantity    int NOT NULL CHECK (quantity > 0),
  line_total  numeric NOT NULL CHECK (line_total >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='service role full access') THEN
    CREATE POLICY "service role full access" ON public.order_items FOR ALL USING (auth.role() = 'service_role');
  END IF;
END
$$;


-- ---------------------------------------------------------------------------
-- Order status history
-- ---------------------------------------------------------------------------
-- orders.status is a single mutable text column with no history whatsoever — an admin
-- changing it from the dropdown overwrites the previous value and leaves no trace of when
-- or by whom. This table is both the audit trail and what the customer app renders as the
-- order-tracking timeline.
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status     text NOT NULL,
  note       text,
  created_by text NOT NULL DEFAULT 'system',  -- 'system' | 'customer' | an admin's email
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_events_order
  ON public.order_status_events (order_id, created_at);

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_status_events' AND policyname='service role full access') THEN
    CREATE POLICY "service role full access" ON public.order_status_events FOR ALL USING (auth.role() = 'service_role');
  END IF;
END
$$;


-- ---------------------------------------------------------------------------
-- orders: the commerce columns it never had
-- ---------------------------------------------------------------------------
-- All additive and all nullable, so every existing row (including every live life_report
-- order) stays valid exactly as it is.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal            numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee        numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handling_fee        numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS grand_total         numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method      text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id   text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at             timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS address_id          uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address    jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz;

COMMENT ON COLUMN public.orders.delivery_address IS
  'Frozen copy of customer_addresses at checkout. address_id is ON DELETE SET NULL, so this snapshot is what the order actually ships to.';

-- Razorpay ids are the idempotency guards, exactly as on wallet_recharges: a replayed
-- verify-payment call for the same payment physically cannot create a second paid order.
-- Partial (WHERE NOT NULL) because every pre-existing row, and every wallet-paid order,
-- legitimately has no Razorpay id at all.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_razorpay_order_id
  ON public.orders (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_razorpay_payment_id
  ON public.orders (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

-- The address FK. NOT VALID so it applies to new/updated rows immediately without the
-- migration having to scan and vouch for legacy data. Validate deliberately, later, with:
--   ALTER TABLE public.orders VALIDATE CONSTRAINT fk_orders_address;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_address') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_address
      FOREIGN KEY (address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;

-- Value-domain CHECKs. Each is added only if no existing row violates it — an admin has
-- been able to PATCH `status` to any string at all, so a stray legacy value must raise a
-- NOTICE for a human to clean up rather than abort the whole migration.
DO $$
DECLARE
  bad int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    SELECT count(*) INTO bad FROM public.orders
     WHERE status IS NOT NULL AND status NOT IN
       ('pending_payment','placed','confirmed','packed','shipped','out_for_delivery','completed','cancelled');
    IF bad = 0 THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN
        ('pending_payment','placed','confirmed','packed','shipped','out_for_delivery','completed','cancelled'));
    ELSE
      RAISE NOTICE 'orders_status_check NOT added: % row(s) hold an unexpected status. Run the audit query at the bottom of this file, fix them, then re-run.', bad;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check') THEN
    SELECT count(*) INTO bad FROM public.orders
     WHERE payment_status IS NOT NULL AND payment_status NOT IN
       ('pending','paid','failed','refund_pending','refunded');
    IF bad = 0 THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN
        ('pending','paid','failed','refund_pending','refunded'));
    ELSE
      RAISE NOTICE 'orders_payment_status_check NOT added: % row(s) hold an unexpected payment_status.', bad;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check') THEN
    -- 'cod' is accepted by the DB but rejected by the checkout endpoint for now: the app
    -- shows Cash on Delivery as a real "coming soon" option, so wiring it later is an
    -- endpoint change rather than another migration.
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN ('razorpay','wallet','cod'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_quantity_check') THEN
    SELECT count(*) INTO bad FROM public.orders WHERE quantity IS NOT NULL AND quantity <= 0;
    IF bad = 0 THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_quantity_check CHECK (quantity IS NULL OR quantity > 0);
    ELSE
      RAISE NOTICE 'orders_quantity_check NOT added: % row(s) have quantity <= 0.', bad;
    END IF;
  END IF;
END
$$;

-- GET /api/orders/mine filters on customer_id and sorts by created_at, against a table
-- that has never had an index beyond its primary key.
CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON public.orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);


-- ---------------------------------------------------------------------------
-- remedy_items: retail presentation + stock
-- ---------------------------------------------------------------------------
-- mrp drives the struck-through "was ₹X, −Y%" pair that makes a card read as a real
-- product rather than a price label. stock NULL means unlimited, which is what every
-- existing row means today (is_active was the only availability switch).
ALTER TABLE public.remedy_items ADD COLUMN IF NOT EXISTS mrp        numeric;
ALTER TABLE public.remedy_items ADD COLUMN IF NOT EXISTS stock      int;
ALTER TABLE public.remedy_items ADD COLUMN IF NOT EXISTS unit_label text;  -- '5.25 ratti', '1 pc', '250 g'

COMMENT ON COLUMN public.remedy_items.stock IS 'NULL = unlimited. Decremented at payment confirmation, never at add-to-cart.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remedy_items_stock_check') THEN
    ALTER TABLE public.remedy_items ADD CONSTRAINT remedy_items_stock_check
      CHECK (stock IS NULL OR stock >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remedy_items_mrp_check') THEN
    ALTER TABLE public.remedy_items ADD CONSTRAINT remedy_items_mrp_check
      CHECK (mrp IS NULL OR mrp >= 0);
  END IF;
END
$$;

-- /api/remedies always filters is_active and orders by sort_order, optionally by type.
CREATE INDEX IF NOT EXISTS idx_remedy_items_type_active
  ON public.remedy_items (type, is_active, sort_order);


-- ---------------------------------------------------------------------------
-- app_settings: the per-category ordering gate + the bill-summary fees
-- ---------------------------------------------------------------------------
-- The gate replaces the blanket "we're not delivering yet" popup with something an admin
-- can flip per remedy type as fulfilment becomes real for that category. It is enforced
-- SERVER-SIDE in POST /api/orders/checkout as well as in the app, so an old installed
-- build cannot slip an order past it.
--
-- Gemstones go first; the others keep showing today's popup until flipped.
INSERT INTO public.app_settings (key, value)
SELECT 'remedy_orders_enabled_gemstone', 'true'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_orders_enabled_gemstone');

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_orders_enabled_puja', 'false'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_orders_enabled_puja');

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_orders_enabled_specific_puja', 'false'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_orders_enabled_specific_puja');

-- life_report items are not shipped goods — they are bought and delivered as
-- report_content through their own existing flow, which this migration does not touch.
-- Kept false so a life_report can never end up in a physical-delivery cart.
INSERT INTO public.app_settings (key, value)
SELECT 'remedy_orders_enabled_life_report', 'false'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_orders_enabled_life_report');

-- Bill-summary lines. All default to 0 so the summary is honest on day one (free delivery,
-- no handling fee) and can be turned on from the admin without a release.
INSERT INTO public.app_settings (key, value)
SELECT 'remedy_delivery_fee', '0'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_delivery_fee');

-- 0 = the delivery fee always applies. Any positive value waives it once the item subtotal
-- reaches it.
INSERT INTO public.app_settings (key, value)
SELECT 'remedy_free_delivery_above', '0'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_free_delivery_above');

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_handling_fee', '0'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_handling_fee');


-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Deliberately NOT adding the new tables to supabase_realtime. `orders` was added to the
-- publication by remedies_schema.sql and nothing has ever consumed it (there is no
-- startTableFanout for orders) — the app polls /api/orders/mine on focus. Adding three
-- more unconsumed tables would only widen the WAL for no reader. See the 2026-08-07
-- audit's "Realtime amplifier" note in CLAUDE.md.


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- New tables and columns:
-- SELECT table_name, column_name, data_type FROM information_schema.columns
--  WHERE table_schema='public' AND table_name IN
--    ('customer_addresses','order_items','order_status_events','orders','remedy_items')
--  ORDER BY table_name, ordinal_position;
--
-- Constraints that actually landed (anything RAISE NOTICE'd above will be missing here):
-- SELECT conname, convalidated FROM pg_constraint
--  WHERE conrelid = 'public.orders'::regclass ORDER BY conname;
--
-- Legacy status values to clean up if a CHECK was skipped:
-- SELECT status, payment_status, count(*) FROM public.orders GROUP BY 1,2 ORDER BY 3 DESC;
--
-- The gate, as the backend will read it:
-- SELECT key, value FROM public.app_settings WHERE key LIKE 'remedy_%' ORDER BY key;
