-- Free-call bookings: astrologer assignment.
--
-- Follow-up to free_call_booking_schema.sql, which already created the
-- `astrologer_id` column and its FK. This adds only the index the assignment
-- feature needs, so it is safe to run on a database where the first file has
-- already been applied.
--
-- WHY: the vendor app's "My Free Calls" screen filters by astrologer_id on every
-- focus, and the admin's per-astrologer filter does the same. Without this those
-- are sequential scans of the whole bookings table.
--
-- Run in the Supabase SQL editor. Safe to re-run.

CREATE INDEX IF NOT EXISTS free_call_bookings_astrologer_idx
  ON public.free_call_bookings (astrologer_id, slot_start DESC);

-- Unassigned bookings are the admin's work queue ("who takes this?"), so they
-- get their own partial index rather than sharing the one above.
CREATE INDEX IF NOT EXISTS free_call_bookings_unassigned_idx
  ON public.free_call_bookings (slot_start DESC)
  WHERE astrologer_id IS NULL AND status = 'booked';

-- NOTE: no settings seed here. `assignmentMode` ('manual' | 'single') and
-- `assignedAstrologerId` live inside the existing `free_call_offer` JSON blob in
-- app_settings and are written from the admin's Free Call Bookings page.
-- freeCallRoutes.js defaults them to 'manual' / empty when absent, so a row
-- written before this feature keeps working untouched.
