-- Free-call bookings: multiple astrologers sharing the load.
--
-- WHY THIS CHANGES AN INDEX THAT ALREADY SHIPPED
-- free_call_booking_schema.sql enforced ONE live booking per slot, globally. That
-- is correct when one astrologer takes every call, but it makes a pool pointless:
-- adding a second astrologer would not add a single bookable slot, because the
-- 3pm slot could still only ever hold one customer.
--
-- Capacity has to scale with the number of astrologers, so the rule becomes
-- "one booking per astrologer per slot" instead:
--
--   * two astrologers  -> two customers can both book 3pm, one each
--   * neither astrologer can be double-booked at 3pm
--
-- The NULL case needs its own index. In Postgres NULLs are DISTINCT inside a
-- unique index, so (slot_start, astrologer_id) alone would let UNLIMITED
-- unassigned rows pile onto the same slot — silently removing the guarantee for
-- exactly the mode ("assign by hand") where nobody is assigned at booking time.
--
-- Run in the Supabase SQL editor AFTER free_call_booking_schema.sql.
-- Idempotent, and it VERIFIES ITSELF at the end: if the old index survives, the
-- final block raises an exception rather than letting you believe it worked.
--
-- NOTE: no explicit BEGIN/COMMIT. The Supabase SQL editor already runs a script
-- as one unit, and an earlier version of this file wrapped these statements in
-- BEGIN/COMMIT — which is how it came to silently leave the old index in place.

-- 1. Remove the old global one-per-slot rule.
DROP INDEX IF EXISTS public.free_call_bookings_slot_live_uniq;

-- 2. One live booking per astrologer per slot: an astrologer can never be
--    double-booked, but N astrologers give a slot N places.
CREATE UNIQUE INDEX IF NOT EXISTS free_call_bookings_slot_astro_uniq
  ON public.free_call_bookings (slot_start, astrologer_id)
  WHERE status <> 'cancelled' AND astrologer_id IS NOT NULL;

-- 3. At most one UNASSIGNED booking per slot. Without this, "assign by hand"
--    mode would have no per-slot limit at all (see the NULL note above).
CREATE UNIQUE INDEX IF NOT EXISTS free_call_bookings_slot_unassigned_uniq
  ON public.free_call_bookings (slot_start)
  WHERE status <> 'cancelled' AND astrologer_id IS NULL;

-- 4. Prove it. A half-applied migration here does not throw an error at booking
--    time — it just quietly caps every slot at one customer forever, which looks
--    like "the pool feature doesn't work" rather than "the migration didn't run".
DO $$
DECLARE
  old_exists   boolean;
  astro_exists boolean;
  unass_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                 AND indexname = 'free_call_bookings_slot_live_uniq') INTO old_exists;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                 AND indexname = 'free_call_bookings_slot_astro_uniq') INTO astro_exists;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                 AND indexname = 'free_call_bookings_slot_unassigned_uniq') INTO unass_exists;

  IF old_exists THEN
    RAISE EXCEPTION
      'free_call_bookings_slot_live_uniq still exists. Every slot is still capped at ONE customer, so a pool of astrologers adds no capacity. Re-run this file.';
  END IF;
  IF NOT astro_exists THEN
    RAISE EXCEPTION 'free_call_bookings_slot_astro_uniq was not created — an astrologer could be double-booked.';
  END IF;
  IF NOT unass_exists THEN
    RAISE EXCEPTION 'free_call_bookings_slot_unassigned_uniq was not created — unassigned bookings would pile onto one slot without limit.';
  END IF;

  RAISE NOTICE 'OK: per-astrologer slot capacity is active. A slot now holds one booking per astrologer, plus at most one unassigned.';
END $$;

-- Show the final state, so the result pane confirms it rather than you trusting
-- a silent success. Expect exactly the two *_uniq indexes below, and NO row
-- named free_call_bookings_slot_live_uniq.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'free_call_bookings'
ORDER BY indexname;

-- The one-booking-per-customer rule is unchanged and still applies:
--   free_call_bookings_customer_live_uniq
--
-- Pool membership (`assignmentMode: 'pool'` + `poolAstrologerIds`) lives in the
-- existing `free_call_offer` JSON blob in app_settings, written from the admin's
-- Free Call Bookings page. No schema change is needed for it.
