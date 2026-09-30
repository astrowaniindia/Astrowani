-- Free intro call: the astrologer's own opt-in toggle.
--
-- Until now the instant free-call pool was purely admin-curated
-- (app_settings.free_call_offer.instantPoolAstrologerIds). This adds a switch the
-- astrologer owns, shown on their dashboard above the chat/call/video toggles:
-- switching it ON puts them in the list customers pick from, OFF takes them out.
--
-- The admin list is KEPT and becomes an override on top: anyone pinned there is in the
-- pool whether they switched on or not, which is why the vendor app shows a pinned
-- astrologer's toggle as locked rather than letting it flip back.
--
-- The "complete N calls before you may switch off" rule is enforced in
-- src/freeCallRoutes.js (POST /api/vendor/free-intro-call), not here: the count it reads
-- is free_call_bookings.status = 'completed', which no column default can express.
--
-- Idempotent. Safe to run before or after the backend that uses it: without the column
-- the backend latches it off and the admin list supplies the pool exactly as before.

-- 1. The column ------------------------------------------------------------------
ALTER TABLE public.astrologers
  ADD COLUMN IF NOT EXISTS free_intro_call_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.astrologers.free_intro_call_enabled IS
  'Astrologer has opted in to taking free 12-minute introductory calls. Set from the '
  'vendor app dashboard via POST /api/vendor/free-intro-call, which refuses to switch it '
  'off until they have completed free_call_offer.minFreeCallsBeforeOptOut calls.';

-- 2. Only the pool is ever scanned by this, and it is small — but the customer-facing
--    instant list reads it on every request, so give it an index rather than a seq scan
--    once the astrologer table grows.
CREATE INDEX IF NOT EXISTS astrologers_free_intro_call_idx
  ON public.astrologers (id)
  WHERE free_intro_call_enabled = true;

-- 3. Backfill: anyone the admin already put in the instant pool is, in effect, already
--    opted in. Doing this means the day this ships nothing changes for any customer —
--    the same astrologers appear in the same list — and those astrologers simply gain a
--    switch they did not have before. Without it a deploy could empty the pool, and an
--    empty instant pool silently falls back to the scheduled booking flow.
DO $$
DECLARE
  offer jsonb;
  ids   text[];
  n     integer := 0;
BEGIN
  SELECT value::jsonb INTO offer FROM public.app_settings WHERE key = 'free_call_offer';
  IF offer IS NULL THEN
    RAISE NOTICE 'free_call_offer is not set — nothing to backfill.';
    RETURN;
  END IF;

  -- instantPoolAstrologerIds, or the scheduled pool when instant was never curated
  -- separately (loadOffer applies the same fallback).
  SELECT COALESCE(
           NULLIF(ARRAY(SELECT jsonb_array_elements_text(offer -> 'instantPoolAstrologerIds')), '{}'),
           ARRAY(SELECT jsonb_array_elements_text(offer -> 'poolAstrologerIds'))
         )
    INTO ids;

  IF ids IS NULL OR array_length(ids, 1) IS NULL THEN
    RAISE NOTICE 'No pool configured — nothing to backfill. Astrologers opt in from the app.';
    RETURN;
  END IF;

  UPDATE public.astrologers
     SET free_intro_call_enabled = true
   WHERE id = ANY (ids::uuid[])
     AND free_intro_call_enabled IS DISTINCT FROM true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Backfilled % astrologer(s) from the configured pool.', n;
END $$;

-- 4. Self-verifying tail. A half-applied migration here fails SILENTLY: the backend
--    latches the column off and keeps working from the admin list, so every astrologer
--    would see their toggle do nothing with no error anywhere.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'astrologers'
       AND column_name = 'free_intro_call_enabled'
  ) THEN
    RAISE EXCEPTION 'astrologers.free_intro_call_enabled was not created.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'astrologers_free_intro_call_idx'
  ) THEN
    RAISE EXCEPTION 'astrologers_free_intro_call_idx was not created.';
  END IF;
END $$;

-- 5. No GRANT. As of hardening_15/17 neither anon nor authenticated holds any write
--    privilege in public, so this column is only writable by the service role — i.e.
--    only through the endpoint that enforces the minimum-calls rule. Do NOT add a grant
--    to make a direct-from-app write work; that would hand every installed APK the
--    ability to switch any astrologer in or out of the pool.

SELECT count(*) FILTER (WHERE free_intro_call_enabled) AS opted_in,
       count(*)                                        AS astrologers
  FROM public.astrologers;
