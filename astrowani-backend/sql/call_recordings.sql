-- Call audio recordings (2026-09-25).
--
-- WHY: chat can already be audited (session_flags); calls could not, because the audio
-- never touches our server. Each phone now records ITS OWN microphone during a call and
-- uploads the file to private object storage (Cloudflare R2). The server transcribes it,
-- runs the same contact-detail check as chat, and raises a session_flags row (source
-- 'call') when a number is spoken. The audio itself lives in R2; this table is the index.
--
--   role         whose microphone this file is (each side uploads its own)
--   storage_key  object key in the call-recordings bucket
--   status       pending_upload -> uploaded -> transcribed | failed | too_large
--   expires_at   retention limit; a purge job deletes the object and clears the row's key
--
-- Nothing records until app_settings.call_recording_enabled = 'true' AND storage is
-- configured (see src/callRecordingRoutes.js). Idempotent. Service-role only.

CREATE TABLE IF NOT EXISTS public.call_recordings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text NOT NULL,
  call_type         text,
  role              text NOT NULL CHECK (role IN ('astrologer', 'customer')),
  astrologer_id     uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,
  customer_id       uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  storage_key       text,
  mime              text NOT NULL DEFAULT 'audio/aac',
  bytes             bigint,
  duration_ms       integer,
  status            text NOT NULL DEFAULT 'pending_upload'
                      CHECK (status IN ('pending_upload', 'uploaded', 'transcribed', 'failed', 'too_large')),
  transcript        text,
  transcript_model  text,
  flagged           boolean NOT NULL DEFAULT false,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  uploaded_at       timestamptz,
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS call_recordings_session_idx ON public.call_recordings (session_id);
CREATE INDEX IF NOT EXISTS call_recordings_expiry_idx
  ON public.call_recordings (expires_at) WHERE storage_key IS NOT NULL;

ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_recordings FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.call_recordings') IS NULL THEN
    RAISE EXCEPTION 'call_recordings missing after migration';
  END IF;
  IF has_table_privilege('anon', 'public.call_recordings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.call_recordings', 'SELECT') THEN
    RAISE EXCEPTION 'anon/authenticated can still read call_recordings';
  END IF;
END $$;
