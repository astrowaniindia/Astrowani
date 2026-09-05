/**
 * Which screen each paid astro service opens.
 *
 * Extracted from Home.js on 2026-09-05 when the Astro Reports list gained a second
 * surface (the shop-circle strip's "Reports" button -> AstroReportsScreen). Both read
 * the same map, because a service whose key is in one copy and not the other is a
 * button that silently does nothing — the same way the Remedies category list was
 * shared via remedyCategories.js for exactly this reason.
 *
 * Keys are the `key` column from GET /api/astro-services. An admin adding a service
 * there with no entry here has no screen to open, so `routeForService` returns null and
 * callers skip the navigation rather than crashing on an undefined route name.
 */
export const ASTRO_SERVICE_ROUTES = {
  kundli: 'KundliInputScreen',
  matching: 'MatchingInputScreen',
  chart: 'ChartInputScreen',
  dasha: 'DashaInputScreen',
  dosh: 'DoshInputScreen',
  numerology: 'NumerologyInputScreen',
  'lal-kitab': 'LalKitabInputScreen',
  'kp-astrology': 'KPAstrologyInputScreen',
  tarot: 'TarotScreen',
  'pdf-report': 'PdfReportInputScreen',
};

export function routeForService(key) {
  return ASTRO_SERVICE_ROUTES[key] || null;
}

/**
 * The artwork each report uses, keyed by the same service `key`.
 *
 * Home already had this map but keyed by a short display name ('Kundli',
 * 'Lal Kitab'), which meant it could not be reused anywhere that has a service
 * row in hand. Keyed by `key` here so Home and AstroReportsScreen show the SAME
 * image for the same report — two different pictures for one product is the kind
 * of drift that makes an app feel unfinished.
 */
export const ASTRO_SERVICE_ICONS = {
  kundli: 'https://img.icons8.com/color/128/scroll.png',
  matching: 'https://img.icons8.com/color/128/like.png',
  chart: 'https://img.icons8.com/color/128/combo-chart.png',
  dasha: 'https://img.icons8.com/color/128/planet.png',
  dosh: 'https://cdn-icons-png.flaticon.com/128/564/564619.png',
  numerology: 'https://img.icons8.com/color/128/123.png',
  'lal-kitab': 'https://img.icons8.com/color/128/book.png',
  'kp-astrology': 'https://img.icons8.com/color/128/compass.png',
  tarot: 'https://img.icons8.com/color/128/tarot-cards.png',
  'pdf-report': 'https://cdn-icons-png.flaticon.com/128/337/337946.png',
};

export function iconForService(key) {
  return ASTRO_SERVICE_ICONS[key] || null;
}
