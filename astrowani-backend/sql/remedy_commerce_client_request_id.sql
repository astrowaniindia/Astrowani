-- Checkout de-duplication token (2026-08-21, follow-up to remedy_commerce_schema.sql)
--
-- WHY: POST /api/orders/checkout mints a fresh order id on every call, and the wallet debit
-- is keyed on that id (`order:<orderId>`). That guarantees a SINGLE order can never be
-- charged twice — but it does NOT dedupe two checkout CALLS. Verified against the real
-- database: two simultaneous identical wallet checkouts produced two orders and charged
-- ₹2000 twice, correctly by the letter of the code and wrongly by the customer's intent.
--
-- The app disables its Pay button while a checkout is in flight, so the realistic exposure
-- is a slow request plus a retry rather than a plain double-tap. That is still a
-- double-charge, and the standard fix is a client-supplied idempotency token — the same
-- approach Stripe and Razorpay expose on their own APIs. It is strictly better than a
-- server-side "same cart within N seconds" window, which would also block a customer who
-- genuinely wants to order the same gemstone twice.
--
-- The app generates one token per checkout attempt (per Payment-screen mount) and reuses it
-- across retries of that attempt; deliberately starting a new purchase produces a new token.
--
-- Idempotent. Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_request_id text;

COMMENT ON COLUMN public.orders.client_request_id IS
  'Client-supplied per-attempt idempotency token. A retry of the same checkout attempt returns the existing order instead of creating and charging a second one.';

-- Partial, because every pre-existing row and any request that omits the token legitimately
-- has none. Scoped per customer so two customers can never collide on a token, however
-- weakly the client happens to generate one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_client_request
  ON public.orders (customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='orders' AND column_name='client_request_id';
-- SELECT indexname FROM pg_indexes WHERE tablename='orders' AND indexname='uq_orders_client_request';
