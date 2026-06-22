-- Remedies shop schema — admin-authored shop items (Puja / Gemstones / Specific Puja)
-- plus customer orders.
--
-- WHY: The customer app's Remedies section sells three kinds of items. The admin
-- dashboard authors them (title, price, image, description) per type; the customer
-- app lists them and lets users place orders (payment gateway wired later).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & Run. Safe to re-run.

-- ── Remedy items (shop catalogue) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.remedy_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,            -- 'puja' | 'gemstone' | 'specific_puja'
  title       text NOT NULL,
  description text,
  price       numeric NOT NULL DEFAULT 0,
  image       text,                     -- URL or base64 data-URI
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Orders (customer purchases) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid,
  item_id        uuid REFERENCES public.remedy_items(id) ON DELETE SET NULL,
  item_title     text,
  item_type      text,
  price          numeric,
  quantity       int NOT NULL DEFAULT 1,
  total          numeric,
  customer_name  text,
  customer_phone text,
  address        text,
  status         text NOT NULL DEFAULT 'placed',  -- placed|confirmed|shipped|completed|cancelled
  payment_status text NOT NULL DEFAULT 'pending',  -- pending|paid (Razorpay later)
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Realtime: customer app sees new/edited items instantly ────────────────────
ALTER TABLE public.remedy_items REPLICA IDENTITY FULL;
ALTER TABLE public.orders       REPLICA IDENTITY FULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['remedy_items', 'orders'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
