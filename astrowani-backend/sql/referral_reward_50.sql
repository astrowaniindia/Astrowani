-- Referral reward raised from ₹25 back to ₹50. Reverses referral_reward_25.sql
-- (which had itself reduced the original ₹50 default from referral_schema.sql).
--
-- Same policy as that file: change the default for future referrals AND
-- retroactively update any not-yet-paid ('pending') rows — a pending referral
-- hasn't been honoured yet, so paying the new, higher amount is both simpler and
-- fairer than tracking two rates. Already-'rewarded' historical rows are left
-- untouched, so the ledger stays an accurate record of what was actually paid.
--
-- KEEP IN SYNC: REFERRAL_REWARD_AMOUNT in astrowani-backend/index.js is the
-- number the app DISPLAYS ("Get ₹50 per friend"). It is not what gets credited —
-- the credit uses referrals.reward_amount from the row itself — but if the two
-- disagree the app advertises one amount and pays another.
--
-- Idempotent.
ALTER TABLE public.referrals ALTER COLUMN reward_amount SET DEFAULT 50;
UPDATE public.referrals SET reward_amount = 50 WHERE status = 'pending';

-- Report what changed, so running this in the SQL editor confirms it took.
DO $$
DECLARE
  v_default text;
  v_pending integer;
BEGIN
  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'reward_amount';

  SELECT count(*) INTO v_pending
    FROM public.referrals WHERE status = 'pending' AND reward_amount = 50;

  RAISE NOTICE 'referrals.reward_amount default is now: %', v_default;
  RAISE NOTICE 'pending referrals now at Rs.50: %', v_pending;
END $$;
