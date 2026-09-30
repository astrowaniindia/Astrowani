-- Free INSTANT call: the customer picks an idle astrologer and rings them NOW,
-- instead of booking a slot and waiting for a call back.
--
-- WHAT THIS CHANGES, conceptually: the scheduled offer (free_call_booking_schema.sql
-- + free_call_booking_pool.sql) stays exactly as it is and is switched off from the
-- admin, not deleted. The instant offer reuses the SAME free_call_bookings table so
-- that everything already built on it keeps working unchanged:
--   * free_call_bookings_customer_live_uniq  -> still the one-free-call-per-customer rule
--   * sessionManager.closeFreeCallBooking()  -> still closes the booking when the call ends
--   * sessionManager.endOverdueFreeCalls()   -> still the 12-minute backstop
--   * offerGuard.snapshotCustomer()          -> still blocks delete-and-reclaim
-- A new `kind` column is the only thing telling the two apart.
--
-- Run in the Supabase SQL editor AFTER free_call_booking_pool.sql.
-- Idempotent, and it VERIFIES ITSELF at the end.
--
-- NOTE: no explicit BEGIN/COMMIT. The Supabase SQL editor already runs a script as
-- one unit, and free_call_booking_pool.sql was once left half-applied precisely
-- because it wrapped its statements in BEGIN/COMMIT.

-- ── 1. Tell instant bookings apart from scheduled ones ──────────────────────
ALTER TABLE public.free_call_bookings
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'scheduled';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_free_call_bookings_kind') THEN
    ALTER TABLE public.free_call_bookings
      ADD CONSTRAINT chk_free_call_bookings_kind CHECK (kind IN ('scheduled', 'instant'));
  END IF;
END $$;

-- How many astrologers this customer has already tried on this attempt. Capped so a
-- customer cannot walk the whole pool over and over ringing people for attention.
-- (call_attempts from free_call_in_app.sql counts rings; this is the same idea and
-- that column is reused -- nothing new is needed for it.)

-- ── 2. THE ONE THAT MUST NOT BE MISSED: scope the slot indexes ──────────────
-- An instant booking writes slot_start = now(). The two per-slot unique indexes from
-- free_call_booking_pool.sql are not aware of that, so:
--
--   free_call_bookings_slot_unassigned_uniq  UNIQUE (slot_start)
--     WHERE status <> 'cancelled' AND astrologer_id IS NULL
--
-- would let only ONE customer per second start an instant call across the whole
-- platform, and the loser would get a confusing "slot taken" 409 for a feature that
-- has no slots. Same for the per-astrologer one at the moment a ring is retried.
--
-- Both are therefore re-created scoped to kind = 'scheduled'. Scheduled bookings
-- behave exactly as before; instant ones are governed by
-- free_call_bookings_customer_live_uniq (one per customer) and, for the astrologer
-- side, by call_requests' own uq_one_pending_call_per_astrologer.
DROP INDEX IF EXISTS public.free_call_bookings_slot_astro_uniq;
DROP INDEX IF EXISTS public.free_call_bookings_slot_unassigned_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS free_call_bookings_slot_astro_uniq
  ON public.free_call_bookings (slot_start, astrologer_id)
  WHERE status <> 'cancelled' AND astrologer_id IS NOT NULL AND kind = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS free_call_bookings_slot_unassigned_uniq
  ON public.free_call_bookings (slot_start)
  WHERE status <> 'cancelled' AND astrologer_id IS NULL AND kind = 'scheduled';

-- The admin lists instant calls newest-first and the stale sweep looks for instant
-- bookings that never connected.
CREATE INDEX IF NOT EXISTS free_call_bookings_instant_idx
  ON public.free_call_bookings (kind, status, created_at DESC);

-- ── 3. The free ring flag, decided server-side ──────────────────────────────
-- /api/session/accept reads THIS column to decide whether the chat_sessions row it
-- creates is free. The vendor app sends a request body, and a request body can say
-- anything; the column is written only by the backend at ring time. That is what
-- stops a client declaring a paid call free (or a free call paid).
ALTER TABLE public.call_requests
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

