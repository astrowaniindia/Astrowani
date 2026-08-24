-- iOS VoIP push token for the vendor (astrologer) app.
--
-- WHY: on iOS, a data-only FCM push cannot reliably wake a KILLED app to ring an
-- incoming consultation. The platform's answer is PushKit: a dedicated VoIP push
-- channel that iOS delivers even when the app is not running, paired with CallKit
-- to show the native full-screen incoming-call UI. That push goes to a DIFFERENT
-- token than FCM's, issued by PKPushRegistry, so it needs its own column.
--
-- Only the astrologers table gets this. The customer app never RECEIVES a call -
-- it only initiates one - so it needs no VoIP token. (Verified: the sole
-- /api/call/initiate reference in the vendor app is in EnxJoinScreen.tsx, which
-- is dead code imported by nothing.)
--
-- Nothing breaks if this is not applied: src/voipPush.js degrades to a logged
-- no-op and the existing FCM push + socket path continues to work exactly as
-- today. Applying it only ADDS the iOS killed-app ring.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE public.astrologers
  ADD COLUMN IF NOT EXISTS voip_token text;

-- Which platform issued the token currently stored, so the backend does not try to
-- send a VoIP push to an Android device (Android uses the existing FCM data push +
-- CallForegroundService path, which already works and is untouched by this).
ALTER TABLE public.astrologers
  ADD COLUMN IF NOT EXISTS voip_platform text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'astrologers_voip_platform_check'
  ) THEN
    ALTER TABLE public.astrologers
      ADD CONSTRAINT astrologers_voip_platform_check
      CHECK (voip_platform IS NULL OR voip_platform IN ('ios'));
  END IF;
END
$$;

-- The call-initiate path looks the token up by astrologer id (already the primary
-- key), so no index is needed for the send. This partial index instead supports the
-- reverse question - "which astrologers can receive a VoIP ring" - which is what any
-- future cleanup of stale/unregistered tokens will scan.
CREATE INDEX IF NOT EXISTS idx_astrologers_voip_token
  ON public.astrologers (id)
  WHERE voip_token IS NOT NULL;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.astrologers WHERE voip_token IS NOT NULL;
  RAISE NOTICE 'astrologers with a VoIP token registered: %', n;
END
$$;
