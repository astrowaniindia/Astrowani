-- Wallet recharge (Razorpay) schema.
--
-- WHY: The customer "Add Money" screen was calling RazorpayCheckout.open() directly with
-- no backend involvement at all — payment succeeded on Razorpay's side but wallet_balance
-- never changed and nothing was recorded. This table backs the proper server-verified flow:
-- backend creates a Razorpay Order (status='created'), app pays against that order, backend
-- verifies the HMAC signature before marking it 'paid' and crediting the wallet. The UNIQUE
-- constraint on razorpay_payment_id is the idempotency guard — a replayed/duplicate verify
-- call for the same payment cannot double-credit the wallet.
-- Run in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.wallet_recharges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount             numeric NOT NULL CHECK (amount > 0),
  razorpay_order_id  text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  status             text NOT NULL DEFAULT 'created', -- 'created' | 'paid' | 'failed'
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wallet_recharges_customer ON public.wallet_recharges (customer_id);

-- ── RLS: writes/reads go through the backend (service role) only — no client-direct access ──
ALTER TABLE public.wallet_recharges ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wallet_recharges' AND policyname='service role full access') THEN
    CREATE POLICY "service role full access" ON public.wallet_recharges FOR ALL USING (auth.role() = 'service_role');
  END IF;
END
$$;
