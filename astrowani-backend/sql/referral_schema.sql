-- Real referral program (replaces the customer app's ReferAndEarnScreen.js mock, which
-- showed every user the identical hardcoded code and had a dead "Get" button).
--
-- Flow: every customer gets a unique referral_code (generated lazily on first request or
-- at signup). A new signup can supply someone else's code, creating a 'pending' referrals
-- row. The referrer is only rewarded once the REFERRED customer completes their first
-- session (chat_sessions.ended_at set) — proof of genuine engagement, not just a signup —
-- handled in sessionManager.js's terminateSession().
-- No RLS — matches customers/wallet_transactions, written by the app's anon/service client.
-- Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

CREATE TABLE IF NOT EXISTS public.referrals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  referred_customer_id   uuid NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  referral_code          text NOT NULL,
  status                 text NOT NULL DEFAULT 'pending', -- pending | rewarded
  reward_amount          numeric NOT NULL DEFAULT 50,
  created_at             timestamptz NOT NULL DEFAULT now(),
  rewarded_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_customer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals (referred_customer_id);
