-- ═══════════════════════════════════════════════════════════════════════════
-- Coins — the iOS-only currency for Apple In-App Purchase paths
--
-- WHY THIS EXISTS
-- Apple requires In-App Purchase for digital content consumed in the app
-- (App Store Review Guideline 3.1.1). Three of this app's five wallet spend
-- paths are digital content and are therefore in scope on iOS:
--     * Astro Reports        src/astroRoutes.js
--     * Gifts                index.js  (live one-to-many gifting)
--     * "Free" services      src/freeServicesRoutes.js
-- The other two — per-minute consultations (1:1 real-time, person-to-person)
-- and the remedy shop (physical goods) — are EXEMPT and must keep using the
-- rupee wallet funded by Razorpay. Putting IAP on wallet top-ups instead would
-- have handed Apple 15% of that exempt revenue, which is why coins are a
-- SEPARATE currency rather than a funding source for the existing wallet.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ THE RULE THIS SCHEMA EXISTS TO ENFORCE:                                  │
-- │ Coins buy reports, gifts and free-services. NOTHING ELSE. If coins ever  │
-- │ pay for a consultation or a remedy order, Apple's cut silently applies   │
-- │ to exempt revenue. There is deliberately no coin -> rupee conversion,    │
-- │ and no withdrawal path.                                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- 1 coin == 1 rupee of catalogue price, so the admin keeps pricing gifts at the
-- auspicious numbers the feature depends on (21 / 51 / 108 / 111 / 251 / 501).
-- Apple's India price tiers could never express 108 exactly; coin packs are
-- sold at whatever tiers Apple offers and spent at our own prices.
--
-- Idempotent. Safe to re-run. NO explicit BEGIN/COMMIT — a previous migration
-- in this repo (free_call_booking_pool.sql) wrapped its statements in a
-- transaction and its DROP INDEX silently did not take effect, leaving a
-- half-applied schema that threw no runtime error. Ends with a self-verifying
-- DO block for the same reason.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Balance column ────────────────────────────────────────────────────────
-- int, not numeric: coins are whole units by definition. There is no fractional
-- coin and no rounding question to get wrong.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS coin_balance int NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_coin_balance_non_negative'
  ) THEN
    -- Coins are bought, never borrowed. Unlike wallet_balance there is no
    -- allow_negative path anywhere, so this can be enforced absolutely.
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_coin_balance_non_negative CHECK (coin_balance >= 0);
  END IF;
END $$;

-- ── 2. Ledger ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  type                  text NOT NULL CHECK (type IN ('credit', 'debit')),
  amount                int  NOT NULL CHECK (amount > 0),
  description           text,
  -- Set on credits from a completed Apple purchase. The ledger is the record of
  -- which Apple transaction paid for which coins, for refund handling and for
  -- any dispute with Apple.
  apple_transaction_id  text,
  apple_product_id      text,
  idempotency_key       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ON DELETE RESTRICT above is deliberate and mirrors wallet_transactions: it is
-- what makes account deletion fall back to the "soft removal" path for anyone
-- who has ever bought coins, preserving the money trail. See accountRoutes.js.

CREATE INDEX IF NOT EXISTS coin_transactions_customer_idx
  ON public.coin_transactions (customer_id, created_at DESC);

-- Replay protection, same shape as wallet_transactions.
CREATE UNIQUE INDEX IF NOT EXISTS coin_transactions_idempotency_uniq
  ON public.coin_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- THE anti-double-credit guard. One Apple transaction can credit coins exactly
-- once, no matter how many times the app retries verification — the same atomic
-- claim the Razorpay paths use. A second attempt must be answered 200
-- "already processed", never an error, or a flaky network turns into a support
-- ticket about missing coins.
CREATE UNIQUE INDEX IF NOT EXISTS coin_transactions_apple_txn_uniq
  ON public.coin_transactions (apple_transaction_id)
  WHERE apple_transaction_id IS NOT NULL;

-- ── 3. Coin packs (admin-managed) ────────────────────────────────────────────
-- NOTE THE ABSENCE OF A PRICE COLUMN. Apple owns the price: it is set in App
-- Store Connect and read at runtime from StoreKit, localised and tax-inclusive
-- per storefront. Storing a price here would create a second source of truth
-- that silently drifts and shows customers a number they will not be charged.
CREATE TABLE IF NOT EXISTS public.coin_packs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Must match the product identifier registered in App Store Connect exactly.
  product_id   text NOT NULL UNIQUE,
  coins        int  NOT NULL CHECK (coins > 0),
  -- Purely cosmetic ("Most popular"); carries no pricing meaning.
  badge        text,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.coin_packs (product_id, coins, badge, sort_order)
