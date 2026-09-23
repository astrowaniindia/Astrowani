import AsyncStorage from '@react-native-async-storage/async-storage';

// Which acquisition group this customer belongs to ('qr', 'ads', 'google', 'unknown'…),
// as decided by the backend and delivered on GET /api/users/profile.
//
// Kept in a module-level variable so a component can read it synchronously during its
// first render. Banners are the only consumer today, and they render on four different
// screens — threading a prop from each one would mean four screens fetching a profile
// they otherwise have no use for.
//
// FAILS OPEN, everywhere. A null segment means "we don't know", and every consumer
// treats that as "no filtering" — a banner must never be hidden because a profile read
// was slow, failed, or came from a build that predates the field.

let cached = null;
let hydrated = false;

/** Remember the segment from a freshly-loaded profile. */
export function setViewerSegment(segment) {
  cached = typeof segment === 'string' && segment ? segment : null;
}

/**
 * Read it synchronously. Returns null until a profile has been seen this launch, or
 * until hydrateViewerSegment() has restored the previous one.
 */
export function getViewerSegment() {
  return cached;
}

/**
 * Restore the last known segment from the profile the app already persists, so the very
 * first render after a cold start is not unfiltered. Safe to call repeatedly; only the
 * first call touches storage.
 */
export async function hydrateViewerSegment() {
  if (hydrated) return cached;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem('userData');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!cached && parsed?.segment) cached = String(parsed.segment);
    }
  } catch (_) {
    // Storage is unreadable — stay null, which means "show everything".
  }
  return cached;
}

/** Logout: the next customer on this device must not inherit the previous one's group. */
export function clearViewerSegment() {
  cached = null;
  hydrated = false;
}

export default { setViewerSegment, getViewerSegment, hydrateViewerSegment, clearViewerSegment };
