-- Customer-side blocking: a customer blocks an ASTROLOGER.
--
-- WHY: the two directions were asymmetric. An astrologer could report AND block a
-- customer (customer_reports / customer_blocks, 2026-09) and a customer could
-- report an astrologer (astrologer_reports, 2026-07) — but a customer could not
-- block anybody, anywhere in the app. Apple's Guideline 1.2 asks for a filter, a
-- way to report, and "the ability to block abusive users"; Play's UGC policy asks
-- the same. The missing third is this table.
--
-- It matters more since 2026-10-12, when astrologers gained the ability to send
-- PHOTOGRAPHS into a consultation chat (CLAUDE.md DX): unmoderated image content
-- from one user to another, where the recipient could neither report it in context
-- nor stop the sender.
--
-- Mirrors customer_blocks exactly — same columns, same UNIQUE pair, same no-RLS
-- choice — so the two directions stay one mental model. There is NO client-direct
-- write path: the backend writes it with the service-role client, taking
-- customer_id from the verified JWT and never from the body, so a customer cannot
-- file a block in somebody else's name.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.astrologer_blocks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES public.customers(id)   ON DELETE CASCADE,
  astrologer_id  uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, astrologer_id)
);

-- The hot path: EVERY call and chat initiation now asks both directions, so the
-- lookup must be an index hit on the exact pair. The single-column index serves
-- the customer's own "who have I blocked" list.
CREATE INDEX IF NOT EXISTS idx_astrologer_blocks_pair     ON public.astrologer_blocks (customer_id, astrologer_id);
CREATE INDEX IF NOT EXISTS idx_astrologer_blocks_customer ON public.astrologer_blocks (customer_id);

-- Deliberately NO grants to anon/authenticated. Both roles hold zero write
-- privileges anywhere in public as of the 2026-09-23 hardening passes (CLAUDE.md
-- CT/CU) and nothing here may reopen that. The backend uses the service role,
-- which bypasses grants entirely.
ALTER TABLE public.astrologer_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.astrologer_blocks FROM anon, authenticated;

-- Self-verifying tail: a migration that silently did not take effect is the trap
-- recorded in CLAUDE.md's standing rules, so assert the end state rather than
-- trusting that the statements above ran.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'astrologer_blocks'
  ) THEN
    RAISE EXCEPTION 'astrologer_blocks was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_astrologer_blocks_pair'
  ) THEN
    RAISE EXCEPTION 'idx_astrologer_blocks_pair is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'astrologer_blocks'
      AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'astrologer_blocks still grants to anon/authenticated';
  END IF;
END $$;
