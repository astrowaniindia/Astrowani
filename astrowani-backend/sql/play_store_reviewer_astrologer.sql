-- Google Play reviewer test account — VENDOR (astrologer) app.
--
-- WHY: unlike the customer app, astrologer accounts are never auto-created on OTP
-- verify (see index.js's /api/users/mobile-otp-verify — the astrologer branch only
-- looks up an EXISTING row by phone_number; a brand-new number is routed to the full
-- Registration flow instead). The fixed reviewer OTP (index.js's
-- PLAY_STORE_REVIEWER_PHONE/PLAY_STORE_REVIEWER_OTP, phone 9999999999 / OTP 123456)
-- only skips the SMS — it does nothing useful unless a real astrologers row already
-- exists for that phone number. This script creates that row: fully approved, profile
-- complete, all three services enabled, so a reviewer logging in lands straight on a
-- normal working dashboard instead of a "complete your profile" wall or a pending-
-- approval screen.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & Run. Safe to re-run (checks for
-- an existing row itself — this table (an original ad-hoc dashboard table, not one of
-- this repo's schema-file tables) has no UNIQUE constraint on phone_number to build a
-- plain ON CONFLICT upsert on, so this uses an explicit existence check instead).
--
-- Give Play Console's Sign in details EXACTLY: phone 9999999999, OTP 123456.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.astrologers WHERE phone_number = '9999999999') THEN
    UPDATE public.astrologers SET
      approval_status = 'approved',
      is_suspended = false,
      is_chat_enabled = true,
      is_call_enabled = true,
      is_video_call_enabled = true,
      chat_charge_per_minute = 5,
      call_charge_per_minute = 5,
      video_charge_per_minute = 8
    WHERE phone_number = '9999999999';
  ELSE
    INSERT INTO public.astrologers (
      phone_number, first_name, last_name, email, gender, experience,
      languages, specialties, profile_pic_url,
      approval_status, is_suspended, is_available,
      is_chat_enabled, is_call_enabled, is_video_call_enabled,
      chat_charge_per_minute, call_charge_per_minute, video_charge_per_minute,
      wallet_balance, today_earnings, total_earnings
    ) VALUES (
      '9999999999', 'Play Store', 'Reviewer', 'reviewer@astrowani.com', 'Male', 10,
      ARRAY['Hindi','English']::text[], ARRAY[]::uuid[],
      'https://backend.astrowani.com/public/images/banner1.jpeg',
      'approved', false, true,
      true, true, true,
      5, 5, 8,
      0, 0, 0
    );
  END IF;
END
$$;
