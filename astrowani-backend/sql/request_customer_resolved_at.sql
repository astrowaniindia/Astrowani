-- astrowani-backend/sql/request_customer_resolved_at.sql
-- APPLIED to production 2026-10-10 via the Supabase MCP (apply_migration).
--
-- Lets the admin's per-customer activity timeline (acquisitionRoutes.js) show how long a
-- call/chat request rang before the CUSTOMER cancelled it or let it auto-expire, without
-- touching `responded_at`.
--
-- WHY A SEPARATE COLUMN, NOT `responded_at`: astrologerMetrics.js computes
-- avgResponseSeconds as (responded_at - created_at) across accepted/rejected/missed rows,
-- as the astrologer's own leaderboard/performance number. If a customer's own cancel or
-- timeout wrote into `responded_at`, that would silently count "how long the customer
-- waited before giving up" as "how fast the astrologer responded" and corrupt that metric —
-- for 'missed' rows especially, which are the ones where the astrologer never responded at
-- all. `customer_resolved_at` is written ONLY by the customer-settable status endpoint
-- (`POST /api/requests/:kind/:id/status`, status cancelled|missed) and is never read by
-- astrologerMetrics.js.

alter table public.call_requests add column if not exists customer_resolved_at timestamptz;
alter table public.chat_requests add column if not exists customer_resolved_at timestamptz;
