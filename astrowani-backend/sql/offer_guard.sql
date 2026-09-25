-- Offer abuse guard (2026-09-25).
--
-- THE EXPLOIT: delete the account, sign up again with the same phone number, and every
-- "new customer" offer (free 12-minute call, free 5-minute chat) is available again,
-- because a re-registered number is a brand-new customers row with no history.
--
-- THE FIX: when an account is deleted, remember WHICH OFFERS that phone number had already
-- used -- keyed by a keyed hash of the number (HMAC-SHA256), never the number itself -- and
-- refuse the same offers to any later account on that number. Deletion itself is unchanged:
-- all personal data is still erased; the hash is the only thing kept.
--
--   offer_claims   one row per (phone, offer) that was used before the account was deleted
--   offer_blocks   an attempt that was stopped, for the admin's "Offer Abuse" page
--
-- offer_key is free text ON PURPOSE: a future offer (welcome bonus, referral reward, ...) is
-- added in src/offerGuard.js without a migration. Current keys:
--   welcome_session  the number already had a real consultation -> not a "new customer"
--   free_call        the free intro call was booked / used
--   free_chat        the free bot chat was used
--
-- Idempotent. Service-role only: RLS on, no policies, anon/authenticated revoked.

CREATE TABLE IF NOT EXISTS public.offer_claims (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash            text NOT NULL,
  offer_key             text NOT NULL,
  last4                 text,
  source                text NOT NULL DEFAULT 'account_deleted',
  claimed_by_customer_id uuid,          -- deliberately NOT a foreign key: the account is gone
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_hash, offer_key)
);

CREATE TABLE IF NOT EXISTS public.offer_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_key   text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  last4       text,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_blocks_recent_idx ON public.offer_blocks (created_at DESC);
CREATE INDEX IF NOT EXISTS offer_claims_offer_idx ON public.offer_claims (offer_key, created_at DESC);

ALTER TABLE public.offer_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_claims FROM anon, authenticated;
REVOKE ALL ON public.offer_blocks FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.offer_claims') IS NULL OR to_regclass('public.offer_blocks') IS NULL THEN
    RAISE EXCEPTION 'offer guard tables missing after migration';
  END IF;
  IF has_table_privilege('anon', 'public.offer_claims', 'SELECT')
     OR has_table_privilege('authenticated', 'public.offer_claims', 'SELECT')
     OR has_table_privilege('anon', 'public.offer_blocks', 'SELECT')
     OR has_table_privilege('authenticated', 'public.offer_blocks', 'SELECT') THEN
    RAISE EXCEPTION 'anon/authenticated can read the offer guard tables';
  END IF;
END $$;
