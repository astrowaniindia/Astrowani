-- Live Aarti / Pooja streaming — admin sets a YouTube URL, the customer app embeds it
-- in-app at the bottom of Home (before "What Our Clients Say"), same pattern as
-- banner_interval_seconds / session_replay_enabled in app_settings_schema.sql: one
-- key/value row, admin-writable via the existing generic PATCH /api/admin/settings,
-- publicly readable (RLS already public-read on this table).
--
-- Empty string = feature off. GET /api/live-aarti (index.js) returns {url:null} when
-- empty so the customer app hides the section entirely rather than showing a
-- "nothing live" placeholder — see LiveAartiSection.js.
-- Run in Supabase SQL editor. Safe to re-run.

INSERT INTO public.app_settings (key, value)
SELECT 'live_aarti_youtube_url', ''
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'live_aarti_youtube_url');
