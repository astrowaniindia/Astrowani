// Display name for an `astro_services` row, respecting the Hindi toggle.
//
// WHY THIS EXISTS (2026-08-20). The Astro Reports row on Home stayed English
// with the app in Hindi. The rows are admin-managed and the screen already read
// `name_hi`, but that column is empty for all ten services, so it fell straight
// through to the English `name` — there was no bundled fallback to reach.
//
// The translations live in LanguageContext under `astroService.<key>`. They're
// keyed by `key` (kundli, matching, …), which is the stable identifier the
// backend routes on, rather than by `name`, which an admin can rename at will
// and which would silently break the lookup if they did.
//
// Precedence: admin-authored name_hi > our bundled translation > English name.
// The admin always wins — this is only a floor, so filling name_hi in the
// dashboard still overrides it with no code change.

/**
 * @param service  a row from GET /api/astro-services ({key, name, name_hi, …})
 * @param language 'Hindi' | 'English' — from LanguageContext
 * @param t        the translate function from LanguageContext
 */
export function astroServiceLabel(service, language, t) {
  if (!service) return '';
  if (language !== 'Hindi') return service.name;
  if (service.name_hi) return service.name_hi;

  // t() returns the KEY ITSELF when it has no entry for it, so this cannot just
  // return t(key) — an admin adding an eleventh service we haven't translated
  // would render the literal string "astroService.whatever" on the card. Compare
  // against the key to detect that and fall back to the English name, which is
  // wrong-language but at least readable.
  const key = `astroService.${service.key}`;
  const translated = t(key);
  return translated === key ? service.name : translated;
}

export default astroServiceLabel;
