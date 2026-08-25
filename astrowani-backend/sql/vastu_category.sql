-- Vastu Remedies: a fourth sellable category in the shop.
--
-- Added 2026-08-25 with /vastu/ on shop.astrowani.com.
--
-- NO SCHEMA CHANGE IS NEEDED for the products themselves: remedy_items.type is plain text
-- with no CHECK constraint, so rows of type 'vastu' are accepted as they are. This file
-- only seeds the two app_settings keys the category needs, because BOTH of them fail
-- CLOSED when absent and would otherwise be invisible problems:
--
--   remedy_orders_enabled_vastu   the per-category ordering gate. Missing = "not accepting
--                                 orders", enforced in POST /api/orders/checkout. Seeded
--                                 'false' deliberately - turn it on from the admin's
--                                 Remedies page when you are actually ready to ship these.
--   remedy_commission_percent_vastu   the astrologer referral rate for this category.
--                                 loadCommissionConfig() treats a missing rate as 0, so
--                                 without this row a referred vastu sale silently pays no
--                                 commission.
--
-- Idempotent. Safe to re-run.

INSERT INTO public.app_settings (key, value)
VALUES ('remedy_orders_enabled_vastu', 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES ('remedy_commission_percent_vastu', '10')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE n_items bigint; gate text;
BEGIN
  SELECT count(*) INTO n_items FROM public.remedy_items WHERE type = 'vastu';
  SELECT value INTO gate FROM public.app_settings WHERE key = 'remedy_orders_enabled_vastu';
  RAISE NOTICE 'vastu items in catalogue: %, accepting orders: %', n_items, gate;
END $$;
