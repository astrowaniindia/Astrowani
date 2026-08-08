-- ============================================================================
-- Astrowani — access control hardening, Phase 2
-- ============================================================================
-- THE PROBLEM THIS FIXES
--
-- Both apps ship a Supabase publishable ("anon") key. That is normal and by
-- design — the key is public, and RLS is what makes it safe. But RLS is OFF on
-- the core tables, so today that public key grants anyone:
--
--   * SELECT on customers      -> every user's name, mobile, email, DOB, birth
--                                 time and birthplace, and wallet balance
--   * SELECT on astrologers    -> including bank_account_number, bank_ifsc, upi_id
--   * SELECT on chat_messages  -> every private consultation transcript
--   * INSERT/UPDATE on customers, astrologers, chat_sessions, call_requests,
--     chat_requests, chat_messages, wallet_transactions
--
-- That last line is the severe one: wallet_balance and *_charge_per_minute are
-- directly writable by anyone who extracts the key from the APK. Verified
-- against the live project on 2026-08-07 by INSERTing and then deleting probe
-- rows in customers, astrologers, chat_sessions and call_requests.
--
-- WHY THIS CANNOT BE FIXED BY "JUST TURNING RLS ON"
--
-- The apps do not use Supabase Auth. They authenticate against our own Express
-- backend, which issues its own JWT. Supabase therefore sees every app request
-- as the anonymous role, and `auth.uid()` inside a policy is always NULL. There
-- is no policy that can express "this customer may read their own row", because
-- the database has no idea who the caller is. Enabling RLS today would not
-- secure the app — it would break every direct-from-app query at once.
--
-- So the fix is sequenced. Each step below is safe on its own and each one
-- reduces exposure. Do them in order.
-- ============================================================================


-- ############################################################################
-- STEP 0 — ROTATE THE JWT SECRET FIRST (no SQL; do this before anything else)
-- ############################################################################
-- JWT_SECRET in the production .env is currently the exact string hardcoded as
-- the fallback in index.js line 277 and written out in CLAUDE.md:
-- anyone reading the repo can mint a valid token for any customer, any
-- astrologer, or the admin dashboard. Set a fresh random 32+ byte secret in the
-- VPS environment, delete the hardcoded fallback from index.js and
-- adminRoutes.js so the server refuses to boot without it, and redact the value
-- from CLAUDE.md. Every user is signed out (tokens are 30d, so this is a
-- one-time re-login) — that is the intended effect.


-- ############################################################################
-- STEP 1 — BACKEND SWITCHES TO THE SERVICE-ROLE CLIENT (code change, no SQL)
-- ############################################################################
-- index.js line 28 currently creates the main `supabase` client with the ANON
-- key, and most route handlers read through it. That is why nothing below can
-- be locked down yet: tightening anon privileges would break our own backend.
-- The backend runs on a trusted VPS and already holds the service-role key —
-- it should use it for everything. Change:
--     const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
-- to the service-role client (the same one `supabaseService` already uses).
-- This only grants the backend more access, so it cannot break any existing
-- route. Do this and deploy before running STEP 2.


-- ############################################################################
-- STEP 2 — REVOKE THE DANGEROUS PRIVILEGES FROM anon
-- ############################################################################
-- Surgical: column-level privileges, not RLS. Nothing here depends on knowing
-- who the caller is, so it works with our custom-JWT setup as-is. After STEP 1
-- the backend is unaffected; the apps keep exactly the columns they actually
-- write today.

-- ── customers: apps never write this table directly (all writes go through the
--    backend). Reads of other people's PII should never have been possible.
REVOKE ALL ON public.customers FROM anon;

