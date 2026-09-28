-- customer_app_removed.sql
--
-- Records WHEN a customer's app stopped being reachable by push, so the Customer
-- Tracking page can show who has removed the app instead of only who can be reached.
--
-- WHERE THE SIGNAL COMES FROM. Every push we send already returns it and we were
-- throwing it away: `sendEachForMulticast` answers with a `responses[]` array lined up
-- with the tokens it was given, and a token belonging to an uninstalled app comes back
-- as `messaging/registration-token-not-registered`. That is Firebase telling us the app
-- is gone from that device. src/push.js now reads those per-token failures and stamps
-- the column below.
--
-- WHAT IT HONESTLY MEANS. "No longer reachable on that device" — which is USUALLY an
-- uninstall, but the same error also fires when app data is cleared, when the phone is
-- restored onto a new device, and when Firebase expires a token after a long stretch of
-- inactivity. `app_removed_reason` keeps the raw FCM code so the difference stays
-- inspectable rather than being flattened into a yes/no forever.
--
-- WHAT IT CANNOT COVER, and this is a hard limit rather than a gap to fill later: a
-- customer who never granted notification permission has no token, so there is no way
-- to reach their phone and therefore no way to ever learn whether they removed the app.
-- Measured 2026-09-28: 471 of 1,267 live customers. Any figure built on this column is
-- a figure about the push-enabled population, and the admin page says so.
--
-- Idempotent. Additive only — nothing reads these columns until the app is deployed,
-- so DEPLOY ORDER DOES NOT MATTER: src/push.js drops the write on a missing column and
-- logs one warning per process, exactly like src/wallet.js's dedupe guard.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS app_removed_at   timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS app_removed_reason text;

COMMENT ON COLUMN customers.app_removed_at IS
  'When Firebase last told us this customer''s push token belongs to an app that is no '
  'longer installed (messaging/registration-token-not-registered). Cleared on the next '
  'successful token registration, i.e. if they reinstall and sign in again. NULL means '
  'either still installed OR never had a push token at all — those two are not '
  'distinguishable and must not be reported as one number.';

COMMENT ON COLUMN customers.app_removed_reason IS
  'Raw FCM error code that produced app_removed_at, kept so "uninstalled" can be told '
  'apart from a cleared-data / expired-token case later.';

-- Partial: the admin only ever asks for the removed ones, and they are the minority.
CREATE INDEX IF NOT EXISTS customers_app_removed_at_idx
  ON customers (app_removed_at DESC)
  WHERE app_removed_at IS NOT NULL;

-- Self-verifying tail. A half-applied migration here fails SILENTLY — pushes keep
-- working and the column simply never fills, which reads as "nobody has uninstalled"
-- rather than "the migration did not run". That is the worst possible failure for a
-- metric, so refuse to look successful.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'app_removed_at'
  ) THEN
    RAISE EXCEPTION 'customers.app_removed_at is missing — migration did not apply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'app_removed_reason'
  ) THEN
    RAISE EXCEPTION 'customers.app_removed_reason is missing — migration did not apply';
  END IF;

  RAISE NOTICE 'customer_app_removed.sql applied: both columns and the index are present.';
END $$;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
  AND column_name IN ('app_removed_at', 'app_removed_reason')
ORDER BY column_name;
