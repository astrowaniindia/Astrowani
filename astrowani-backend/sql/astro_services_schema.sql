-- Astro Services (JyotishamAstroAPI paid reports) + platform admin wallet.
--
-- WHY: Adds 10 paid astrology report features (Kundli, Matching, Chart, Dasha, Dosh,
-- Numerology, Lal Kitab, KP Astrology, Tarot, PDF Reports) backed by the JyotishamAstroAPI.
-- Every purchase debits the customer's wallet and credits a single platform-wide
-- `admin_wallet` balance (100% platform revenue — no vendor split, unlike gifts/calls).
-- Prices are admin-managed via the new "Astro Services" admin page. Run in Supabase SQL
-- editor. Safe to re-run.

-- ── Astro service catalog (admin-managed prices) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,   -- e.g. 'kundli', 'matching' — matches /api/astro/:key
  name        text NOT NULL,
  description text,
  category    text NOT NULL,          -- display grouping in the admin UI
  price       int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the 10 report features (only if empty). Prices are placeholder values — admin edits later.
INSERT INTO public.astro_services (key, name, description, category, price, sort_order)
SELECT * FROM (VALUES
  ('kundli',       'Kundli Report',        'Complete birth chart with D1 chart image, ascendant report and planet details.', 'Kundli',       99,  1),
  ('matching',     'Kundli Matching',       'Ashtakoot, Dashakoot, aggregate compatibility and Mangal Dosh for both partners.', 'Matching',     149, 2),
  ('chart',        'Divisional Chart',      'Pick any divisional chart (D1-D60, Sun, Moon, Bhav Chalit, Transit) as an image.', 'Chart',        49,  3),
  ('dasha',        'Dasha Report',          'Current Mahadasha, full dasha timeline and Yogini Dasha.', 'Dasha',        79,  4),
  ('dosh',         'Dosh Report',           'Mangal, Kaalsarp, Manglik and Pitra Dosh analysis.', 'Dosh',         79,  5),
  ('numerology',   'Numerology Report',     'Loshu Grid, name & mobile number analysis, lucky things and personal year.', 'Numerology',   59,  6),
  ('lal-kitab',    'Lal Kitab Report',      'Lal Kitab horoscope, debts, remedies, houses and planets.', 'Lal Kitab',    89,  7),
  ('kp-astrology', 'KP Astrology Report',   'KP chart, planet details, cusp details and house significators.', 'KP Astrology', 89,  8),
  ('tarot',        'Tarot Reading',         'Draw a card for a quick yes/no tarot reading.', 'Tarot',        19,  9),
  ('pdf-report',   'PDF Astrology Report',  'Choose from 25 premium PDF report templates, generated with your details.', 'PDF Reports',  149, 10)
) AS seed(key, name, description, category, price, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.astro_services);

-- ── Platform admin wallet (single balance row; 100% platform revenue) ─────────
CREATE TABLE IF NOT EXISTS public.admin_wallet (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance    numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_wallet (balance)
SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM public.admin_wallet);

-- ── Admin wallet transaction log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_wallet_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL,        -- 'credit' | 'debit'
  amount       numeric NOT NULL,
  description  text,
  service_key  text,                 -- astro_services.key, when applicable
  customer_id  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────────
-- astro_services: public read (customer app needs prices before purchase); writes via service role.
ALTER TABLE public.astro_services ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='astro_services' AND policyname='public read astro_services') THEN
    CREATE POLICY "public read astro_services" ON public.astro_services FOR SELECT USING (true);
  END IF;
END
$$;

-- admin_wallet / admin_wallet_transactions: locked down — platform revenue, not customer-readable.
-- RLS enabled with NO policies means only the service-role key (which bypasses RLS) can read/write.
ALTER TABLE public.admin_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_wallet_transactions ENABLE ROW LEVEL SECURITY;
