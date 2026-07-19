-- Voice notes / proactive check-ins — astrologer records a short voice note and sends it
-- to a past customer (no active session required), a retention lever the one-and-done
-- call/chat model doesn't otherwise have.
-- No RLS — matches the rest of these tables, written by the app's anon/service client.
-- Run in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.voice_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id     uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  audio_url         text NOT NULL,
  duration_seconds  integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  listened_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_voice_notes_customer ON public.voice_notes (customer_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_astrologer ON public.voice_notes (astrologer_id);
