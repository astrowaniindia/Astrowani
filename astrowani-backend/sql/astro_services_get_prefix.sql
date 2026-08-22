-- Prefixes "Get " to every astro service name, so the Home cards and the Astro
-- Services list read "Get Kundli Report" rather than "Kundli Report" — an action
-- the customer can take, not a noun sitting on a card. The buttons INSIDE each
-- report screen already read this way ('astro.getKundliReport' etc. in
-- LanguageContext.js); this brings the card titles in line with them.
--
-- WHY SQL AND NOT CODE: astro_services.name is the single source of truth for the
-- English label (see astroServiceLabel() — it returns service.name verbatim for
-- any non-Hindi language) and it is admin-editable from the Astro Services page.
-- Prefixing at render time instead would fight the admin: renaming a service to
-- "Get Kundli Report" there would then display as "Get Get Kundli Report".
--
-- The Hindi labels are NOT here — name_hi is empty for all ten rows, so Hindi
-- falls through to the bundled 'astroService.<key>' translations in the app's
-- LanguageContext.js, which have been updated alongside this file (Hindi puts the
-- verb last: "कुंडली रिपोर्ट पाएं"). An admin who later fills in name_hi
-- overrides that, and should include the verb themselves.
--
-- IDEMPOTENT: the WHERE clause skips any row already prefixed, so re-running is
-- safe and a newly-added service can be prefixed by running this again.
UPDATE public.astro_services
   SET name = 'Get ' || name
 WHERE name NOT LIKE 'Get %';

-- Confirm the result — every row should read "Get …".
DO $$
DECLARE
  v_unprefixed integer;
  r RECORD;
BEGIN
  SELECT count(*) INTO v_unprefixed FROM public.astro_services WHERE name NOT LIKE 'Get %';
  IF v_unprefixed > 0 THEN
    RAISE EXCEPTION 'astro_services: % row(s) still lack the "Get " prefix', v_unprefixed;
  END IF;
  RAISE NOTICE 'All astro_services names now prefixed. Current names:';
  FOR r IN SELECT key, name FROM public.astro_services ORDER BY name LOOP
    RAISE NOTICE '  %  ->  %', rpad(r.key, 16), r.name;
  END LOOP;
END $$;
