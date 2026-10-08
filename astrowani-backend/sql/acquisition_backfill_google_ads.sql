-- astrowani-backend/sql/acquisition_backfill_google_ads.sql
--
-- Backfill customers.acquisition_source for paid Google Ads installs.
--
-- WHY THIS IS POSSIBLE AT ALL: src/acquisition.js only ever read `utm_source`, and a
-- Google Ads app-install referrer does not contain one — it carries `gclid` /
-- `gbraid` / `gad_source` / `gad_campaignid` instead. So every paid install stored a
-- NULL acquisition_source while `acquisition_raw` kept the complete referrer string.
-- The raw column is the reason nothing was actually lost: the label can be re-derived
-- from it after the fact, which is what this file does.
--
-- Measured on 2026-10-08 before applying: 2,555 of 2,720 customers in the last 90 days
-- had a NULL source, and essentially all of them were paid Google traffic from
-- campaign 24260607071 — i.e. attribution was blind for ~94% of installs, and the
-- paid channel was being reported as "unknown" alongside iOS and sideloads.
--
-- SAFE TO RE-RUN. It only ever writes rows where acquisition_source IS NULL, so a
-- second run is a no-op, and it never touches a row that already has a label (a QR
-- poster, an `ad_` link, organic `google-play`).
--
-- TO REVERSE: the raw column is untouched, so
--   UPDATE customers SET acquisition_source = NULL
--   WHERE acquisition_source LIKE 'google\_ads%' ESCAPE '\';
-- restores the previous state exactly.
--
-- Mirrors the labelling in src/acquisition.js parseReferrer():
--   gad_campaignid present -> google_ads_<campaignId>
--   click id only          -> google_ads
-- Keeping the 'google' prefix is deliberate: channelOf()'s /^google/ test then still
-- buckets these to the 'google' channel, so nothing that already grouped on the
-- channel changes behaviour.

BEGIN;

-- Dry-run visibility: what is about to change, before it changes.
DO $$
DECLARE
  v_total   bigint;
  v_with_id bigint;
  v_bare    bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE substring(acquisition_raw from 'gad_campaignid=([0-9]+)') IS NOT NULL),
         count(*) FILTER (WHERE substring(acquisition_raw from 'gad_campaignid=([0-9]+)') IS NULL)
    INTO v_total, v_with_id, v_bare
  FROM customers
  WHERE acquisition_source IS NULL
    AND acquisition_raw IS NOT NULL
    AND acquisition_raw ~ '(gclid|gbraid|gad_source|gad_campaignid)=';

  RAISE NOTICE 'backfill: % rows to label (% with a campaign id, % click-id only)',
    v_total, v_with_id, v_bare;
END $$;

UPDATE customers
SET acquisition_source =
      CASE
        WHEN substring(acquisition_raw from 'gad_campaignid=([0-9]+)') IS NOT NULL
          THEN 'google_ads_' || left(substring(acquisition_raw from 'gad_campaignid=([0-9]+)'), 24)
        ELSE 'google_ads'
      END
WHERE acquisition_source IS NULL
  AND acquisition_raw IS NOT NULL
  AND acquisition_raw ~ '(gclid|gbraid|gad_source|gad_campaignid)=';

-- Self-verifying tail: assert the end state rather than trusting the UPDATE ran.
DO $$
DECLARE
  v_left  bigint;
  v_named bigint;
  v_bad   bigint;
BEGIN
  -- Nothing paid should still be unlabelled.
  SELECT count(*) INTO v_left
  FROM customers
  WHERE acquisition_source IS NULL
    AND acquisition_raw ~ '(gclid|gbraid|gad_source|gad_campaignid)=';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % paid installs still have a NULL source', v_left;
  END IF;

  -- Every label written must match what src/acquisition.js would produce.
  SELECT count(*) INTO v_bad
  FROM customers
  WHERE acquisition_source LIKE 'google\_ads%' ESCAPE '\'
    AND acquisition_source !~ '^google_ads(_[0-9]{1,24})?$';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'backfill wrote % malformed labels', v_bad;
  END IF;

  SELECT count(*) INTO v_named
  FROM customers WHERE acquisition_source LIKE 'google\_ads%' ESCAPE '\';
  RAISE NOTICE 'backfill done: % customers now attributed to Google Ads', v_named;
END $$;

COMMIT;
