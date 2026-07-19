-- Customer-reports-astrologer moderation flow.
--
-- WHY: no way for a customer to flag bad behavior from an astrologer, and no admin
-- visibility into complaints. Adds a simple reports table + admin review workflow.
-- No RLS — matches reviews/favorites, which the backend already writes to with the
-- anon-key client. Run in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.astrologer_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  astrologer_id  uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  reason         text NOT NULL,
  note           text,
  status         text NOT NULL DEFAULT 'pending', -- pending | reviewed | actioned
  admin_note     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_astrologer_reports_astrologer ON public.astrologer_reports (astrologer_id);
CREATE INDEX IF NOT EXISTS idx_astrologer_reports_status ON public.astrologer_reports (status);
