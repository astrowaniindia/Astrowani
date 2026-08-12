-- hardening_05_identity_and_review_indexes.sql
--
-- From the 2026-08-13 performance audit — CORRECTED 2026-08-14 after running
-- against production. Original theory: two gaps hardening_01 didn't cover
-- (customers.mobile / astrologers.phone_number unindexed, hit by the
-- "resolve real UUID from JWT phone" query on nearly every authenticated
-- request). That theory was WRONG for two of the three indexes below —
-- verified via `SELECT tablename, indexname FROM pg_indexes ...` after
-- applying this file:
--
--   - customers.mobile already had a UNIQUE constraint (`uq_customers_mobile`),
--     which Postgres backs with a full B-tree index. idx_customers_mobile
--     below is a pure duplicate — dropped.
--   - astrologers.phone_number already had a UNIQUE constraint
--     (`astrologers_phone_number_key`), same story. idx_astrologers_phone_number
--     below is a pure duplicate — dropped.
--   - Both were therefore already index-covered the whole time; the "sequential
--     scan on every request" claim in the original audit was incorrect.
--
-- The reviews index and RPC are real, if narrower-benefit than first
-- estimated: `idx_reviews_astrologer` (from hardening_01) and the
-- `reviews_astrologer_id_customer_id_key` unique constraint already covered
-- astrologer_id lookups reasonably well. idx_reviews_astrologer_visible below
-- is smaller/more selective (partial, WHERE is_hidden=false) than the
-- existing full index, so it's kept — a real but modest win, not the
-- "genuinely new gap" originally claimed.
--
-- Run in the Supabase SQL editor. Idempotent. CONCURRENTLY avoids locking
-- the table against reads/writes while the index builds/drops (cannot run
-- inside a transaction block — if the SQL editor wraps statements in one,
-- run each CONCURRENTLY statement individually).

-- Dropped 2026-08-14 — duplicates of pre-existing unique-constraint indexes,
-- confirmed via pg_indexes. Left here (commented) as a record of what was
-- tried and undone, not something to re-run.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_mobile
--   ON public.customers (mobile);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_astrologers_phone_number
--   ON public.astrologers (phone_number);
--
-- Actual drop statements (already run against production 2026-08-14):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_customers_mobile;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_astrologers_phone_number;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_astrologer_visible
  ON public.reviews (astrologer_id) WHERE is_hidden = false;

-- SQL-side average/count so recomputeAstrologerRating doesn't have to pull
-- every review row into Node just to reduce it. SECURITY DEFINER isn't
-- needed — this only reads reviews, callers already use the service-role
-- client for the write that follows it. Still real value independent of the
-- index correction above: moves the aggregation from Node to SQL either way.
CREATE OR REPLACE FUNCTION public.astrologer_review_stats(p_astrologer_id uuid)
RETURNS TABLE(avg_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(AVG(rating), 0)::numeric AS avg_rating,
    COUNT(*)::bigint AS review_count
  FROM public.reviews
  WHERE astrologer_id = p_astrologer_id
    AND is_hidden = false;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Verification — confirmed 2026-08-14: hardening_01_core_tables.sql's index
-- set WAS already applied to production (idx_chat_sessions_billing_due,
-- idx_call_requests_pending, idx_chat_requests_pending, the one-active/
-- pending-per-astrologer unique indexes, wallet-transaction indexes — all
-- present). The billing poll, busy-status checks, and stale-request sweep
-- were never doing full table scans.
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT tablename, indexname FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN ('customers','astrologers','chat_sessions','chat_requests',
--                      'call_requests','chat_messages','wallet_transactions',
--                      'vendor_wallet_transactions','reviews')
-- ORDER BY tablename, indexname;
