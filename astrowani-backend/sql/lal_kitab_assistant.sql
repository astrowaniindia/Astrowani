-- The Lal Kitab assistant: a conversational astrologer that talks about Lal Kitab
-- remedies and nothing else.
--
-- WHY A CHART STORE AT ALL, which is the whole reason this file exists:
-- the astrological half of this feature already exists and is already paid for --
-- src/astroRoutes.js's 'lal-kitab' report calls FIVE JyotishamAstroAPI endpoints
-- (horoscope, debts, remedies, houses, planets) and renders the result. But it
-- stores NOTHING: every purchase re-fetches all five. For a static report bought
-- once that is correct. For a conversation it is ruinous -- every turn would spend
-- five more calls against a credit pool that has ALREADY run dry once (memory
-- `jyotisham_pdf_credit_pool`), and the failure mode is a 429 that
-- src/jyotishamClient.js correctly surfaces as a 503 mid-sentence.
--
-- So: five calls ONCE per distinct set of birth details, then zero per turn, forever.
--
-- lal_kitab_charts is keyed on a HASH of the birth details and carries no
-- customer_id, deliberately. A Lal Kitab chart is a pure function of
-- (date, time, latitude, longitude, tz, lang) -- two people born in the same minute
-- in the same place have the identical chart -- so keying on the inputs rather than
-- on the person makes the cache shared and the credit saving maximal. It also means
-- the table holds no link to anybody, which is why account deletion has nothing to
-- do here.
--
-- THE RAW BIRTH DETAILS ARE NOT STORED. Only their hash. They are never needed
-- again: the customer types them into the app, so a cache miss always arrives with
-- the inputs in hand. Storing them would add a personal-data column, and therefore
-- an account-deletion obligation, to a table whose entire purpose is to be
-- person-agnostic.
--
-- Run in the Supabase SQL editor. Idempotent -- safe to re-run.

-- -- The chart cache ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lal_kitab_charts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 of 'date|time|latitude|longitude|tz|lang', built by
  -- src/lalKitabChart.js birthKey(). Opaque and irreversible on purpose.
  birth_key     text NOT NULL UNIQUE,
  lang          text NOT NULL DEFAULT 'en',
  -- The five Jyotisham responses, exactly as astroRoutes.js's 'lal-kitab' returns
  -- them, so the existing result screen could render straight from this row.
  horoscope     jsonb,
  debts         jsonb,
  remedies      jsonb,
  houses        jsonb,
  planets       jsonb,
  -- The flattened digest the model is actually given: planet/house placements, the
  -- debts, and every remedy VERBATIM. Derived from the five blobs above, stored so
  -- a turn costs one row read rather than a re-flatten, and so the exact text the
  -- model was grounded on is recoverable later.
  facts         jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetch_ms      integer,
  use_count     integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);

-- The only lookup there is: birth_key -> row. UNIQUE above already indexes it;
-- this one serves pruning a cache that has grown (oldest unused first).
CREATE INDEX IF NOT EXISTS idx_lal_kitab_charts_last_used
  ON public.lal_kitab_charts (last_used_at);

-- -- The conversations --------------------------------------------------------
-- Per customer, so these DO cascade on account deletion. That is the opposite of
-- the 2026-09-25 decision to keep chat_messages: those are evidence of what a real
-- astrologer said to a real customer and are kept for disputes and for the
-- off-platform-contact proof view. This is a machine talking, there is no second
-- party and no dispute, so there is nothing to preserve.
CREATE TABLE IF NOT EXISTS public.lal_kitab_conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: pruning the chart cache must never delete somebody's
  -- conversation. A conversation whose chart has gone simply cannot continue, and
  -- the service re-fetches rather than erroring.
  chart_id         uuid REFERENCES public.lal_kitab_charts(id) ON DELETE SET NULL,
  -- [{ sender: 'user' | 'bot', message: text, at: iso }]
  messages         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_calls         integer NOT NULL DEFAULT 0,
  -- Set the first time a turn falls through to the scripted replies, so "the AI
  -- was unavailable" and "the AI said something odd" are distinguishable afterwards.
  fell_back_at     timestamptz,
  language         text NOT NULL DEFAULT 'en',
  started_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lal_kitab_conversations_customer
  ON public.lal_kitab_conversations (customer_id, last_message_at DESC);

-- -- Grants -------------------------------------------------------------------
-- Deliberately NO grants to anon/authenticated. Both roles hold zero
-- INSERT/UPDATE/DELETE privileges anywhere in public as of the 2026-09-23/30
-- hardening passes (CLAUDE.md CT/CU) and nothing here may reopen that. The backend
-- runs on the service role, which bypasses grants and RLS entirely.
ALTER TABLE public.lal_kitab_charts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lal_kitab_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lal_kitab_charts        FROM anon, authenticated;
REVOKE ALL ON public.lal_kitab_conversations FROM anon, authenticated;

-- -- Settings -----------------------------------------------------------------
-- OFF by default, and that is the point: the code can ship, the apps can carry the
-- screen, and nothing reaches a customer until somebody sets this to true. Same
-- posture as the blog agent (CLAUDE.md DZ), for the same reason -- this one talks to
-- customers with nobody reviewing first.
--
-- NOTE for anyone changing these numbers later: the LIVE ROW is the authority, not
-- any DEFAULTS object in the source. That trap has been recorded three times in
-- CLAUDE.md now (DR free-call duration, DU the Dakshina ladder, EA the blog agent),
-- so editing src/lalKitabAssistant.js alone will change nothing once this row exists.
INSERT INTO public.app_settings (key, value)
VALUES ('lal_kitab_assistant', '{"enabled": false, "dailyCapPerCustomer": 60, "maxHistory": 24}')
ON CONFLICT (key) DO NOTHING;

-- -- Self-verifying tail ------------------------------------------------------
-- A migration that silently did not take effect is a trap in CLAUDE.md's standing
-- rules, so assert the end state rather than trusting the statements above ran.
DO $$
DECLARE
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'lal_kitab_charts') THEN
    RAISE EXCEPTION 'lal_kitab_charts was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'lal_kitab_conversations') THEN
    RAISE EXCEPTION 'lal_kitab_conversations was not created';
  END IF;

  -- The UNIQUE on birth_key IS the cache. Without it the same chart is fetched
  -- again and again and this whole file has achieved nothing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'lal_kitab_charts' AND c.contype = 'u'
  ) THEN
    RAISE EXCEPTION 'lal_kitab_charts.birth_key is not UNIQUE -- the cache would never hit';
  END IF;

  -- Zero privileges for anon/authenticated, asserted rather than assumed.
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('lal_kitab_charts', 'lal_kitab_conversations')
    AND grantee IN ('anon', 'authenticated');
  IF n > 0 THEN
    RAISE EXCEPTION 'anon/authenticated hold % grant(s) on the lal kitab tables', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'lal_kitab_assistant') THEN
    RAISE EXCEPTION 'app_settings.lal_kitab_assistant was not seeded';
  END IF;

  RAISE NOTICE 'lal_kitab_assistant.sql applied: 2 tables, cache unique, zero anon grants, settings seeded (enabled=false)';
END $$;
