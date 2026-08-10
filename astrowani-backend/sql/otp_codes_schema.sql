-- OTPs were stored only in an in-memory Map (`otpStore` in index.js), wiped
-- clean every time the backend process restarts — which `pm2 restart`
-- (triggered by every single deploy) does. A user who requested an OTP right
-- before/during a deploy would have it silently vanish server-side: the SMS
-- still arrives, but verify fails with "No OTP requested for this number"
-- (easy to misread as "the OTP never arrived"), and only a fresh Resend
-- (issued after the restart) actually works. Same failure class as the
-- earnings-reset restart bug fixed earlier — moving to durable storage fixes
-- it the same way.
CREATE TABLE IF NOT EXISTS public.otp_codes (
  phone_number text PRIMARY KEY,
  otp          text NOT NULL,
  session_id   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Service-role only — no anon access needed, the backend is the only reader/writer.
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