-- ── astrologers: the vendor app DOES write this table directly (service
--    toggles, GO LIVE, EditProfile, FCM token). Keep exactly those columns and
--    nothing else. Note what is deliberately absent: wallet_balance,
--    today_earnings, total_earnings, approval_status, is_suspended.
REVOKE ALL ON public.astrologers FROM anon;
GRANT SELECT (
  id, first_name, last_name, gender, experience, languages, specialties,
  profile_pic_url, bio, average_rating, total_reviews,
  call_charge_per_minute, chat_charge_per_minute, video_charge_per_minute,
  is_call_enabled, is_chat_enabled, is_video_call_enabled,
  is_available, is_online, is_live, approval_status, is_suspended
) ON public.astrologers TO anon;
-- UPDATED 2026-08-08: EditProfile.js (name, contact, experience, languages, bio, photo,
-- charges, bank details) now goes through PUT /api/vendor/profile (astroId from the
-- vendor's own JWT), because column-level grants have no row-ownership concept — anyone
-- holding the anon key could otherwise rewrite ANY astrologer's charge rates, not just
-- their own. Only the columns still written directly by other screens remain grantable:
-- fcm_token (Firebase.js) and the two toggle groups (HomeScreen.js).
GRANT UPDATE (
  fcm_token,
  is_call_enabled, is_chat_enabled, is_video_call_enabled, is_available, is_online
) ON public.astrologers TO anon;
-- Bank details are writable only via the backend now, and were never readable by
-- anon — absent from the GRANT SELECT list above. Only the backend and admin
-- dashboard, both service-role, can read or write them.
--
-- NOTE: astrologer registration (VerifyOtp.js) currently INSERTs into this table
-- from the app; INSERT is intentionally not granted back. Move registration to a
-- backend endpoint before deploying this, or that signup path will fail.

-- ── Ledgers: append-only from the app's point of view, and not even that.
--    All writes already go through the backend. No app reads them directly
--    either (wallet history is served by /api/wallet/*).
REVOKE ALL ON public.wallet_transactions        FROM anon;
REVOKE ALL ON public.vendor_wallet_transactions FROM anon;

-- ── Sessions: per_minute_charge lives here, and the vendor app inserts the row.
--    Until that insert moves behind the backend (STEP 3) we cannot revoke
--    INSERT, but we can stop anon rewriting the rate or the billing clock on an
--    existing session.
REVOKE ALL ON public.chat_sessions FROM anon;
GRANT SELECT, INSERT ON public.chat_sessions TO anon;
GRANT UPDATE (is_active, ended_at) ON public.chat_sessions TO anon;

-- ── Requests: apps legitimately insert and update status. Nothing else.
REVOKE ALL ON public.call_requests FROM anon;
GRANT SELECT, INSERT ON public.call_requests TO anon;
GRANT UPDATE (status, responded_at, session_id) ON public.call_requests TO anon;

REVOKE ALL ON public.chat_requests FROM anon;
GRANT SELECT, INSERT ON public.chat_requests TO anon;
GRANT UPDATE (status, responded_at) ON public.chat_requests TO anon;

-- ── Messages: insert + read only; never editable or deletable after the fact.
REVOKE ALL ON public.chat_messages FROM anon;
GRANT SELECT, INSERT ON public.chat_messages TO anon;

-- ── Read-only content the apps display. Writes belong to the admin dashboard.
REVOKE ALL ON public.banners, public.blogs, public.categories, public.thoughts,
              public.gifts, public.remedy_items, public.astro_services,
              public.app_settings, public.live_sessions
  FROM anon;
GRANT SELECT ON public.banners, public.blogs, public.categories, public.thoughts,
                public.gifts, public.remedy_items, public.astro_services,
                public.app_settings, public.live_sessions
  TO anon;

-- ── Nothing anonymous has any business here at all.
REVOKE ALL ON public.admins, public.admin_wallet, public.admin_wallet_transactions,
              public.withdrawal_requests, public.orders, public.wallet_recharges,
              public.gift_transactions, public.referrals, public.astrologer_reports,
              public.astrologer_waitlist, public.notification_broadcasts
  FROM anon;

-- Make sure future tables do not silently inherit broad access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;


-- ############################################################################
-- STEP 3 — MOVE THE REMAINING DIRECT WRITES BEHIND THE BACKEND (code change)
-- ############################################################################
-- After STEP 2 the exposure is small but not zero: anon can still INSERT
-- chat_sessions / call_requests / chat_requests / chat_messages, which means a
-- forged client can still fabricate a session or read another room's messages
-- by guessing a room_id. Closing that means these writes move to backend
-- endpoints that check the caller's JWT:
--
--   vendors  incomingRequestActions.js  chat_sessions INSERT  -> POST /api/session/accept
--   vendors  VerifyOtp.js               astrologers   INSERT  -> POST /api/vendor/register
--   customer useChatRequest.js          chat_requests INSERT  -> POST /api/chat/initiate
--   customer Home/Call/Video/AstrologerInfo/ExpertsList/ReusableList
--                                       call_requests INSERT  -> already exists:
--                                         /api/call/initiate creates the row itself
--   both     ChatSessionScreen / VendorChatSession / PersonToPersonChat
--                                       chat_messages INSERT  -> POST /api/chat/message
--
-- The call_requests one is the cheapest win: /api/call/initiate is already
-- called first at all five sites and already has the receiver id — having it
-- write the row removes five duplicated client inserts at once.


-- ############################################################################
-- STEP 4 — ENABLE RLS (only meaningful once STEP 3 is done)
-- ############################################################################
-- With writes behind the backend, every remaining table can go service-role
-- only, matching the pattern the newer schema files already use:
--
--   ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "service role full access" ON public.<t>
--     FOR ALL USING (auth.role() = 'service_role');
--
-- Apply to: customers, astrologers, chat_sessions, chat_requests, call_requests,
-- chat_messages, wallet_transactions, vendor_wallet_transactions.
--
-- IMPORTANT: the apps' Supabase Realtime subscriptions (astrologers list sync,
-- call_requests status, chat_messages, wallet balance in the nav bar) run as
-- anon and WILL stop receiving events when RLS closes those tables. Each one
-- needs either a narrow SELECT policy or a move to the Socket.io channel the
-- backend already runs. Plan that before flipping the switch — it is the single
-- most likely thing to break, and it breaks silently.


-- ############################################################################
-- VERIFY
-- ############################################################################
SELECT table_name, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columns
  FROM information_schema.column_privileges
 WHERE grantee = 'anon' AND table_schema = 'public'
 GROUP BY table_name, privilege_type
 ORDER BY table_name, privilege_type;

SELECT relname AS table_name, relrowsecurity AS rls_enabled
  FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
 ORDER BY relrowsecurity DESC, relname;
