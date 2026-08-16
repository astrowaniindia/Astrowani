-- Live Aarti / Pooja channels (2026-08-16)
--
-- Replaces the single admin-pasted URL (app_settings.live_aarti_youtube_url,
-- sql/live_aarti_schema.sql) with a list of YouTube channels. The backend polls
-- them and the customer app shows EVERY channel that is live right now, in a
-- horizontal scroller — no priority, no picking one.
--
-- The old app_settings key is intentionally left in place and still works as a
-- manual fallback for when nothing is live. Nothing here removes it.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS live_aarti_channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the admin types: a display name and the channel link.
  name          text NOT NULL,
  channel_url   text NOT NULL,
  -- Resolved from channel_url by the backend (UC…). Null until resolution
  -- succeeds; resolve_error then says why, so the admin page can show the
  -- reason instead of the row silently never going live.
  channel_id    text,
  resolve_error text,

  is_enabled    boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,

  -- ---- cached live state, written by the poller ----------------------------
  -- Cached rather than queried on demand so a customer opening Home never waits
  -- on (or spends quota against) the YouTube API.
  is_live         boolean NOT NULL DEFAULT false,
  live_video_id   text,
  live_title      text,
  live_thumbnail  text,
  -- status.embeddable from the YouTube API. A channel can forbid embedding; the
  -- app must then show a "Watch on YouTube" card instead of a player that would
  -- render as a silent black rectangle.
  is_embeddable   boolean,
  last_checked_at timestamptz,
  last_live_at    timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_aarti_channels_enabled
  ON live_aarti_channels (is_enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_live_aarti_channels_live
  ON live_aarti_channels (is_live) WHERE is_live = true;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Service-role only. Unlike banners/blogs, the customer app never reads this
-- table directly — it goes through GET /api/live-aarti/live, which serves the
-- cached live state. So there is no reason to expose it to the anon key.
ALTER TABLE live_aarti_channels ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT name, channel_id, is_enabled, is_live, live_video_id, last_checked_at
--   FROM live_aarti_channels ORDER BY sort_order, created_at;
