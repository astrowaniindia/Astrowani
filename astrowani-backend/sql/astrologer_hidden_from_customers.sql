-- Test / App Review astrologer accounts (2026-09-16). APPLIED.
--
-- App Store and Play Store reviewers sign in to the astrologer app with the fixed
-- reviewer number (9999999999, OTP 123456 -- PLAY_STORE_REVIEWER_PHONE in index.js).
-- That account has to be APPROVED or the reviewer only ever sees "pending approval".
-- But an approved, profile-complete astrologer is listed to real customers, who could
-- then pay to call a fake account. hidden_from_customers lets it be both: usable in
-- the astrologer app, absent from every customer list
-- (astrologerVisibleToCustomers in index.js).
ALTER TABLE public.astrologers
  ADD COLUMN IF NOT EXISTS hidden_from_customers boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.astrologers.hidden_from_customers IS
  'Test / App Review accounts: can sign in and use the astrologer app, but never appear in any customer-facing list.';

-- The reviewer account. Approve it only AFTER a backend that checks
-- hidden_from_customers is deployed, or it is briefly listed to customers.
UPDATE public.astrologers
  SET hidden_from_customers = true,
      approval_status = 'approved',
      is_suspended = false,
      admin_notes = 'App Store / Play Store REVIEWER test account (phone 9999999999, OTP 123456). Approved so reviewers can use the astrologer app; hidden_from_customers keeps it out of every customer list. Do not delete.'
  WHERE phone_number = '9999999999';
