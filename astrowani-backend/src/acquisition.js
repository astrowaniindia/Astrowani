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
// Organic Play traffic and our own tagged links set a utm_source that can never begin
// with that prefix, so "is this a QR customer" is a prefix test. There is no second
// channel column and none is needed.
//
// GOOGLE ADS DOES NOT SEND A utm_source AT ALL, and the original version of this file
// assumed it did ("Google Ads ... set their own utm_source values"). It does not. An
// app-install referrer from Google Ads looks like:
//   gclid=CjwKCAjww-3V...&gbraid=0AAAAB...&gad_source=3&gad_campaignid=24260607071
// There is no utm_* parameter anywhere in it. So every paid install parsed to a NULL
// acquisition_source, and attribution was silently blind for the one channel we pay
// for — 94% of all installs as of 2026-10-08, reported as "unknown" alongside iOS and
// sideloads. `acquisition_raw` kept the full string throughout, which is the only
// reason this is fixable after the fact (see sql/acquisition_backfill_google_ads.sql).
//
// Those installs are now labelled `google_ads_<campaignId>`, which:
//   - keeps channelOf()'s /^google/ test working, so the reporting channel is
//     unchanged for anything that already grouped on it;
//   - cannot collide with the `qr_` convention above;
//   - carries the campaign id in the column itself, so every existing per-source
//     screen (admin QR page, audience targeting, analytics exclusions) splits by
//     campaign with no migration and no new column.
const QR_PREFIX = 'qr_';

// Marks a paid Google Ads install. `google_ads_<campaignId>` when the campaign id is
// present, bare `google_ads` when only a click id came through.
const GOOGLE_ADS_PREFIX = 'google_ads';

// Parameters that identify a Google Ads click. `gclid` is the click id; `gbraid` is
// its app/web-to-app equivalent; `gad_source`/`gad_campaignid` accompany both. Any one
// of them is enough to call the install paid.
const GOOGLE_ADS_MARKERS = ['gclid', 'gbraid', 'gad_source', 'gad_campaignid'];

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
    const params = new URLSearchParams(raw);
    source = normalizeSource(params.get('utm_source'));

    // No utm_source: this is where Google Ads lands. A utm_source, when present, still
    // wins — it is either ours (a QR poster, an `ad_` link) or organic Play's
    // `google-play`, and both are more specific statements than "came from an ad".
    if (!source && GOOGLE_ADS_MARKERS.some((k) => params.get(k))) {
      // Digits only, and bounded: the campaign id is concatenated into a value that is
      // grouped on and printed in the admin, so it gets the same treatment as any
      // other untrusted referrer field rather than being trusted because it came from
      // a parameter Google happens to own.
      const campaignId = (params.get('gad_campaignid') || '').replace(/[^0-9]/g, '').slice(0, 24);
      source = normalizeSource(campaignId ? `${GOOGLE_ADS_PREFIX}_${campaignId}` : GOOGLE_ADS_PREFIX);
    }
  } catch (_) {
    // URLSearchParams does not throw for malformed input in practice, but a referrer
    // is attacker-influenced and a parse failure must never cost someone their signup.
    source = null;
  }

  return { source, raw };
}

/**
 * The Google Ads campaign id carried by a stored source, or null.
 *
 * `google_ads_24260607071` -> '24260607071'; `google_ads` (click id only) -> null.
 * Lets a report group by campaign without re-parsing the raw referrer.
 */
function campaignIdOf(source) {
  if (typeof source !== 'string') return null;
  const m = source.match(new RegExp(`^${GOOGLE_ADS_PREFIX}_([0-9]+)$`));
  return m ? m[1] : null;
}

/** True for a paid Google Ads install. */
const isGoogleAdsSource = (source) =>
  typeof source === 'string' && source.startsWith(GOOGLE_ADS_PREFIX);

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
  // Both paid and organic Google traffic bucket to 'google': `google_ads_<id>` from a
  // paid click (see GOOGLE_ADS_PREFIX above) and `google-play` from organic Play
  // browsing. The prefix test covers both, which is why the paid label was chosen to
  // start with 'google' — every existing consumer of this function keeps working.
  if (/^google/.test(source)) return 'google';
  return 'other';
}

module.exports = {
  QR_PREFIX,
  GOOGLE_ADS_PREFIX,
  MAX_SOURCE_LEN,
  MAX_RAW_LEN,
  normalizeSource,
  parseReferrer,
  resolveFromRequest,
  isQrSource,
  isGoogleAdsSource,
  campaignIdOf,
  channelOf,
};
