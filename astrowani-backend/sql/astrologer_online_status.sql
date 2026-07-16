-- Master Online/Offline toggle for astrologers, independent of is_available (GO LIVE)
-- and the per-service enabled columns. Defaults to true so existing astrologers stay
-- online (non-breaking). Realtime is already enabled on the astrologers table from
-- prior work (see enable_realtime_astrologers.sql) — no additional realtime setup needed.

ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT true;
