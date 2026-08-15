-- OTP hardening — makes the OTP flow safe for production-scale signup/login
-- traffic. Additive and idempotent; safe to re-run.
--
-- Three problems this closes, all present in the original otp_codes table:
--
-- 1. BRUTE FORCE. /api/users/mobile-otp-verify counted nothing. A wrong OTP
--    returned 400 and left the code live, so the 6-digit space (1,000,000
--    combinations) could be ground down with unlimited concurrent guesses
--    inside the 5-minute window. `attempts` + a server-side cap fixes this.
--
-- 2. SEND FLOODING. Nothing server-side limited how often one phone number
--    could be sent an OTP — the 60s cooldown lived only in the two apps and
--    was bypassed by calling the API directly. Every send is a billed SMS,
--    and a flood also congests the carrier queue, which degrades delivery
--    for real users. `last_sent_at` + `sends_in_window` fix this per NUMBER,
--    which is the correct dimension (see note on CGNAT below).
--
-- 3. PLAINTEXT OTPs. Anyone who could read this table (or a leaked service
--    key) could read live OTPs and log in as any user mid-flow. `otp_hash`
--    stores an HMAC instead, so the table alone is not enough — the server
--    secret is also required. A plain hash would be useless here: 1,000,000
--    candidates is instant to enumerate offline, so the HMAC key is the
--    whole point.
--
-- NOTE ON WHY THROTTLING IS PER-NUMBER, NOT PER-IP: Indian mobile carriers
-- use CGNAT, so thousands of subscribers share one public IP address. A
-- per-IP OTP budget is therefore consumed by strangers, and legitimate
-- first-time signups get rejected through no fault of their own. That is the
-- most likely cause of the production 429s on vendor signup (2026-08-15).
-- Per-number limits target the actual abuse (one number being flooded, or
-- one number being brute-forced) without punishing shared-IP users.

-- --------------------------------------------------------------------------
-- 1. Columns
-- --------------------------------------------------------------------------

-- Failed verify attempts for the CURRENT code. Reset to 0 on every new send.
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- When the most recent OTP SMS for this number went out. Drives the
-- server-side resend cooldown.
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz NOT NULL DEFAULT now();

-- Rolling send-count window: how many OTPs this number has been sent since
-- window_started_at. Caps sustained flooding of a single number over hours,
-- which the short cooldown alone would not stop.
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS sends_in_window integer NOT NULL DEFAULT 1;

ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS window_started_at timestamptz NOT NULL DEFAULT now();

-- HMAC-SHA256 of the OTP. Nullable so existing in-flight rows written by the
-- old code path keep verifying against the plaintext `otp` column during the
-- deploy overlap; new rows populate this and leave `otp` NULL.
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS otp_hash text;

-- The original schema declared `otp` NOT NULL. New rows store only the hash,
-- so that constraint has to go or every new insert fails.
ALTER TABLE public.otp_codes
  ALTER COLUMN otp DROP NOT NULL;

-- --------------------------------------------------------------------------
-- 2. Index
-- --------------------------------------------------------------------------

-- Supports the periodic purge of expired rows. Without it that sweep is a
-- full scan, which grows with every distinct phone number ever seen.
CREATE INDEX IF NOT EXISTS otp_codes_expires_at_idx
  ON public.otp_codes (expires_at);

-- --------------------------------------------------------------------------
-- 3. Housekeeping
-- --------------------------------------------------------------------------

-- One-off cleanup of rows left behind before the purge existed. The backend
-- also purges on an interval from now on (see sessionManager).
DELETE FROM public.otp_codes WHERE expires_at < now() - interval '1 day';
