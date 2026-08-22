-- ─────────────────────────────────────────────────────────────────────────────
-- Astrologer referral commission on remedy orders (gemstone / puja / specific_puja).
--
-- An astrologer recommends a remedy item to a customer during or after a consult;
-- if that customer buys it, the astrologer earns a commission. The rate is set per
-- remedy TYPE from the admin, and the commission comes out of the PLATFORM's margin —
-- the customer pays exactly the same price either way.
--
-- Referrals can be created two ways, both supported:
--   * source = 'vendor' — the astrologer recommends it from the vendor app.
--   * source = 'admin'  — an admin attributes it manually (phone consults, disputes,
--                         anything the app flow missed).
--
-- DESIGN NOTES
--
-- 1. History is kept, not overwritten. Multiple rows per (customer, item) are legal;
--    checkout picks the MOST RECENT one inside the attribution window. Overwriting
--    would destroy the audit trail for a payment, which is the one thing you need when
--    an astrologer disputes a commission.
--
-- 2. Commission is snapshotted onto order_items, per LINE, at checkout:
--      * per line, because rates differ per type and one cart can mix a gemstone with
--        a puja;
--      * snapshotted, because changing a rate in the admin must never retroactively
--        alter what an already-placed order pays out.
--
-- 3. Paid on DELIVERY (orders.status = 'completed'), not at checkout. That means a
--    cancelled or refunded order never needs a commission clawback — the money simply
--    was never paid. commission_paid_at makes the payout idempotent, so an admin
--    re-selecting a delivered status cannot pay twice.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Referral records ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.remedy_referrals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id  uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  remedy_item_id uuid NOT NULL REFERENCES public.remedy_items(id) ON DELETE CASCADE,
  source         text NOT NULL DEFAULT 'vendor',
  created_by     text,          -- admin email when source = 'admin'
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remedy_referrals_source_chk CHECK (source IN ('vendor', 'admin'))
);

-- The lookup checkout does: newest referral for this customer + item.
CREATE INDEX IF NOT EXISTS idx_remedy_referrals_lookup
  ON public.remedy_referrals (customer_id, remedy_item_id, created_at DESC);

-- "What have I recommended / earned" for the vendor app and admin list.
CREATE INDEX IF NOT EXISTS idx_remedy_referrals_astrologer
  ON public.remedy_referrals (astrologer_id, created_at DESC);

-- Service-role only. The vendor app reaches this through the backend (which verifies
-- the astrologer's JWT), never directly — an astrologer must not be able to write
-- themselves a referral for someone else's customer using the publishable key.
ALTER TABLE public.remedy_referrals ENABLE ROW LEVEL SECURITY;

-- ── 2. Commission snapshot on each order line ────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS referred_by_astrologer_id uuid REFERENCES public.astrologers(id),
  ADD COLUMN IF NOT EXISTS commission_percent numeric,
  ADD COLUMN IF NOT EXISTS commission_amount  numeric,
  ADD COLUMN IF NOT EXISTS commission_paid_at timestamptz;

-- Finding the unpaid lines to settle when an order is marked delivered.
CREATE INDEX IF NOT EXISTS idx_order_items_commission_unpaid
  ON public.order_items (order_id)
  WHERE referred_by_astrologer_id IS NOT NULL AND commission_paid_at IS NULL;

-- Per-astrologer commission reporting.
CREATE INDEX IF NOT EXISTS idx_order_items_referrer
  ON public.order_items (referred_by_astrologer_id, commission_paid_at);

-- A commission can never be negative, and a percent outside 0-100 is a data entry
-- error rather than a business rule. Added only if nothing already violates them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE commission_amount < 0) THEN
    BEGIN
      ALTER TABLE public.order_items
        ADD CONSTRAINT order_items_commission_amount_chk CHECK (commission_amount IS NULL OR commission_amount >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  ELSE
    RAISE NOTICE 'Skipped commission_amount CHECK — % row(s) are already negative',
      (SELECT count(*) FROM public.order_items WHERE commission_amount < 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE commission_percent < 0 OR commission_percent > 100) THEN
    BEGIN
      ALTER TABLE public.order_items
        ADD CONSTRAINT order_items_commission_percent_chk CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── 3. Admin-editable settings ───────────────────────────────────────────────
-- Rates start at 10% for every type; change them on the admin Remedies page. The
-- window is how long a recommendation stays attributable — a customer who buys three
-- weeks after being advised still credits the astrologer who advised them, but a
-- purchase a year later does not.
INSERT INTO public.app_settings (key, value)
SELECT 'remedy_commission_percent_gemstone', '10'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_commission_percent_gemstone');

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_commission_percent_puja', '10'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_commission_percent_puja');

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_commission_percent_specific_puja', '10'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_commission_percent_specific_puja');

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_referral_window_days', '30'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_referral_window_days');

-- ── Report ───────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE 'remedy_referrals rows: %', (SELECT count(*) FROM public.remedy_referrals);
  RAISE NOTICE 'order_items commission columns present: %',
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_items'
        AND column_name IN ('referred_by_astrologer_id','commission_percent','commission_amount','commission_paid_at'));
  FOR r IN SELECT key, value FROM public.app_settings
            WHERE key LIKE 'remedy_commission_percent_%' OR key = 'remedy_referral_window_days'
            ORDER BY key LOOP
    RAISE NOTICE '  %  =  %', rpad(r.key, 40), r.value;
  END LOOP;
END $$;
