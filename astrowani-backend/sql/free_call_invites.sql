-- Free-call invites: let an admin offer the free 12-minute call to chosen
-- customers by push notification, EVEN WHILE the public offer is switched off.
--
-- One row per customer. Sending again refreshes expires_at (upsert on
-- customer_id). An invite lets that customer see the offer, load slots and book
-- while it has not expired, and it replaces the "brand-new customers only" rule
-- for them: anyone without a live (non-cancelled) free-call booking qualifies.
-- The once-per-customer limit is still enforced by
-- free_call_bookings_customer_live_uniq, not by this table.
--
-- Service-role only (the backend). Idempotent.

CREATE TABLE IF NOT EXISTS public.free_call_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invited_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  invited_by  text
);

CREATE UNIQUE INDEX IF NOT EXISTS free_call_invites_customer_uniq
  ON public.free_call_invites (customer_id);

ALTER TABLE public.free_call_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_call_invites FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'free_call_invites_customer_uniq') THEN
    RAISE EXCEPTION 'free_call_invites_customer_uniq is missing';
  END IF;
  IF has_table_privilege('anon', 'public.free_call_invites', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read free_call_invites';
  END IF;
END $$;
