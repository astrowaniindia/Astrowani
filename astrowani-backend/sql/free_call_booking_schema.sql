-- Free 12-minute introductory call — bookings + offer settings.
--
-- WHAT THIS REPLACES: the free 5-minute scripted bot chat (app_settings key
-- `free_bot_chat_persona`, switched off 2026-08-31). Instead of a fake chat, a
-- brand-new customer books a real slot with a real astrologer, who then rings
-- them directly. The customer does nothing after booking.
--
-- THE TWO GUARANTEES THIS FILE PROVIDES, and why they are indexes rather than
-- application checks: the app can be raced, the database cannot.
--   1. free_call_bookings_slot_live_uniq — at most ONE live booking per slot.
--      This is what makes "no mismatch" true. Two customers tapping the same
--      slot at the same instant cannot both win; the loser gets a 409 and is
--      told to pick another slot.
--   2. free_call_bookings_customer_live_uniq — at most ONE live booking per
--      customer, ever. The offer is once-only.
-- Both are PARTIAL indexes excluding 'cancelled', so cancelling frees the slot
-- back up and (deliberately) lets that customer book again.
--
-- Run in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.free_call_bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- The booked slot. slot_start is the scheduling key; slot_end is stored rather
  -- than derived so a later change to the offer's duration never retroactively
  -- moves the end time of a booking that was already confirmed to a customer.
  slot_start        timestamptz NOT NULL,
  slot_end          timestamptz NOT NULL,
  duration_minutes  integer NOT NULL DEFAULT 12 CHECK (duration_minutes > 0),

  status            text NOT NULL DEFAULT 'booked'
                      CHECK (status IN ('booked', 'completed', 'missed', 'cancelled')),

  -- Contact snapshot, taken at booking time. The astrologer rings the number
  -- that was current when the booking was made; if the customer later edits
  -- their profile the admin can still see what was promised.
  customer_name     text,
  customer_phone    text,

  -- Which astrologer the customer was SHOWN. The offer astrologer is an
  -- app_settings value an admin can change at any time, so it is snapshotted
  -- here — otherwise changing it would silently rewrite who past customers
  -- were told they would be speaking to.
  astrologer_name   text,
  astrologer_id     uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,

  -- Admin workflow.
  admin_note        text,
  rescheduled_from  timestamptz,     -- set when an admin moves a booking
  reschedule_count  integer NOT NULL DEFAULT 0,
  completed_at      timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Guarantee 1: one live booking per slot.
CREATE UNIQUE INDEX IF NOT EXISTS free_call_bookings_slot_live_uniq
  ON public.free_call_bookings (slot_start)
  WHERE status <> 'cancelled';

-- Guarantee 2: one live booking per customer (the offer is once-only).
CREATE UNIQUE INDEX IF NOT EXISTS free_call_bookings_customer_live_uniq
  ON public.free_call_bookings (customer_id)
  WHERE status <> 'cancelled';

-- The admin list is sorted by slot and filtered by status; the app checks
-- "which slots are taken on this date".
CREATE INDEX IF NOT EXISTS free_call_bookings_slot_start_idx
  ON public.free_call_bookings (slot_start DESC);
CREATE INDEX IF NOT EXISTS free_call_bookings_status_idx
  ON public.free_call_bookings (status);

-- RLS on, no anon policy: every read and write goes through the backend, which
-- uses the service-role key. A booking is a promise of an astrologer's time, so
-- the customer_id must come from a verified JWT and never from a request body —
-- the same reasoning as remedy_referrals.
ALTER TABLE public.free_call_bookings ENABLE ROW LEVEL SECURITY;

-- updated_at maintenance. Written as a trigger because the admin PATCH and the
-- customer booking path are separate code paths and one of them will eventually
-- forget to set it.
CREATE OR REPLACE FUNCTION public.free_call_bookings_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS free_call_bookings_touch ON public.free_call_bookings;
CREATE TRIGGER free_call_bookings_touch
  BEFORE UPDATE ON public.free_call_bookings
  FOR EACH ROW EXECUTE FUNCTION public.free_call_bookings_touch_updated_at();

-- ── Offer settings ─────────────────────────────────────────────────────────────
-- One JSON blob in the existing key/value app_settings table, same approach as
-- `free_bot_chat_persona` — no new settings table, and the generic
-- /api/admin/settings PATCH already handles arbitrary keys.
--
-- Seeded DISABLED on purpose. This offer promises a REAL astrologer's time to a
-- real customer, and the name/photo below are placeholders. Going live the moment
-- the migration runs would start booking calls against a person who may not exist.
-- Fill in the astrologer on the admin's Free Call Bookings page, then tick
-- "Offer is live" there.
INSERT INTO public.app_settings (key, value)
SELECT 'free_call_offer', json_build_object(
    'enabled',        false,
    'durationMinutes', 12,
    'slotMinutes',    30,
    'openHour',       10,     -- first slot starts 10:00 (IST, see note below)
    'closeHour',      20,     -- last slot must END by 20:00
    'daysAhead',      7,
    'minLeadMinutes', 60,     -- can't grab a slot starting within the next hour
    'astrologerName', 'Acharya Vishal Sharma',
    'astrologerImage', '',
    'astrologerExperience', '15 years',
    'astrologerSpecialities', 'Vedic Astrology, Career, Marriage',
    'headerText',     'Your first 12-minute call is on us',
    'bodyText',       'Pick a date and time that suits you. Our astrologer will call you directly — you do not have to do anything else.',
    'ctaText',        'Book my free call',
    'successText',    'Booked! Our astrologer will call you at the time you chose.'
  )::text
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'free_call_offer');

-- TIMEZONE NOTE: openHour/closeHour are wall-clock hours in the offer's business
-- timezone, which the backend fixes to Asia/Kolkata (FREE_CALL_TZ_OFFSET_MIN in
-- src/freeCallRoutes.js). slot_start is stored as timestamptz — a real instant —
-- so a customer in another timezone still books the same moment in time.
