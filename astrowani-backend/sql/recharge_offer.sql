-- Recharge bonus offers: "add ₹500, get ₹50 extra".
--
-- Idempotent. Safe to re-run.
--
-- TWO PARTS, and they are deliberately different kinds of thing:
--
--   1. The CONFIG (app_settings.recharge_offer) — what is on offer right now. Edited by
--      an admin, changes whenever they like.
--   2. The OUTCOME (wallet_recharges.bonus_amount / offer_label) — what a particular
--      recharge was actually granted. Written once, never recomputed.
--
-- Keeping the outcome on the row is what makes this auditable: months later you can still
-- say exactly how much promotional credit a customer was given and under what offer, even
-- though the offer itself has since been changed or switched off. It is also load-bearing
-- for correctness — completeRecharge's self-heal path re-credits from this column rather
-- than re-running the slab maths, so a config change between two attempts at the same
-- payment can never change what that payment is worth.

-- ── 1. Outcome columns on the recharge row ──────────────────────────────────
ALTER TABLE wallet_recharges
  ADD COLUMN IF NOT EXISTS bonus_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offer_label  text;

-- A bonus is never negative. It is money we are giving away, so the floor matters more
-- than the ceiling (which is clamped in src/rechargeOffer.js, where the amount is known).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_recharges_bonus_amount_nonneg'
  ) THEN
    IF EXISTS (SELECT 1 FROM wallet_recharges WHERE bonus_amount < 0) THEN
      RAISE NOTICE 'Skipping bonus_amount CHECK: % row(s) already have a negative bonus.',
        (SELECT count(*) FROM wallet_recharges WHERE bonus_amount < 0);
    ELSE
      ALTER TABLE wallet_recharges
        ADD CONSTRAINT wallet_recharges_bonus_amount_nonneg CHECK (bonus_amount >= 0);
    END IF;
  END IF;
END $$;

-- Reporting: "what did we pay out in bonuses last month" should not scan the table.
CREATE INDEX IF NOT EXISTS wallet_recharges_bonus_idx
  ON wallet_recharges (paid_at)
  WHERE bonus_amount > 0;

-- ── 2. The offer config ─────────────────────────────────────────────────────
-- Seeded DISABLED with no slabs. Turning this on is an admin decision, and a migration
-- that started giving money away the moment it ran would be a poor one.
--
-- Shape (see src/rechargeOffer.js for the normalisation, which is the real contract):
--   {
--     "enabled": false,
--     "slabs": [
--       { "minAmount": 500,  "type": "percent", "value": 10, "maxBonus": 200 },
--       { "minAmount": 2000, "type": "flat",    "value": 300 }
--     ]
--   }
-- One slab applies — the highest minAmount the recharge reaches. They do not stack.
INSERT INTO app_settings (key, value)
VALUES ('recharge_offer', '{"enabled":false,"slabs":[]}')
ON CONFLICT (key) DO NOTHING;

-- ── Verify ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'wallet_recharges' AND column_name = 'bonus_amount') THEN
    missing := missing || ' wallet_recharges.bonus_amount';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'wallet_recharges' AND column_name = 'offer_label') THEN
    missing := missing || ' wallet_recharges.offer_label';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'recharge_offer') THEN
    missing := missing || ' app_settings.recharge_offer';
  END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION 'recharge_offer migration incomplete, missing:%', missing;
  END IF;
  RAISE NOTICE 'recharge_offer: columns, constraint, index and config all present.';
END $$;

SELECT key, value FROM app_settings WHERE key = 'recharge_offer';
