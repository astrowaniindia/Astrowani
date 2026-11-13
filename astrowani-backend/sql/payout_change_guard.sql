-- payout_change_guard — when an astrologer last REPLACED their bank/UPI payout details.
-- Security audit 2026-11-13. APPLIED 2026-11-14.
--
-- Set by PUT /api/vendor/profile when existing payout details are replaced (not when
-- they are added for the first time). /vendor/wallet/withdraw refuses new requests for
-- 48 hours after it, and the admin withdrawals list shows it, so a hijacked account
-- cannot quietly redirect earnings. The astrologer is alerted at the moment of change.

ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS payout_details_changed_at timestamptz;

-- astrologers is partly readable with the publishable key through COLUMN grants. A new
-- column gets none unless someone grants it, but say so explicitly and verify.
REVOKE SELECT (payout_details_changed_at) ON public.astrologers FROM anon, authenticated;

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.astrologers', 'payout_details_changed_at', 'SELECT') THEN
    RAISE EXCEPTION 'payout_change_guard: anon can read payout_details_changed_at';
  END IF;
END $$;
