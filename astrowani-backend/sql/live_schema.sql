-- Live Streaming + Gifts schema.
--
-- WHY: Makes the Live section real — astrologers broadcast (WebRTC mesh), customers
-- watch + comment + send gifts paid from their wallet (50% to astrologer, 50% platform).
-- Gift catalog is admin-managed. Run in Supabase SQL editor. Safe to re-run.

-- ── Gift catalog (admin-managed) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  price       int  NOT NULL DEFAULT 0,
  image       text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the 10 gifts that were previously hardcoded in the app (only if empty).
INSERT INTO public.gifts (name, price, image, sort_order)
SELECT * FROM (VALUES
  ('Rose',        21,   'https://astrowani.onrender.com/public/images/gift1.png', 1),
  ('Namaste',     51,   'https://astrowani.onrender.com/public/images/gift2.png', 2),
  ('Diya',        108,  'https://astrowani.onrender.com/public/images/gift3.png', 3),
  ('Lotus',       111,  'https://astrowani.onrender.com/public/images/gift4.png', 4),
  ('Garland',     251,  'https://astrowani.onrender.com/public/images/gift5.png', 5),
  ('Kalash',      501,  'https://astrowani.onrender.com/public/images/gift6.png', 6),
  ('Trishul',     751,  'https://astrowani.onrender.com/public/images/gift7.png', 7),
  ('Om',          1008, 'https://astrowani.onrender.com/public/images/gift8.png', 8),
  ('Crown',       2100, 'https://astrowani.onrender.com/public/images/gift9.png', 9),
  ('Blessings',   5100, 'https://astrowani.onrender.com/public/images/gift10.png', 10)
) AS seed(name, price, image, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.gifts);

-- ── Live sessions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id     uuid NOT NULL REFERENCES public.astrologers(id) ON DELETE CASCADE,
  title             text,
  is_active         boolean NOT NULL DEFAULT true,
  viewer_count      int NOT NULL DEFAULT 0,
  total_gift_amount numeric NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz
);

-- ── Gift transactions (money log; platform_cut = platform revenue) ────────────
CREATE TABLE IF NOT EXISTS public.gift_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id      uuid,                 -- customer UUID
  astrologer_id  uuid,
  gift_id        uuid,
  gift_name      text,
  amount         numeric NOT NULL,     -- full price paid by customer
  vendor_credit  numeric NOT NULL,     -- 50% credited to astrologer
  platform_cut   numeric NOT NULL,     -- remaining platform share
  context        text,                 -- 'live' | 'profile'
  session_id     uuid,                 -- live_sessions.id when context='live'
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Astrologer live flag ──────────────────────────────────────────────────────
ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false;

-- ── Realtime: customer Live list refreshes when a session starts/ends ─────────
ALTER TABLE public.live_sessions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
  END IF;
END
$$;

-- ── RLS: public read of gifts + live_sessions (anon-key reads); writes via service role ──
ALTER TABLE public.gifts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gifts' AND policyname='public read gifts') THEN
    CREATE POLICY "public read gifts" ON public.gifts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='live_sessions' AND policyname='public read live_sessions') THEN
    CREATE POLICY "public read live_sessions" ON public.live_sessions FOR SELECT USING (true);
  END IF;
END
$$;
