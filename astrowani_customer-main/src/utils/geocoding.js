// Keyless, billing-free geocoding helpers.
//
// The app previously relied on Google Maps (Places + Geocoding) via a key
// hardcoded in the bundle. That key's Cloud project had billing disabled, so
// every call returned REQUEST_DENIED and every screen that needed coordinates
// silently dead-ended — most visibly the paid astro reports, whose Pay button
// is gated on having coordinates (2026-08-15).
//
// These providers need no API key, no billing account and no signup, so there
// is no credential to expire and nothing to keep funded:
//   - forward search  : Open-Meteo geocoding  (see components/PlaceAutocomplete)
//   - reverse lookup  : BigDataCloud reverse-geocode-client
//
// Both throw on failure rather than returning a silently empty result, so
// callers are forced to handle the error path instead of leaving the user
// staring at a control that does nothing.

const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/**
 * Coordinates -> a human place name ("Nagpur, Maharashtra, India").
 * Throws if the lookup fails; callers should surface that, not swallow it.
 */
export async function reverseGeocode(latitude, longitude) {
  const url = `${REVERSE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reverse geocode failed: HTTP ${res.status}`);
  const j = await res.json();
  const label = [
    j.city || j.locality,
    j.principalSubdivision,
    j.countryName,
  ].filter(Boolean).join(', ');
  if (!label) throw new Error('Reverse geocode returned no place name');
  // BigDataCloud nests finer-grained names in an administrative array ordered
  // coarse -> fine; the last entry is the neighbourhood/suburb, which is the most useful
  // thing to drop into a "street, area, locality" field.
  const admin = Array.isArray(j.localityInfo?.administrative) ? j.localityInfo.administrative : [];
  const finest = admin.length ? admin[admin.length - 1]?.name : '';

  return {
    label,
    city: j.city || j.locality || '',
    region: j.principalSubdivision || '',
    country: j.countryName || '',
    // Empty strings rather than undefined, so callers can assign straight into form state.
    postcode: j.postcode || '',
    locality: j.locality || '',
    area: [j.locality, finest].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '),
  };
}
