-- astrowani-backend/sql/customer_platform.sql
--
-- Which platform each customer is on — iPhone or Android.
--
-- WHY THIS EXISTS: Astrowani is becoming four store listings (customer x Play,
-- customer x App Store, vendor x Play, vendor x App Store) over ONE backend, ONE
-- database and ONE admin dashboard. That is deliberate and is not changing — nobody
-- forks a codebase per store. But the admin could not SEE the difference, and so
-- could not answer any of:
--   - how many customers are on iPhone?
--   - is wallet recharge failing only on iOS?
--   - this refund — Razorpay (Android) or Apple IAP (iOS)?
--   - which platform produced that crash?
-- `vendor_devices.platform` has recorded this for ASTROLOGERS since 2026-09 (written at
-- login from the `devicePlatform` field the vendor app sends). The customer side had no
-- equivalent and the customer app sent nothing at all.
--
-- IT MUST EXIST BEFORE THE FIRST iPHONE SIGNS UP. Platform is not backfillable: there is
-- no record anywhere of what a past signup was running. Applying this after the App Store
-- launch means every iPhone customer from day one is permanently unattributable.
--
-- IT ALSO SEPARATES TWO THINGS THAT CURRENTLY LOOK IDENTICAL. `acquisition_source` is
-- Android-only (it comes from the Play Install Referrer, which has no iOS equivalent
-- without a paid attribution SDK), so EVERY iPhone customer lands there as null — mixed
-- in with every pre-2026-09 Android customer and every sideload. Null in that column
-- means "unknown", and until now there was no way to tell "iPhone, attribution
-- impossible" apart from "Android, attribution missing". This column is that way.

-- == 1. Columns =============================================================
--
-- TWO columns, and the split is the important part of this file:
--
--   platform         the platform they are using NOW. Rewritten on EVERY login, latest
--                    wins. This answers the operational question — "is iOS recharge
--                    broken?", "which platform is this support ticket from?".
--
--   signup_platform  the platform the account was CREATED on. Written once, on the
--                    branch that creates the row, and never touched again. This answers
--                    the reporting question — "how many of last month's signups were
--                    iPhone?", "is the App Store listing actually converting?".
--
-- WHY NOT ONE COLUMN. A single latest-wins column cannot answer the signup question once
-- anybody switches handset, and that history is unrecoverable afterwards — which is the
-- same reason this whole migration is urgent rather than optional. A single create-only
-- column cannot answer the operational one at all.
--
-- This mirrors a distinction the codebase already makes and should keep making:
-- `acquisition_source` is stamped on the create branch ONLY, because where an account
-- came from is a property of the account; `fcm_token` is rewritten on every login,
-- because reachability is a property of the device in someone's hand right now.
--
-- The CHECK matches vendor_devices.platform exactly, so the two tables stay comparable
-- and a typo cannot invent a third platform. 'unknown' is for a request that sent
-- SOMETHING we did not recognise. A request that sent NOTHING writes nothing at all and
-- leaves these null — absence means "the build did not tell us", which is not the same
-- fact and must not be flattened into 'unknown' (see index.js's mobile-otp-verify).
--
-- Both stay null forever for every customer who signed up before this shipped, and until
-- a given customer next logs in on a build carrying the app-side change.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS platform text
  CHECK (platform IN ('ios', 'android', 'unknown'));

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS signup_platform text
  CHECK (signup_platform IN ('ios', 'android', 'unknown'));

-- == 2. Index ===============================================================
-- The admin customer list filters by platform. Partial, because the column is null for
-- every row that exists today and those rows are never selected BY platform — they are
-- counted as "Unknown" from the full set the page already holds.
CREATE INDEX IF NOT EXISTS customers_platform_idx
  ON customers (platform)
  WHERE platform IS NOT NULL;

-- == 3. No grants ===========================================================
-- Deliberately absent. `anon` and `authenticated` hold ZERO privileges anywhere in
-- public as of the 2026-09-23/30 hardening passes (hardening_15 … hardening_17), and
-- every write to this database goes through the backend on the service role. Adding a
-- grant here would reopen exactly what those migrations closed. The service role
-- bypasses grants and RLS, so it needs nothing.

-- == 4. Verify ==============================================================
-- A half-applied migration here fails SILENTLY in both directions, which is why this
-- tail raises instead of trusting the ALTERs above:
--   - the backend's write path treats a missing column as best-effort and carries on
--     (isMissingColumnError), so logins and signups keep working and every customer
--     would read "Unknown" forever with nothing to indicate why; and
--   - the admin list route degrades to a column set WITHOUT platform rather than 500ing,
--     so the page looks fine and simply never shows the field.
-- Neither surfaces as an error anywhere a human would see it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'platform'
  ) THEN
    RAISE EXCEPTION 'customers.platform was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'signup_platform'
  ) THEN
    RAISE EXCEPTION 'customers.signup_platform was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'customers_platform_idx'
  ) THEN
    RAISE EXCEPTION 'customers_platform_idx was not created';
  END IF;

  -- The CHECKs are what stop a client-supplied string reaching a column the admin reads
  -- back. If the columns exist without them, the whitelist in src/devicePlatform.js is
  -- the only thing left standing and a future caller that forgets it writes anything.
  IF (
    SELECT count(*) FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema = 'public' AND ccu.table_name = 'customers'
      AND ccu.column_name IN ('platform', 'signup_platform')
      AND cc.check_clause ILIKE '%android%'
  ) < 2 THEN
    RAISE EXCEPTION 'the platform CHECK constraints are missing — a client string could reach these columns';
  END IF;

  RAISE NOTICE 'customer_platform: both columns, the index and both CHECKs are present.';
END $$;

-- What is actually there now, and how many rows are already attributed (0 on a fresh
-- apply — they fill in as customers log in on a build that sends the field).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
  AND column_name IN ('platform', 'signup_platform')
ORDER BY column_name;

SELECT
  count(*)                                        AS total_customers,
  count(platform)                                 AS with_platform,
  count(signup_platform)                          AS with_signup_platform
FROM customers;
