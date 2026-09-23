// astrowani-backend/src/acquisition.js
//
// Where a customer came from: parsing the Play Install Referrer string the app sends
// at signup, and the naming convention that keeps offline QR posters separate from
// Google Ads and from organic Play Store traffic.
//
// See sql/acquisition_source.sql for the columns and the reasoning behind them.
//
// THE CONVENTION, which everything here depends on:
//   every QR poster's utm_source starts with `qr_`.
// Google Ads and organic Play traffic set their own utm_source values and can never
// begin with that prefix, so "is this a QR customer" is a prefix test. There is no
// second channel column and none is needed.

// The prefix that marks one of our offline QR posters.
const QR_PREFIX = 'qr_';

// Deliberately short. A utm_source is a label we choose ourselves and print on a
// poster; anything approaching this length is a mistake or an injection attempt, not
// a real campaign name.
const MAX_SOURCE_LEN = 80;
// The raw referrer is Google's, not ours, so it gets more room — but still bounded,
// since it arrives in a request body from an untrusted client.
const MAX_RAW_LEN = 500;

/**
 * Normalize a utm_source into the value stored in customers.acquisition_source.
 *
 * Lowercased, and reduced to [a-z0-9_.-]. Anything else is dropped rather than
 * escaped: these values are grouped on, printed in the admin, and interpolated into
 * labels, and a source name has no legitimate reason to contain anything else.
 * Returns null for anything that survives as empty.
 */
function normalizeSource(value) {
  if (value == null) return null;
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, MAX_SOURCE_LEN);
  return cleaned || null;
}

/**
 * Pull utm_source out of a Play Install Referrer string.
 *
 * The referrer arrives as a urlencoded query string, e.g.
 *   utm_source=qr_har_ki_pauri&utm_medium=offline&utm_campaign=qr_launch
 * Organic Play browsing sends `utm_source=google-play&utm_medium=organic`, and Google
 * Ads sends its own — both are stored verbatim, which is what keeps the channels
 * distinguishable without a separate flag.
 *
 * Parsed with URLSearchParams rather than a regex so that percent-encoding and
 * parameter order are handled the way Google actually sends them. A referrer that is
 * not a query string at all (some OEM stores send a bare token) yields null, and the
 * raw value is still kept — which is exactly the case acquisition_raw exists for.
 */
function parseReferrer(referrer) {
  if (!referrer) return { source: null, raw: null };

  const raw = String(referrer).trim().slice(0, MAX_RAW_LEN);
  if (!raw) return { source: null, raw: null };

  let source = null;
  try {
    source = normalizeSource(new URLSearchParams(raw).get('utm_source'));
  } catch (_) {
    // URLSearchParams does not throw for malformed input in practice, but a referrer
    // is attacker-influenced and a parse failure must never cost someone their signup.
    source = null;
  }

  return { source, raw };
}

/**
 * Accept what the app sent at signup.
 *
 * The app sends the already-parsed source plus the raw string, because it has to read
 * the referrer natively anyway. Both are re-derived/re-validated here regardless — the
 * client is not the authority on what goes in the column, and a hand-crafted request
 * could otherwise write any string it liked into a field the admin reads back.
 *
 * If a raw referrer is present, the source parsed FROM IT wins over whatever the
 * client claimed the source was. The client's own value is used only when no raw
 * string came through (which is how an older or non-Play build would behave).
 */
function resolveFromRequest({ acquisitionSource, acquisitionRaw } = {}) {
  const fromRaw = parseReferrer(acquisitionRaw);
  if (fromRaw.source) return fromRaw;

  return {
    source: normalizeSource(acquisitionSource),
    raw: fromRaw.raw,
  };
}

/** True for one of our offline QR posters. */
const isQrSource = (source) => typeof source === 'string' && source.startsWith(QR_PREFIX);

/**
 * Bucket a stored source into a reporting channel.
 *
 * `unknown` is its own bucket and is NOT folded into organic. A null source means we
 * never learned where they came from — every pre-2026-09 customer, every iOS customer,
 * every sideload — which is a different statement from "they found us on their own".
 */
function channelOf(source) {
  if (!source) return 'unknown';
  if (isQrSource(source)) return 'qr';
  // Google Ads installs carry a referrer whose medium/campaign identify the ad, but
  // whose source is Google's own. Organic Play browsing is 'google-play' with
  // medium=organic. Neither is ours to attribute, and both are reported as-is.
  if (/^google/.test(source)) return 'google';
  return 'other';
}

module.exports = {
  QR_PREFIX,
  MAX_SOURCE_LEN,
  MAX_RAW_LEN,
  normalizeSource,
  parseReferrer,
  resolveFromRequest,
  isQrSource,
  channelOf,
};
