-- Per-acquisition-segment banners.
--
-- banners already has `audience` ('all' | 'new' | 'returning'), which is about where a
-- customer is in their LIFECYCLE. This column is about where they CAME FROM, which is
-- an independent question — a banner can legitimately target "new customers who came
-- from a QR poster". Two columns rather than one overloaded one.
--
-- Stored as a comma-separated list of segment ids from app_settings.audience_rules
-- (e.g. 'qr,ads'). Empty string means EVERYONE, which is what every existing row gets,
-- so applying this changes nothing that is already live.
--
-- Text, not jsonb, deliberately: every other filter column on this table is text, the
-- generic admin crud writes it as text, and the list is a handful of short ids.
--
-- Filtering happens in the APP, not here. GET /api/banners/all is contentCache'd and
-- shared across every customer, so a per-customer WHERE clause would either poison that
-- cache or force it off for everybody. The app already filters `audience` client-side
-- for exactly this reason; segments ride the same path.

ALTER TABLE banners ADD COLUMN IF NOT EXISTS segments text NOT NULL DEFAULT '';

COMMENT ON COLUMN banners.segments IS
  'Comma-separated acquisition segment ids (see app_settings.audience_rules). Empty = show to everyone. Filtered client-side.';

DO $$
DECLARE
  non_empty int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'banners' AND column_name = 'segments'
  ) THEN
    RAISE EXCEPTION 'banners.segments was not created';
  END IF;

  -- Every pre-existing banner must be unrestricted, or applying this would silently
  -- hide live banners from customers.
  SELECT count(*) INTO non_empty FROM banners WHERE coalesce(segments, '') <> '';
  IF non_empty > 0 THEN
    RAISE EXCEPTION 'banners.segments is non-empty on % existing row(s) — those banners would be restricted', non_empty;
  END IF;

  RAISE NOTICE 'banners.segments present, and all existing banners are unrestricted.';
END $$;
