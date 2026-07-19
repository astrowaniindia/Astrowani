-- Vendor payout (bank/UPI) details.
--
-- WHY: withdrawal_requests already lets a vendor request a payout and lets admin
-- approve/reject/mark it paid, but nowhere does the app capture WHERE to actually send
-- the money — admin has no bank/UPI details to act on. Adds payout fields to astrologers
-- (edited from EditProfile) and snapshots them onto each withdrawal_requests row at
-- request time, so a later profile edit doesn't retroactively change what a past,
-- already-processed request says was used.
-- No RLS — matches astrologers/withdrawal_requests, which the backend already writes
-- to with the anon-key client. Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.astrologers
  ADD COLUMN IF NOT EXISTS bank_account_holder text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_ifsc text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS upi_id text;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS bank_account_holder text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_ifsc text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS upi_id text;
