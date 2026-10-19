/**
 * The one definition of "which platform is this request from".
 *
 * Both apps send a `devicePlatform` field on login (see each app's
 * src/utils/devicePlatform.js and the vendor app's deviceId.js `deviceInfoPayload`).
 * It lands in `vendor_devices.platform` for astrologers and in
 * `customers.platform` / `customers.signup_platform` for customers — all three
 * CHECK-constrained to ('ios','android','unknown').
 *
 * WHY A WHITELIST AND NOT A PASS-THROUGH. This value arrives from a client and is
 * read back by the admin dashboard, so a hand-crafted request must not be able to
 * put an arbitrary string in front of an admin. The database CHECKs are the real
 * backstop; this is the layer that stops a bad value turning a best-effort write
 * into a constraint violation in the first place. Same posture as
 * acquisition.resolveFromRequest, which likewise re-derives rather than trusting.
 *
 * ABSENT IS NOT 'unknown', AND THE DIFFERENCE IS LOAD-BEARING. `null` means the
 * build did not tell us — every customer who signed up before this shipped, and
 * every installed build that predates the app-side change. 'unknown' means a
 * request sent something we did not recognise. Callers must therefore check for
 * null and write NOTHING, rather than stamping 'unknown' over a value a later
 * login already established correctly. normalizePlatform returns null for a
 * missing value precisely so that distinction survives.
 */

/** Everything the columns accept, minus the 'unknown' fallback. */
const KNOWN = ['ios', 'android'];

/**
 * @param {unknown} value the raw `devicePlatform` from a request body
 * @returns {'ios'|'android'|'unknown'|null} null when nothing usable was sent — the
 *   caller must then write nothing at all (see the note above).
 */
function normalizePlatform(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'unknown';

  const trimmed = value.trim().toLowerCase();
  // An empty or whitespace-only string is a build that sent the field without a
  // value, which tells us nothing — treated as absent, not as 'unknown'.
  if (!trimmed) return null;

  return KNOWN.includes(trimmed) ? trimmed : 'unknown';
}

module.exports = { normalizePlatform, KNOWN };
