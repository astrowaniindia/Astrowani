-- withdrawal_requests: record the TDS withheld and what is actually payable.
--
-- WHY THIS IS NOT A UI-ONLY CHANGE
--   The astrologer is now shown "you will receive ₹2,250" before confirming a
--   ₹2,500 withdrawal. The admin pays these out BY HAND from the figure on the
--   admin dashboard's Withdrawals page, which read `amount` — the gross. Without
--   storing the split, the app would promise the net while the dashboard showed
--   the gross, and every single payout would be over by the TDS.
--
-- THE MONEY SEMANTICS (keep these straight)
--   amount      = gross: what leaves the astrologer's wallet balance on request.
--   tds_amount  = tax withheld at source, ROUND(gross * tds_percent/100, 2).
--   net_amount  = amount - tds_amount = what the admin actually transfers.
--   tds_percent = the rate APPLIED TO THIS ROW, stored rather than assumed, so a
--                 future rate change cannot retro-reinterpret old withdrawals.
--
--   net is the REMAINDER (amount - tds), not an independently rounded figure, so
--   the two parts always sum to exactly the gross — same rule as the 50/50
--   consultation split in sql/process_session_billing.sql.
--
--   A REJECTED request still refunds the GROSS (adminRoutes.js), because the
--   gross is what was put on hold; TDS is only ever withheld from money that is
--   actually paid out. Nothing here changes that.
--
-- EXISTING ROWS
--   Backfilled to tds 0 / net = amount, which is the truth: no TDS was withheld
--   from withdrawals requested before this shipped. They must not retroactively
--   appear to have had tax taken off.

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS tds_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount  numeric;

-- Pre-existing rows: paid in full, no deduction.
UPDATE public.withdrawal_requests
   SET net_amount = amount
 WHERE net_amount IS NULL;

-- Self-verifying tail: a half-applied migration here means mispaid astrologers.
DO $$
DECLARE
  missing int;
  inconsistent int;
BEGIN
  SELECT count(*) INTO missing
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'withdrawal_requests'
     AND column_name IN ('tds_percent', 'tds_amount', 'net_amount');
  IF missing <> 3 THEN
    RAISE EXCEPTION 'withdrawal_requests is missing one of tds_percent/tds_amount/net_amount (found %)', missing;
  END IF;

  SELECT count(*) INTO inconsistent
    FROM public.withdrawal_requests
   WHERE net_amount IS NULL
      OR round(amount - tds_amount, 2) <> round(net_amount, 2);
  IF inconsistent > 0 THEN
    RAISE EXCEPTION '% withdrawal row(s) where net_amount <> amount - tds_amount', inconsistent;
  END IF;
END $$;
