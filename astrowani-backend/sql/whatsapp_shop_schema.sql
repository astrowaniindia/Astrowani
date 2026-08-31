-- Wani Shop moves its checkout to a WhatsApp bot.
--
-- Buying a remedy is a conversation, not a cart: a customer usually needs to know
-- which stone suits them, and a gemstone's price depends on its weight in ratti.
-- So the app hands off to WhatsApp, an AI assistant answers from this catalogue,
-- a real astrologer takes over when it is genuinely a consultation, and the sale
-- closes with a Razorpay payment link in the chat.
--
-- Everything here is additive and idempotent. Nothing in this file changes how the
-- existing in-app cart behaves; that is switched off separately with the
-- remedy_orders_enabled_<type> settings that already exist.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-ratti gemstone pricing
--
-- remedy_items carries ONE price per item, which is fine for a puja but wrong for
-- a gemstone: a 5 ratti Neelam and an 8 ratti Neelam are the same product at very
-- different prices. Variants hold those weights. An item with no variants keeps
-- behaving exactly as it does today (single price on the parent row), so the 6
-- pujas / 8 specific pujas / 3 vastu items need no migration.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.remedy_item_variants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.remedy_items(id) ON DELETE CASCADE,
  -- What the customer is told, e.g. "5 ratti". Kept as free text as well as a
  -- number because sellers quote "5.25 ratti" and "sawa paanch" alike.
  label       text NOT NULL,
  -- Numeric weight, for sorting and for "what do you have around 6 ratti?".
  ratti       numeric(6,2),
  price       numeric(12,2) NOT NULL CHECK (price >= 0),
  mrp         numeric(12,2) CHECK (mrp IS NULL OR mrp >= 0),
  -- NULL = unlimited, matching remedy_items.stock's meaning.
  stock       integer CHECK (stock IS NULL OR stock >= 0),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per weight per item: re-adding "5 ratti" to the same stone should be an
-- edit, not a second row the bot could quote two different prices from.
CREATE UNIQUE INDEX IF NOT EXISTS remedy_item_variants_item_label_uniq
  ON public.remedy_item_variants (item_id, lower(label));

CREATE INDEX IF NOT EXISTS remedy_item_variants_item_idx
  ON public.remedy_item_variants (item_id, sort_order)
  WHERE is_active = true;

-- Public read, service-role write — same posture as remedy_items, since the app
-- and the storefront both need to show prices without a round trip.
ALTER TABLE public.remedy_item_variants ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'remedy_item_variants' AND policyname = 'variants_public_read') THEN
    CREATE POLICY variants_public_read ON public.remedy_item_variants FOR SELECT USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. What was actually bought, when a variant was involved
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id    uuid,
  -- Snapshotted like every other column on order_items: what the customer was
  -- quoted must survive the admin editing or deleting the variant afterwards.
  ADD COLUMN IF NOT EXISTS variant_label text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The WhatsApp conversation itself
--
-- One row per phone number. The bot needs to know who it is talking to, what they
-- were looking at when they left the app, and whether a human has taken over —
-- an astrologer mid-consultation must not have the AI talking over them.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- E.164 without the +, as WhatsApp itself reports it (e.g. 917877724833).
  wa_id          text NOT NULL UNIQUE,
  -- Resolved when the number matches a customer; stays null for a stranger, who
  -- is still allowed to shop.
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  display_name   text,
  -- The item they tapped in the app, so the bot opens knowing the subject.
  context_item_id uuid REFERENCES public.remedy_items(id) ON DELETE SET NULL,

  -- bot        the assistant is answering
  -- astrologer a real astrologer has taken over; the bot stays silent
  -- closed     nothing in progress
  handled_by     text NOT NULL DEFAULT 'bot'
                 CHECK (handled_by IN ('bot', 'astrologer', 'closed')),
  astrologer_id  uuid REFERENCES public.astrologers(id) ON DELETE SET NULL,
  -- Set when a human takes over, so the admin can see how long a customer waited.
  escalated_at   timestamptz,

  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_recent_idx
  ON public.whatsapp_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_open_idx
  ON public.whatsapp_conversations (handled_by, last_message_at DESC)
  WHERE handled_by <> 'closed';

-- Full transcript. Doubles as the AI's memory (the last N turns are replayed as
-- context) and as the record an astrologer reads before taking over.
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  -- customer | bot | astrologer | system
  role            text NOT NULL CHECK (role IN ('customer', 'bot', 'astrologer', 'system')),
  body            text,
  -- WhatsApp's own message id, so a redelivered webhook is ignored rather than
  -- answered twice. Meta retries aggressively on any non-200.
  wa_message_id   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id_uniq
  ON public.whatsapp_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_messages_convo_idx
  ON public.whatsapp_messages (conversation_id, created_at);

-- Service-role only: these transcripts carry customers' phone numbers and whatever
-- personal detail they type into a consultation.
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Orders placed through the bot
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS whatsapp_conversation_id uuid,
  -- Razorpay Payment Link id (plink_...), distinct from razorpay_order_id which
  -- Checkout produces. A WhatsApp sale is paid by link, not by the in-app sheet.
  ADD COLUMN IF NOT EXISTS razorpay_payment_link_id text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_payment_link_uniq
  ON public.orders (razorpay_payment_link_id)
  WHERE razorpay_payment_link_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Settings the admin controls
--
-- Seeded switched OFF and with an empty number on purpose: the app must not send
-- anyone to a WhatsApp number that does not exist yet. Fill the number in from the
-- admin, then turn it on.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value)
VALUES
  ('whatsapp_shop_enabled', 'false'),
  ('whatsapp_shop_number', ''),
  ('whatsapp_shop_greeting',
   'Hi! I''d like to know more about {item}.'),
  ('whatsapp_shop_cta', 'Enquire on WhatsApp')
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='remedy_item_variants')
  THEN RAISE EXCEPTION 'whatsapp_shop_schema.sql did not apply: remedy_item_variants missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='whatsapp_conversations')
  THEN RAISE EXCEPTION 'whatsapp_shop_schema.sql did not apply: whatsapp_conversations missing'; END IF;
  RAISE NOTICE 'whatsapp_shop_schema.sql applied.';
END $$;

SELECT key, value FROM public.app_settings WHERE key LIKE 'whatsapp_shop%' ORDER BY key;
