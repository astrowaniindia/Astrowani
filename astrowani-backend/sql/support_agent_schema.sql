-- support_agent_schema.sql — in-app support: conversations, messages, routing, SLA.
--
-- WHAT WAS THERE BEFORE, AND WHY IT COULD NOT WORK
--
-- support_tickets is a one-shot drop box: the customer posts name/email/issue/
-- message once and there is no reply path at all. The admin can set a status and
-- write admin_note, but NOTHING in either app ever reads admin_note, so the
-- answer never reaches the person who asked. The vendor app's Support screen did
-- not even post — it showed "Your inquiry has been sent!" and console.log'd the
-- payload (astrowani_vendors-main/src/screens/Support.tsx).
--
-- Support is a conversation with an owner, an age and an outcome. That is what
-- this models. support_tickets is KEPT and back-linked rather than migrated, so
-- historical tickets stay readable and the admin page that reads them keeps
-- working while both apps move over.
--
-- Idempotent. Built to the newer hardening standard (FKs, CHECK constraints,
-- indexes, RLS with no anon access — every read and write goes through the
-- backend's service-role client, matching support_tickets/favorites/reviews).

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of these is set. Support serves both apps from one system, but a
  -- customer's and an astrologer's problems are different domains (refunds and
  -- call quality vs payouts and profile approval), so the agent is told which it
  -- is and the admin queue can be filtered by it.
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  astrologer_id uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,
  app text NOT NULL CHECK (app IN ('customer', 'vendor')),

  subject text,

  -- Set by the agent's triage, not by the person writing in: a customer typing
  -- "money gone" should land in billing whatever they called it.
  category text CHECK (category IN (
    'billing', 'refund', 'call_quality', 'chat_quality', 'account',
    'order', 'astrologer_conduct', 'payout', 'technical', 'feedback', 'other'
  )),

  -- Drives queue order and the SLA clock. urgent is reserved for money already
  -- lost, a safety/abuse report, or an account someone cannot get into.
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  --  bot            the agent is handling it
  --  awaiting_human escalated, nobody has picked it up yet
  --  human          a named admin owns it and is replying
  --  resolved       an outcome was reached
  --  closed         auto-closed after inactivity
  status text NOT NULL DEFAULT 'bot'
    CHECK (status IN ('bot', 'awaiting_human', 'human', 'resolved', 'closed')),

  -- Why it left the bot. Kept even after resolution: the mix of reasons is the
  -- single most useful thing for knowing what the agent is bad at.
  escalation_reason text,
  escalated_at timestamptz,

  -- The admin who owns it. Assignment is explicit — an unowned escalation is the
  -- failure mode this whole design exists to prevent.
  assigned_admin_id uuid REFERENCES public.admins(id) ON DELETE SET NULL,
  assigned_at timestamptz,

  -- SLA. first_response_due_at is stamped at escalation from the priority; the
  -- admin queue sorts by it and shows a breach in red. Deliberately a stored
  -- column rather than computed on read, so changing the SLA policy later cannot
  -- retroactively rewrite whether past conversations were breached.
  first_response_due_at timestamptz,
  first_human_response_at timestamptz,

  -- Customer-reported outcome. Asked once, after resolution.
  satisfaction smallint CHECK (satisfaction BETWEEN 1 AND 5),
  satisfaction_comment text,

  -- Back-link to the legacy one-shot ticket, when a conversation grew out of one.
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,

  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,

  -- A conversation belongs to exactly one party. Without this a row with both
  -- ids (or neither) is possible, and every downstream "whose is this" query
  -- silently picks one.
  CONSTRAINT chk_support_conv_one_party CHECK (
    (customer_id IS NOT NULL AND astrologer_id IS NULL)
    OR (customer_id IS NULL AND astrologer_id IS NOT NULL)
  ),
  -- The app column must agree with which party is set, or the vendor queue shows
  -- customer conversations.
  CONSTRAINT chk_support_conv_app_matches CHECK (
    (app = 'customer' AND customer_id IS NOT NULL)
    OR (app = 'vendor' AND astrologer_id IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.support_conversations(id) ON DELETE CASCADE,

  --  user    the customer or astrologer
  --  agent   the AI
  --  human   a support admin
  --  system  state changes ("connected you to Priya"), rendered as a centred note
  sender text NOT NULL CHECK (sender IN ('user', 'agent', 'human', 'system')),

  -- Which admin wrote it, for sender='human'. The app shows a first name so the
  -- customer is talking to a person, not to "Support".
  admin_id uuid REFERENCES public.admins(id) ON DELETE SET NULL,

  body text NOT NULL,

  -- What the agent did to produce this turn: the tools it called and what they
  -- returned. This is the audit trail for "the bot told me I was refunded" —
  -- without it, a disputed answer is unreconstructible.
  tool_trace jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- The admin queue: open work, oldest SLA first.
CREATE INDEX IF NOT EXISTS idx_support_conv_queue
  ON public.support_conversations (status, first_response_due_at)
  WHERE status IN ('awaiting_human', 'human');
-- "My conversations" in either app.
CREATE INDEX IF NOT EXISTS idx_support_conv_customer
  ON public.support_conversations (customer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conv_astrologer
  ON public.support_conversations (astrologer_id, last_message_at DESC);
-- Loading a thread, and the agent reading recent history.
CREATE INDEX IF NOT EXISTS idx_support_messages_conv
  ON public.support_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- No policies at all: anon gets nothing. Both apps reach this only through the
-- backend, which resolves the caller from their JWT and scopes every query to
-- their own id. These rows contain support conversations about money and
-- accounts; the publishable key shipped in both APKs must never be able to read
-- another person's.
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
-- SLA minutes per priority, and the master switch. Admin-editable through the
-- existing generic /api/admin/settings PATCH — no new settings endpoint.
INSERT INTO public.app_settings (key, value)
VALUES
  ('support_agent_enabled', 'true'),
  ('support_sla_minutes', '{"urgent":15,"high":60,"normal":240,"low":1440}')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
--  WHERE table_name IN ('support_conversations','support_messages');
-- SELECT key, value FROM app_settings WHERE key LIKE 'support_%';
