-- support_tickets_schema.sql
--
-- The customer app's Support screen (SupportScreen.js) has always posted to
-- POST /api/support/create-support — a route that never existed on the backend.
-- Every "Refund Request" / support submission has been silently swallowed
-- (the app shows a generic Error alert; nothing reaches anyone). Found during
-- the pre-launch readiness pass, 2026-08-08. Fixing both the table and the
-- route together.
--
-- Built to the newer hardening standard (CLAUDE.md "Data-layer audit"): FK,
-- CHECK constraint, index, RLS with no anon access (writes go through the
-- backend's service-role client only — see POST /api/support/create-support
-- and the admin crud('support-tickets', ...) registration in adminRoutes.js).
-- Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  mobile text,
  issue_type text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT chk_support_tickets_status CHECK (status IN ('open', 'in_progress', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON public.support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer
  ON public.support_tickets (customer_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
-- No policies: anon has no access at all. The customer app's create-support
-- request and the admin dashboard both go through the backend's service-role
-- client, which bypasses RLS entirely — matching favorites/reviews/waitlist.
