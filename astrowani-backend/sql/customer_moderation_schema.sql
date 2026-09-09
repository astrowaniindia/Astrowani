-- Astrologer-side moderation: report a customer, and block a customer.
--
-- WHY: customers could report astrologers (astrologer_reports, 2026-07) but the
-- reverse did not exist — an astrologer being abused in chat had no recourse at
-- all. Both stores require a two-way path for an app whose users communicate:
-- Apple's Guideline 1.2 (Safety - User-Generated Content) expects a way to report
-- offensive content AND to block abusive users, and Google Play's User Generated
-- Content policy asks for the same. This is the missing half.
--
-- Mirrors astrologer_reports deliberately (same columns, same status vocabulary,
-- same no-RLS choice) so the admin review workflow is the same shape in both
-- directions and neither needs its own mental model.
--
-- No RLS — matches astrologer_reports / reviews / favorites, which the backend
-- writes with its service-role client. There is NO client-direct write path: both
-- tables are written only through the backend, which takes astrologer_id from the
-- verified JWT rather than the request body. An astrologer must not be able to
-- file a report or a block in somebody else's name.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

-- ── Reports ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id  uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reason         text NOT NULL,
  note           text,
  status         text NOT NULL DEFAULT 'pending', -- pending | reviewed | actioned
  admin_note     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_customer_reports_customer   ON public.customer_reports (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_reports_astrologer ON public.customer_reports (astrologer_id);
CREATE INDEX IF NOT EXISTS idx_customer_reports_status     ON public.customer_reports (status);

-- ── Blocks ──────────────────────────────────────────────────────────────────
-- A block is ENFORCED, not advisory: /api/call/initiate and /api/chat/initiate
-- both refuse a blocked pair. A "block" that only hides a row would not satisfy
-- either store, and would not protect the astrologer.
--
-- The UNIQUE pair is what makes blocking idempotent — tapping Block twice, or a
-- retried request, can never create a second row, so unblocking always fully
-- unblocks. Do not replace it with a read-then-insert.
CREATE TABLE IF NOT EXISTS public.customer_blocks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id  uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (astrologer_id, customer_id)
);

-- The hot path: every call/chat initiation asks "has this astrologer blocked this
-- customer?", so the lookup must be an index hit on the exact pair.
CREATE INDEX IF NOT EXISTS idx_customer_blocks_pair       ON public.customer_blocks (astrologer_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_blocks_astrologer ON public.customer_blocks (astrologer_id);

-- ── Self-verifying tail ─────────────────────────────────────────────────────
-- A half-applied migration here fails SILENTLY at runtime: the moderation module
-- treats a missing table as "nothing is blocked" and fails open, so blocking would
-- appear to work in the app while never actually stopping anyone. Raise instead.
DO $$
DECLARE
  n_reports int;
  n_blocks  int;
  n_uniq    int;
BEGIN
  SELECT count(*) INTO n_reports FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_reports';
  SELECT count(*) INTO n_blocks FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_blocks';
  SELECT count(*) INTO n_uniq FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'customer_blocks'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%astrologer_id%' AND indexdef ILIKE '%customer_id%';

  IF n_reports <> 1 THEN RAISE EXCEPTION 'customer_reports was not created'; END IF;
  IF n_blocks  <> 1 THEN RAISE EXCEPTION 'customer_blocks was not created';  END IF;
  IF n_uniq    <  1 THEN
    RAISE EXCEPTION 'the (astrologer_id, customer_id) UNIQUE constraint is missing — blocking would not be idempotent';
  END IF;

  RAISE NOTICE 'customer moderation schema OK: reports + blocks present, unique pair enforced';
END $$;

-- Show the result in the editor pane so a partial run is visible rather than assumed.
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('customer_reports', 'customer_blocks')
ORDER BY tablename, indexname;
