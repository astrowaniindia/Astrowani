-- ============================================================================
-- Astrowani — core-table hardening, Phase 1
-- ============================================================================
-- WHY: The tables added since 2026-06-21 via files in this directory are well
-- built (FKs, CHECKs, UNIQUE idempotency guards, RLS). The ORIGINAL core tables
-- — customers, astrologers, chat_sessions, chat_requests, call_requests,
-- chat_messages, wallet_transactions, vendor_wallet_transactions — were created
-- ad-hoc in the Supabase dashboard and have NONE of it: no foreign keys, no
-- indexes, no CHECK constraints, and id columns typed `text` instead of `uuid`.
-- Those are exactly the tables that carry money and session state.
--
-- SCOPE OF THIS FILE: indexes, constraints, and referential integrity only.
-- It does NOT touch RLS or column privileges — those require a coordinated
-- application change and are covered in hardening_02_access_control.sql.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor. Run SECTION BY SECTION and read
-- the notes. Section A is a read-only audit — run it first and act on what it
-- reports before running Section B. Everything is idempotent / re-runnable.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION A — AUDIT (read-only, run this first)
-- ────────────────────────────────────────────────────────────────────────────
-- A1. Rows whose *_id points at a record that does not exist. These are why the
--     text columns cannot be converted to uuid + FK yet. Clean them in A2.
SELECT 'chat_sessions.caller_id' AS ref, s.caller_id AS orphan_value, count(*) AS rows
  FROM public.chat_sessions s
  LEFT JOIN public.customers c ON c.id::text = s.caller_id
 WHERE s.caller_id IS NOT NULL AND c.id IS NULL
 GROUP BY s.caller_id
UNION ALL
SELECT 'chat_sessions.vendor_id', s.vendor_id, count(*)
  FROM public.chat_sessions s
  LEFT JOIN public.astrologers a ON a.id::text = s.vendor_id
 WHERE s.vendor_id IS NOT NULL AND a.id IS NULL
 GROUP BY s.vendor_id
UNION ALL
SELECT 'wallet_transactions.user_id', t.user_id, count(*)
  FROM public.wallet_transactions t
  LEFT JOIN public.customers c ON c.id::text = t.user_id
 WHERE t.user_id IS NOT NULL AND c.id IS NULL
 GROUP BY t.user_id
UNION ALL
SELECT 'vendor_wallet_transactions.vendor_id', t.vendor_id, count(*)
  FROM public.vendor_wallet_transactions t
  LEFT JOIN public.astrologers a ON a.id::text = t.vendor_id
 WHERE t.vendor_id IS NOT NULL AND a.id IS NULL
 GROUP BY t.vendor_id;

-- A2. Sessions that will never bill and never end, but DO make their astrologer
--     permanently "busy" (busyStatus.js treats is_active=true as busy, while
--     sessionManager.checkActiveSessions only picks up rows where
--     next_billing_at <= now — a row with next_billing_at IS NULL is invisible
--     to billing and to termination, and blocks that astrologer forever).
SELECT id, vendor_id, caller_id, call_type, started_at, next_billing_at
  FROM public.chat_sessions
 WHERE is_active = true
   AND (next_billing_at IS NULL OR started_at < now() - interval '6 hours')
 ORDER BY started_at;

