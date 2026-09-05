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
