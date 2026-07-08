-- Vendor withdrawal requests schema.
--
-- WHY: The vendor Wallet screen's "Top Up" button was a dead no-op (vendors don't top
-- up — they only earn). Replaced with a real "Request Withdrawal" flow: vendor requests
-- a payout, the amount is deducted from wallet_balance immediately (put on hold) and a
-- pending row is created here; admin approves/rejects/marks paid from the admin panel.
-- No RLS — matches astrologers/vendor_wallet_transactions, which the backend already
-- writes to with the anon-key client. Run in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  amount        numeric NOT NULL CHECK (amount > 0),
  status        text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | paid
  admin_note    text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_astrologer ON public.withdrawal_requests (astrologer_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests (status);
