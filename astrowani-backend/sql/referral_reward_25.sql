-- Referral reward reduced from ₹50 to ₹25. Changes the default for future
-- referrals AND retroactively updates any not-yet-paid ('pending') rows —
-- already-'rewarded' historical rows are left untouched (accurate record of
-- what was actually paid).
ALTER TABLE public.referrals ALTER COLUMN reward_amount SET DEFAULT 25;
UPDATE public.referrals SET reward_amount = 25 WHERE status = 'pending';