-- A3. Balances that do not reconcile against the ledger.
SELECT c.id, c.name, c.wallet_balance AS stored_balance,
       coalesce(sum(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS ledger_sum,
       c.wallet_balance - coalesce(sum(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS drift
  FROM public.customers c
  LEFT JOIN public.wallet_transactions t ON t.user_id = c.id::text
 GROUP BY c.id, c.name, c.wallet_balance
HAVING abs(c.wallet_balance - coalesce(sum(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0)) > 0.01
 ORDER BY abs(drift) DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION B — CLEANUP (destructive; only after reviewing Section A output)
-- ────────────────────────────────────────────────────────────────────────────
-- B1. Release astrologers stuck behind zombie sessions. This unblocks them for
--     new chat/call/video requests immediately.
UPDATE public.chat_sessions
   SET is_active = false,
       ended_at  = coalesce(ended_at, now())
 WHERE is_active = true
   AND (next_billing_at IS NULL OR started_at < now() - interval '6 hours');

-- B2. Close out sessions that were deactivated without ever being finalized.
UPDATE public.chat_sessions
   SET ended_at = coalesce(started_at, now())
 WHERE is_active = false AND ended_at IS NULL;

-- B3. Orphaned rows from the pre-2026-06-20 stale-JWT bug (ids like
--     'user_1781452835500' that were never valid customer UUIDs). Archive
--     rather than delete, so the money history is not destroyed.
CREATE TABLE IF NOT EXISTS public.archived_orphan_rows (
  id          bigserial PRIMARY KEY,
  source_table text NOT NULL,
  row_data    jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.archived_orphan_rows (source_table, row_data)
SELECT 'wallet_transactions', to_jsonb(t)
  FROM public.wallet_transactions t
  LEFT JOIN public.customers c ON c.id::text = t.user_id
 WHERE t.user_id IS NOT NULL AND c.id IS NULL;

INSERT INTO public.archived_orphan_rows (source_table, row_data)
SELECT 'chat_sessions', to_jsonb(s)
  FROM public.chat_sessions s
  LEFT JOIN public.customers c ON c.id::text = s.caller_id
 WHERE s.caller_id IS NOT NULL AND c.id IS NULL;

DELETE FROM public.wallet_transactions t
 WHERE t.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id::text = t.user_id);

DELETE FROM public.chat_sessions s
 WHERE s.caller_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id::text = s.caller_id);

-- B4. chat_messages currently accepts any text as sender_id (there is a live row
--     with sender_id = 'abc'). Archive non-UUID senders before adding the type
--     constraint in Section C.
INSERT INTO public.archived_orphan_rows (source_table, row_data)
SELECT 'chat_messages', to_jsonb(m) FROM public.chat_messages m
 WHERE m.sender_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

DELETE FROM public.chat_messages
 WHERE sender_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION C — TYPES + FOREIGN KEYS
-- ────────────────────────────────────────────────────────────────────────────
-- Converts the text id columns to uuid and adds the missing foreign keys, so
-- the database itself rejects the class of bug that produced the orphans above.
-- Safe for the apps: PostgREST/supabase-js already send these values as UUID
-- strings, and a uuid column accepts them unchanged.
-- IMPORTANT: run Section B first, or these ALTERs will fail on the bad rows.

ALTER TABLE public.chat_sessions ALTER COLUMN caller_id TYPE uuid USING caller_id::uuid;
ALTER TABLE public.chat_sessions ALTER COLUMN vendor_id TYPE uuid USING vendor_id::uuid;
ALTER TABLE public.chat_requests ALTER COLUMN caller_id   TYPE uuid USING caller_id::uuid;
ALTER TABLE public.chat_requests ALTER COLUMN receiver_id TYPE uuid USING receiver_id::uuid;
ALTER TABLE public.wallet_transactions        ALTER COLUMN user_id   TYPE uuid USING user_id::uuid;
ALTER TABLE public.vendor_wallet_transactions ALTER COLUMN vendor_id TYPE uuid USING vendor_id::uuid;
ALTER TABLE public.chat_messages ALTER COLUMN sender_id   TYPE uuid USING sender_id::uuid;
ALTER TABLE public.chat_messages ALTER COLUMN receiver_id TYPE uuid USING receiver_id::uuid;

DO $$
BEGIN
  -- ON DELETE RESTRICT on the ledgers: a customer or astrologer must never be
  -- deletable while financial history references them.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_sessions_caller') THEN
    ALTER TABLE public.chat_sessions ADD CONSTRAINT fk_chat_sessions_caller
      FOREIGN KEY (caller_id) REFERENCES public.customers(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_sessions_vendor') THEN
    ALTER TABLE public.chat_sessions ADD CONSTRAINT fk_chat_sessions_vendor
      FOREIGN KEY (vendor_id) REFERENCES public.astrologers(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_requests_caller') THEN
    ALTER TABLE public.chat_requests ADD CONSTRAINT fk_chat_requests_caller
      FOREIGN KEY (caller_id) REFERENCES public.customers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_requests_receiver') THEN
    ALTER TABLE public.chat_requests ADD CONSTRAINT fk_chat_requests_receiver
      FOREIGN KEY (receiver_id) REFERENCES public.astrologers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_wallet_tx_user') THEN
    ALTER TABLE public.wallet_transactions ADD CONSTRAINT fk_wallet_tx_user
      FOREIGN KEY (user_id) REFERENCES public.customers(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_wallet_tx_vendor') THEN
    ALTER TABLE public.vendor_wallet_transactions ADD CONSTRAINT fk_vendor_wallet_tx_vendor
      FOREIGN KEY (vendor_id) REFERENCES public.astrologers(id) ON DELETE RESTRICT;
  END IF;
END
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION D — CHECK CONSTRAINTS (make the bad state unrepresentable)
-- ────────────────────────────────────────────────────────────────────────────
-- sessionManager.js currently runs a *detector* for negative balances because
-- nothing prevents them. A CHECK makes the detector unnecessary: the write that
-- would overdraw an account fails loudly instead of silently corrupting state.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_customers_balance_nonneg') THEN
    ALTER TABLE public.customers ADD CONSTRAINT chk_customers_balance_nonneg
      CHECK (wallet_balance >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_astrologers_balance_nonneg') THEN
    ALTER TABLE public.astrologers ADD CONSTRAINT chk_astrologers_balance_nonneg
      CHECK (wallet_balance >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_astrologers_charges_nonneg') THEN
    ALTER TABLE public.astrologers ADD CONSTRAINT chk_astrologers_charges_nonneg
      CHECK (coalesce(call_charge_per_minute,0)  >= 0
         AND coalesce(chat_charge_per_minute,0)  >= 0
         AND coalesce(video_charge_per_minute,0) >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wallet_tx_positive') THEN
    ALTER TABLE public.wallet_transactions ADD CONSTRAINT chk_wallet_tx_positive
      CHECK (amount > 0 AND type IN ('credit','debit')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vendor_wallet_tx_positive') THEN
    ALTER TABLE public.vendor_wallet_transactions ADD CONSTRAINT chk_vendor_wallet_tx_positive
      CHECK (amount > 0 AND type IN ('credit','debit')) NOT VALID;
  END IF;
  -- Free-text status columns are how 'pending' rows leak into unknown states.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_call_requests_status') THEN
    ALTER TABLE public.call_requests ADD CONSTRAINT chk_call_requests_status
      CHECK (status IN ('pending','accepted','rejected','cancelled','missed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_chat_requests_status') THEN
    ALTER TABLE public.chat_requests ADD CONSTRAINT chk_chat_requests_status
      CHECK (status IN ('pending','accepted','rejected','cancelled','missed')) NOT VALID;
  END IF;
END
$$;

-- Added NOT VALID so existing rows are not re-checked and the ALTERs take no
-- write lock on history. New and updated rows are enforced immediately. Once
-- Section A3 drift is resolved, promote them with:
--   ALTER TABLE public.customers   VALIDATE CONSTRAINT chk_customers_balance_nonneg;
--   ALTER TABLE public.astrologers VALIDATE CONSTRAINT chk_astrologers_balance_nonneg;
--   ... etc.

-- An astrologer can be in at most ONE active session. This is the database-level
-- backstop for the busy-gating that currently exists only in application code
-- (CLAUDE.md subsystem N explicitly notes this enforcement gap).
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_session_per_vendor
  ON public.chat_sessions (vendor_id) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION E — INDEXES
-- ────────────────────────────────────────────────────────────────────────────
-- There is currently NOT ONE index on any of these tables beyond the primary
-- keys. Every busy-check, every session-billing poll, every wallet history load
-- and every chat scrollback is a sequential scan today. It is invisible at 15
-- customers and becomes the whole problem at 15,000.
-- CONCURRENTLY = no write lock. Run these one at a time, outside a transaction
-- block (the Supabase SQL editor runs each statement separately, which is fine).

-- The sessionManager billing poll, every 30s, forever:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_billing_due
  ON public.chat_sessions (next_billing_at) WHERE is_active = true;
-- busyStatus.checkAstrologerBusy / buildBusyMap:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_active_vendor
  ON public.chat_sessions (vendor_id) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_requests_pending
  ON public.call_requests (astrologer_id) WHERE status = 'pending';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_requests_pending
  ON public.chat_requests (receiver_id) WHERE status = 'pending';
-- markStaleRequestsMissed sweep:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_requests_status_created
  ON public.call_requests (status, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_requests_status_created
  ON public.chat_requests (status, created_at);
-- "My Sessions" / vendor history / admin sessions list:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_caller_started
  ON public.chat_sessions (caller_id, started_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_vendor_started
  ON public.chat_sessions (vendor_id, started_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_requests_customer_created
  ON public.call_requests (customer_id, created_at DESC);
-- Wallet history screens:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_user_created
  ON public.wallet_transactions (user_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_wallet_tx_vendor_created
  ON public.vendor_wallet_transactions (vendor_id, created_at DESC);
-- Chat scrollback:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_room_created
  ON public.chat_messages (room_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session_created
  ON public.chat_messages (session_id, created_at);
-- The astrologer list filter (currently done in Node over the whole table):
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_astrologers_visible
  ON public.astrologers (approval_status, is_suspended);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_sessions_active
  ON public.live_sessions (astrologer_id) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_customer
  ON public.reviews (customer_id);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION F — VERIFY
-- ────────────────────────────────────────────────────────────────────────────
SELECT tablename, indexname FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename IN ('chat_sessions','call_requests','chat_requests','chat_messages',
                     'wallet_transactions','vendor_wallet_transactions','astrologers','customers')
 ORDER BY tablename, indexname;

SELECT conrelid::regclass AS table_name, conname, contype, convalidated
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace AND contype IN ('f','c')
 ORDER BY 1, 2;