-- ── 4. The hold ─────────────────────────────────────────────────────────────
-- When a free call ends, the astrologer is reserved for a moment so the customer can
-- buy more minutes with the same person instead of being handed a stranger.
--
--   'decision' -- the customer is reading the offer. Blocks new FREE calls only; a
--                 paying customer still gets through, because real revenue beats a
--                 maybe and the held customer's money is not committed yet.
--   'payment'  -- they tapped an amount and Razorpay is open. Blocks EVERYTHING
--                 except the held customer. This is the window that stops a free
--                 call ringing the astrologer while somebody is paying for them.
--
-- PRIMARY KEY on astrologer_id is the guarantee, not an application check: one live
-- hold per astrologer, and a race to place two resolves in the database.
CREATE TABLE IF NOT EXISTS public.astrologer_holds (
  astrologer_id uuid PRIMARY KEY REFERENCES public.astrologers(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  session_id    uuid,
  phase         text NOT NULL CHECK (phase IN ('decision', 'payment')),
  minutes       integer,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Every busy check reads "is there a live hold for this astrologer", and the sweep
-- reads "which holds have expired".
CREATE INDEX IF NOT EXISTS astrologer_holds_expires_idx
  ON public.astrologer_holds (expires_at);

-- RLS on with no policy = deny everyone. Only the service-role backend touches this;
-- a hold decides who may reach an astrologer, so a client must never write one.
ALTER TABLE public.astrologer_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.astrologer_holds FROM anon, authenticated;

-- ── 5. What the customer thought of Astrowani ───────────────────────────────
-- Our own rating, shown in the admin. Deliberately NOT wired to the Play Store /
-- App Store prompt: routing only the happy answers to the store is review gating,
-- which Google's In-App Review guidance names directly and Play treats as ratings
-- manipulation. The store prompt is triggered by BEHAVIOUR (a call that ran most of
-- its length) in appReviewGoodMoment, never by the number tapped here.
CREATE TABLE IF NOT EXISTS public.app_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  context     text,             -- 'free_call' | 'paid_call' | 'chat' | ...
  session_id  uuid,
  comment     text,             -- only ever filled from the 1-2 star "what went wrong" route
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_ratings_created_idx ON public.app_ratings (created_at DESC);
CREATE INDEX IF NOT EXISTS app_ratings_customer_idx ON public.app_ratings (customer_id);

ALTER TABLE public.app_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_ratings FROM anon, authenticated;

-- ── 6. Prove it, loudly ─────────────────────────────────────────────────────
-- Each of these fails SILENTLY if missed, which is the dangerous shape:
--   * no call_requests.is_free -> every free call is created as a PAID session and
--     the customer is billed for what was advertised as free.
--   * unscoped slot indexes    -> only one instant call per second, platform-wide,
--     surfacing as a random "slot taken" error on a feature with no slots.
--   * no astrologer_holds      -> the upsell has no reservation, so a free call can
--     ring the astrologer while somebody is paying for them.
DO $$
DECLARE
  has_kind       boolean;
  has_is_free    boolean;
  has_holds      boolean;
  has_ratings    boolean;
  astro_scoped   boolean;
  unass_scoped   boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'free_call_bookings'
                   AND column_name = 'kind') INTO has_kind;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'call_requests'
                   AND column_name = 'is_free') INTO has_is_free;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'astrologer_holds') INTO has_holds;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'app_ratings') INTO has_ratings;

  -- The index definitions must now mention `kind`, or the scoping did not take.
  SELECT COALESCE(indexdef LIKE '%kind%', false) INTO astro_scoped
    FROM pg_indexes WHERE schemaname = 'public'
     AND indexname = 'free_call_bookings_slot_astro_uniq';
  SELECT COALESCE(indexdef LIKE '%kind%', false) INTO unass_scoped
    FROM pg_indexes WHERE schemaname = 'public'
     AND indexname = 'free_call_bookings_slot_unassigned_uniq';

  IF NOT has_kind THEN
    RAISE EXCEPTION 'free_call_bookings.kind is missing — instant and scheduled bookings cannot be told apart.';
  END IF;
  IF NOT has_is_free THEN
    RAISE EXCEPTION 'call_requests.is_free is missing — a free call would be created as a BILLED session and the customer charged.';
  END IF;
  IF NOT has_holds THEN
    RAISE EXCEPTION 'astrologer_holds was not created — the post-call upsell has no reservation.';
  END IF;
  IF NOT has_ratings THEN
    RAISE EXCEPTION 'app_ratings was not created — the Rate Astrowani popup has nowhere to write.';
  END IF;
  IF NOT COALESCE(astro_scoped, false) OR NOT COALESCE(unass_scoped, false) THEN
    RAISE EXCEPTION 'The per-slot unique indexes are not scoped to kind = ''scheduled''. Instant calls would be capped at one per second platform-wide. Re-run this file.';
  END IF;

  RAISE NOTICE 'OK: instant free calls are ready. Turn the mode on from the admin''s Free Call page.';
END $$;

-- Final state, so the result pane confirms it rather than you trusting a silent success.
SELECT indexname, indexdef LIKE '%kind%' AS scoped_to_kind
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'free_call_bookings'
ORDER BY indexname;
