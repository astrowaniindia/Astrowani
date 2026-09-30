-- Dakshina: a voluntary thank-you the customer may give after a FREE introductory call.
--
-- It is NOT a gift (gifts are bought during a live stream from a catalogue) and NOT a
-- wallet recharge (the money never lands in the customer's wallet — it goes straight
-- through Razorpay and is split). It needs its own table because it needs its own
-- idempotency: the same replay-safety rule as wallet_recharges and orders.
--
-- SPLIT: 50/50, the same share the gift system uses. See src/dakshina.js.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS dakshina_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  astrologer_id       uuid NOT NULL REFERENCES astrologers(id) ON DELETE RESTRICT,
  -- The free call this thank-you belongs to. Nullable so a failed/abandoned session
  -- lookup can never block somebody trying to pay.
  session_id          uuid,
  amount              numeric(10,2) NOT NULL CHECK (amount > 0),
  vendor_amount       numeric(10,2) NOT NULL DEFAULT 0 CHECK (vendor_amount >= 0),
  platform_amount     numeric(10,2) NOT NULL DEFAULT 0 CHECK (platform_amount >= 0),
  status              text NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment','paid','failed','voided')),
  razorpay_order_id   text,
  razorpay_payment_id text,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One Razorpay order can only ever settle once. This is the claim the verify endpoint
-- keys on, exactly as POST /api/orders/verify-payment does.
CREATE UNIQUE INDEX IF NOT EXISTS dakshina_payments_rzp_order_uniq
  ON dakshina_payments (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dakshina_payments_rzp_payment_uniq
  ON dakshina_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dakshina_payments_astrologer_idx
  ON dakshina_payments (astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dakshina_payments_customer_idx
  ON dakshina_payments (customer_id, created_at DESC);

-- Service-role only. There is no client-direct read or write path: the amounts and the
-- split are decided server-side, and a customer being able to INSERT a 'paid' row would
-- be free money for an astrologer.
ALTER TABLE dakshina_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dakshina_payments FROM anon, authenticated;

-- Admin-editable options. Seeded, never overwritten on re-run, so an admin's own
-- amounts survive a second application of this file.
INSERT INTO app_settings (key, value)
VALUES (
  'dakshina_config',
  '{"enabled":true,"amounts":[21,51,101],"allowCustom":true,"minAmount":11,"maxAmount":5000}'
)
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'dakshina_payments';
  IF n <> 1 THEN
    RAISE EXCEPTION 'dakshina_payments was not created';
  END IF;
  SELECT count(*) INTO n FROM app_settings WHERE key = 'dakshina_config';
  IF n <> 1 THEN
    RAISE EXCEPTION 'dakshina_config was not seeded';
  END IF;
  RAISE NOTICE 'dakshina schema OK';
END $$;
