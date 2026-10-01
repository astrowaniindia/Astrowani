-- ============================================================================
-- Astrowani — wallet debt persistence (2026-10-01)
-- ============================================================================
-- Two things, both from the same incident: the 2026-10-01 billing-presence bug left a
-- customer having received paid consultation time (Astro Soni, 12 chats) that was never
-- billed. Compensating the astrologer for real work done means retroactively debiting that
-- customer, which can put them below zero — something the schema has never allowed.
--
-- PART 1 — a customer wallet may now go negative, DOWN TO A FLOOR.
--
-- `chk_customers_balance_nonneg` (CHECK wallet_balance >= 0, NOT VALID) is still enforced on
-- every new write despite NOT VALID -- it only skipped validating pre-existing rows when it
-- was added. Replacing it with a floor, not removing it outright, is deliberate: an unlimited
-- negative balance would let a bug (or a bad correction script) run up unbounded debt the same
-- way the billing-presence bug just ran up unbounded unbilled minutes. -2000 is generous
-- headroom for a legitimate retroactive correction while still being a hard stop.
--
-- adjust_customer_wallet's own WHERE clause already supports `p_allow_negative` (added with
-- hardening_03) -- this migration is what lets that flag actually take effect; before now the
-- CHECK constraint rejected the UPDATE regardless of what the application intended.
--
-- PART 2 — debt survives account deletion, by the same mechanism as offer_claims
-- (sql/offer_guard.sql, src/offerGuard.js): delete the account, sign up again with the same
-- number, and a fresh customers row has no history -- including no memory of money owed. A
-- keyed hash of the phone number (never the number itself) carries the balance forward so
-- re-registering cannot erase a real debt. See src/debtGuard.js for the read/write logic;
-- this migration only creates the table it uses.
--
-- wallet_debt_claims is intentionally NOT per-offer like offer_claims (one row per phone
-- hash, not one per phone+key): debt is a single running number, not a set of flags.
--
-- Idempotent. Service-role only: RLS on, no policies, anon/authenticated revoked.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass AND conname = 'chk_customers_balance_nonneg'
  ) THEN
    ALTER TABLE public.customers DROP CONSTRAINT chk_customers_balance_nonneg;
  END IF;
END $$;

ALTER TABLE public.customers
  ADD CONSTRAINT chk_customers_balance_floor CHECK (wallet_balance >= -2000) NOT VALID;

CREATE TABLE IF NOT EXISTS public.wallet_debt_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash      text NOT NULL UNIQUE,
  debt_amount     numeric NOT NULL DEFAULT 0 CHECK (debt_amount >= 0),
  last4           text,
  reason          text,
  recorded_from_customer_id uuid,  -- deliberately NOT a foreign key: that account is gone
  applied_to_customer_id    uuid,  -- set once a later account on this number has absorbed it
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_debt_claims_unapplied_idx
  ON public.wallet_debt_claims (phone_hash) WHERE applied_to_customer_id IS NULL;

ALTER TABLE public.wallet_debt_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_debt_claims FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.wallet_debt_claims') IS NULL THEN
    RAISE EXCEPTION 'wallet_debt_claims missing after migration';
  END IF;
  IF has_table_privilege('anon', 'public.wallet_debt_claims', 'SELECT')
     OR has_table_privilege('authenticated', 'public.wallet_debt_claims', 'SELECT') THEN
    RAISE EXCEPTION 'anon/authenticated can read wallet_debt_claims';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass AND conname = 'chk_customers_balance_floor'
  ) THEN
    RAISE EXCEPTION 'chk_customers_balance_floor missing after migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass AND conname = 'chk_customers_balance_nonneg'
  ) THEN
    RAISE EXCEPTION 'old chk_customers_balance_nonneg still present';
  END IF;
END $$;
