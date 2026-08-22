-- ─────────────────────────────────────────────────────────────────────────────
-- "Use your first minute to share your birth details" — the session-start banner.
--
-- PURELY PRESENTATIONAL. This adds no billing rule, no free minute, and no discount:
-- nothing in this file or the code that reads it touches a wallet, a charge, or a
-- session's per-minute rate. It is a prompt telling the customer what to do first so the
-- consult starts productively instead of with the astrologer asking for a birth date.
--
-- A NOTE ON THE WORDING, since it is admin-editable free text: the default deliberately
-- does NOT say the first minute is free. Billing starts when the session connects, so a
-- banner promising "1 minute free" is a claim the customer can check against their wallet
-- balance — and the usual result is a refund request or a one-star review rather than a
-- happier customer. Say what the minute is FOR, not what it costs.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
SELECT 'session_intro_banner_enabled', 'true'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'session_intro_banner_enabled');

INSERT INTO public.app_settings (key, value)
SELECT 'session_intro_banner_text',
       'Start by sharing your name, date, time and place of birth — and double-check them with your astrologer. Accurate details make the reading accurate.'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'session_intro_banner_text');

INSERT INTO public.app_settings (key, value)
SELECT 'session_intro_banner_text_hi',
       'सबसे पहले अपना नाम, जन्म तिथि, समय और स्थान बताएं — और ज्योतिषी से एक बार जांच लें। सही जानकारी से ही सही भविष्यवाणी होती है।'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'session_intro_banner_text_hi');

DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE 'session intro banner settings:';
  FOR r IN SELECT key, value FROM public.app_settings
            WHERE key LIKE 'session_intro_banner%' ORDER BY key LOOP
    RAISE NOTICE '  % = %', rpad(r.key, 32), left(r.value, 60);
  END LOOP;
END $$;
