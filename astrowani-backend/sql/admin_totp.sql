-- admin_totp — two-factor login for the admin dashboard (security audit 2026-11-13).
-- APPLIED 2026-11-14.
--
-- An authenticator-app code (RFC 6238 TOTP, any app: Google Authenticator, Microsoft
-- Authenticator, 1Password …) on top of the password. See src/adminTotp.js.
--
--   totp_secret          the active secret (base32). Never sent back to the browser
--                        after setup.
--   totp_pending_secret  a secret shown during setup, promoted to totp_secret only after
--                        the admin proves their app produces a valid code. Until then a
--                        half-finished setup cannot lock anybody out.
--   totp_last_step       the 30-second step of the last accepted code, so one code cannot
--                        be replayed within its validity window.
--
-- `admins` is service-role only (hardening_15); nothing here changes that.

ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS totp_pending_secret text;
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS totp_last_step bigint;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema = 'public' AND table_name = 'admins'
               AND grantee IN ('anon', 'authenticated')) THEN
    RAISE EXCEPTION 'admin_totp: anon/authenticated hold a grant on admins';
  END IF;
END $$;