SELECT * FROM (VALUES
  ('com.astrowanicustomer.coins.99',   99,   NULL,           1),
  ('com.astrowanicustomer.coins.299',  299,  NULL,           2),
  ('com.astrowanicustomer.coins.499',  499,  'Most popular', 3),
  ('com.astrowanicustomer.coins.999',  999,  NULL,           4),
  ('com.astrowanicustomer.coins.1999', 1999, 'Best value',   5)
) AS seed(product_id, coins, badge, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.coin_packs);

-- ── 4. Atomic coin movement ──────────────────────────────────────────────────
-- Mirrors adjust_customer_wallet (sql/hardening_03_atomic_wallet.sql) exactly,
-- including the two properties that matter most:
--   * the balance test lives in the UPDATE's WHERE clause, so the row lock
--     serialises concurrent callers and there is no read-then-write window;
--   * the ledger INSERT is in the same transaction as the balance change, so
--     the two can never come apart.
--
-- The UPDATE carries a WHERE clause on the primary key. That is not decoration:
-- this database rejects WHERE-less UPDATEs even inside SECURITY DEFINER
-- functions, which is how adjust_admin_wallet silently never recorded a single
-- rupee of platform revenue. See sql/hardening_07_admin_wallet_where_clause.sql.
--
-- ⚠ IF THIS FUNCTION'S PARAMETER LIST EVER CHANGES, DROP THE OLD SIGNATURE
-- EXPLICITLY IN THE SAME FILE. CREATE OR REPLACE only replaces an IDENTICAL
-- argument list; changing the count creates a second OVERLOAD and leaves the old
-- one in place. That exact mistake took vendor withdrawals offline via PGRST203
-- — see sql/hardening_08_drop_duplicate_vendor_wallet_overload.sql.
CREATE OR REPLACE FUNCTION public.adjust_customer_coins(
  p_customer_id          uuid,
  p_amount               int,
  p_description          text DEFAULT NULL,
  p_idempotency_key      text DEFAULT NULL,
  p_apple_transaction_id text DEFAULT NULL,
  p_apple_product_id     text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance int;
  v_exists      boolean;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'ZERO_AMOUNT' USING ERRCODE = '22023';
  END IF;

  -- Replay of an already-applied movement: return the current balance and change
  -- nothing. Checked on BOTH keys, because an Apple credit is deduped by its
  -- transaction id while an internal debit is deduped by its own key.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT true INTO v_exists FROM public.coin_transactions
     WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_exists THEN
      SELECT coin_balance INTO v_new_balance FROM public.customers WHERE id = p_customer_id;
      RETURN v_new_balance;
    END IF;
  END IF;

  IF p_apple_transaction_id IS NOT NULL THEN
    SELECT true INTO v_exists FROM public.coin_transactions
     WHERE apple_transaction_id = p_apple_transaction_id LIMIT 1;
    IF v_exists THEN
      SELECT coin_balance INTO v_new_balance FROM public.customers WHERE id = p_customer_id;
      RETURN v_new_balance;
    END IF;
  END IF;

  UPDATE public.customers
     SET coin_balance = coalesce(coin_balance, 0) + p_amount
   WHERE id = p_customer_id
     AND coalesce(coin_balance, 0) + p_amount >= 0
  RETURNING coin_balance INTO v_new_balance;

  IF NOT FOUND THEN
    SELECT true INTO v_exists FROM public.customers WHERE id = p_customer_id;
    IF v_exists THEN
      RAISE EXCEPTION 'INSUFFICIENT_COINS' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'NO_SUCH_CUSTOMER' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.coin_transactions
    (customer_id, type, amount, description, idempotency_key,
     apple_transaction_id, apple_product_id)
  VALUES
    (p_customer_id,
     CASE WHEN p_amount > 0 THEN 'credit' ELSE 'debit' END,
     abs(p_amount), p_description, p_idempotency_key,
     p_apple_transaction_id, p_apple_product_id);

  RETURN v_new_balance;
END;
$$;

-- ── 4b. Gifting: coins out, RUPEES in ────────────────────────────────────────
-- A gift paid in coins is the one asymmetric movement in the system. The customer
-- spends COINS (Apple has already taken its cut at the point of purchase), but the
-- astrologer must be credited in RUPEES — rupees are what they see as earnings and
-- what they withdraw. There is no coin balance on an astrologer and there must
-- never be one, or they would be paid in a currency they cannot cash out.
--
-- Composed from the two existing atomic functions inside ONE plpgsql body, exactly
-- as transfer_customer_to_vendor does, so both sides commit together or not at all.
-- Doing this as two separate calls from Node would leave a window where the
-- customer's coins are gone and the astrologer was never paid.
--
-- The rupee figure is passed in rather than derived here: the 50/50 split lives in
-- index.js (GIFT_VENDOR_SHARE) and must not be duplicated into the database where
-- the two could drift apart.
CREATE OR REPLACE FUNCTION public.transfer_coins_to_vendor(
  p_customer_id     uuid,
  p_astrologer_id   uuid,
  p_coins           int,
  p_vendor_amount   numeric,
  p_description     text DEFAULT NULL,
  p_session_id      uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS TABLE (coin_balance int, vendor_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins int;
  v_vend  numeric;
BEGIN
  IF p_coins IS NULL OR p_coins <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF p_vendor_amount IS NULL OR p_vendor_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;

  -- Suffixed keys so the two legs dedupe independently, matching
  -- transfer_customer_to_vendor's ':c' / ':v' convention.
  v_coins := public.adjust_customer_coins(
    p_customer_id, -p_coins, p_description,
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':c' END);

  -- Positional call, mirroring transfer_customer_to_vendor. The 9-argument
  -- signature is the ONLY one that should exist — see hardening_08.
  v_vend := public.adjust_vendor_wallet(
    p_astrologer_id, p_vendor_amount, p_description, p_session_id, NULL,
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':v' END,
    true, false, p_customer_id);

  RETURN QUERY SELECT v_coins, v_vend;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_customer_coins(uuid, int, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_coins_to_vendor(uuid, uuid, int, numeric, text, uuid, text) TO service_role;

-- ── 5. Access control ────────────────────────────────────────────────────────
-- The ledger is service-role only: it is money, and the publishable key shipped
-- in the APK must never read or write it. Coin packs are public-read because the
-- app needs the product list before any purchase.
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_packs        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'coin_packs'
       AND policyname = 'coin_packs_public_read'
  ) THEN
    CREATE POLICY coin_packs_public_read ON public.coin_packs
      FOR SELECT USING (true);
  END IF;
END $$;

-- No policy at all on coin_transactions: RLS on with zero policies denies every
-- non-service-role read and write, which is exactly the intent.

REVOKE ALL ON public.coin_transactions FROM anon, authenticated;
GRANT SELECT ON public.coin_packs TO anon, authenticated;

-- ── 6. Self-verifying tail ───────────────────────────────────────────────────
-- Raises rather than leaving a half-applied money schema that throws no runtime
-- error. A missing piece here would present as "coins just do not work".
DO $$
DECLARE
  v_overloads int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'customers'
                    AND column_name = 'coin_balance') THEN
    RAISE EXCEPTION 'coin_schema: customers.coin_balance is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'coin_transactions') THEN
    RAISE EXCEPTION 'coin_schema: coin_transactions is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public'
                    AND indexname = 'coin_transactions_apple_txn_uniq') THEN
    RAISE EXCEPTION 'coin_schema: the Apple transaction unique index is missing — double-crediting is possible';
  END IF;

  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'adjust_customer_coins';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'coin_schema: expected exactly 1 adjust_customer_coins, found % — drop the stale overload (see hardening_08)', v_overloads;
  END IF;

  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'transfer_coins_to_vendor';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'coin_schema: expected exactly 1 transfer_coins_to_vendor, found %', v_overloads;
  END IF;

  -- transfer_coins_to_vendor calls adjust_vendor_wallet POSITIONALLY with 9
  -- arguments. If a stale 8-argument overload were ever reintroduced, that call
  -- would still resolve (9 args match only one candidate) — but the API-level
  -- 8-named-argument callers in wallet.js would be broken again, which is the bug
  -- that took vendor withdrawals offline. Checked here because coins now depend
  -- on that function too.
  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'adjust_vendor_wallet';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'coin_schema: adjust_vendor_wallet has % overloads, expected 1 — run sql/hardening_08_drop_duplicate_vendor_wallet_overload.sql first', v_overloads;
  END IF;

  RAISE NOTICE 'coin_schema: OK (balance column, ledger, guards, both coin functions, and a single adjust_vendor_wallet)';
END $$;

-- Expect ONE row. More than one means a stale overload survives.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'adjust_customer_coins';
