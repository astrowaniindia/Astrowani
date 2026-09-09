// Share an astrologer's profile out of the app: their photo, a formal introduction,
// and the Play Store link.
//
// TWO MODES, because the sentence changes with who is sharing:
//   'self'      the astrologer sharing their OWN profile  -> "I am X ... consult me"
//   'recommend' a customer sharing SOMEBODY ELSE'S        -> "I recommend X ... consult them"
// The vendor app has a near-identical copy of this file. Deliberately a per-app copy
// rather than a shared module: the two React Native apps have no common source root,
// so a "shared" file would have to be reached through a relative path out of one app
// and into the other, which breaks Metro's watch roots. Same reasoning as config/legal.js.
//
// WHY react-native-share AND NOT React Native's own Share:
// RN's built-in Share sends TEXT ONLY on Android -- its `url` is just appended to the
// message. Attaching an actual image needs the native module. It stays imported
// defensively all the same (see the fallback chain below), because a share that
// silently does nothing is worse than a share without a picture.
//
// NOTHING HERE MAY THROW INTO THE CALLER. Every failure degrades: photo -> no photo,
// rich sheet -> plain sheet. Sharing is a promotional nicety; it must never be able to
// break a profile screen.

import { Share as RNShare } from 'react-native';

// Loaded defensively, NOT as a static import.
//
// react-native-share's entry point runs TurboModuleRegistry.getEnforcing('RNShare')
// at module-evaluation time, which THROWS when the native module is absent. This file
// is reached from Navigation.js -> AstrologerInfo -> here at app startup, so a static
// import would crash the whole app on any build that predates the native dependency.
//
// That is not hypothetical: an OTA ships the entire JS bundle at the current commit to
// phones running the LAST STORE BUILD. Until a release carrying react-native-share is
// live, every installed app would white-screen on launch. Same class of trap as the
// react-native-razorpay 2.3.0 -> 3.0.0 bundle noted in CLAUDE.md.
//
// With this guard the old builds simply fall through to React Native's own Share
// (text, no photo -- see the fallback chain in shareAstrologerProfile) and start
// attaching the photo once the store build lands. Nothing to remove afterwards.
let Share = null;
try {
  // eslint-disable-next-line global-require
  Share = require('react-native-share').default || null;
} catch (_) {
  Share = null;
}
import { PLAY_STORE_URL } from '../config/api';

// Folded hands. Written as an escape rather than the literal character so the file
// survives any toolchain that is not UTF-8 clean end to end.
const NAMASTE = '\uD83D\uDE4F';

// The photo is a nicety; the message is the point. If the image is slow we send the
// text rather than leaving the user staring at a button that appears dead.
const IMAGE_TIMEOUT_MS = 6000;

// Used when the server does not say, or says something that is not an image type.
const DEFAULT_IMAGE_MIME = 'image/jpeg';

/**
 * Fetch a remote image and return it as a data: URI, which is what
 * react-native-share accepts directly -- avoiding a filesystem dependency
 * (the customer app has no react-native-fs).
 * Returns null on any failure or timeout; never throws.
 */
function mimeFromDataUri(uri) {
  const m = /^data:([^;,]+)/.exec(uri || '');
  return m && /^image\//.test(m[1]) ? m[1] : DEFAULT_IMAGE_MIME;
}

async function imageAsDataUri(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  // Already inline (older base64 profile rows) -- hand it straight back.
  if (imageUrl.startsWith('data:')) return { dataUri: imageUrl, mime: mimeFromDataUri(imageUrl) };
  if (!imageUrl.startsWith('http')) return null;

  try {
    const withTimeout = (async () => {
      const res = await fetch(imageUrl);
      if (!res.ok) return null;
      // Read the type from the RESPONSE HEADER, not from the Blob.
      //
      // React Native's Blob does not carry the content type through from fetch --
      // blob.type is an empty string even when the server sent "image/jpeg" (measured
      // on device: status 200, ctype image/jpeg, blob.size 57444, blob.type ""). With
      // no type, FileReader emits "data:application/octet-stream;base64,..." and
      // react-native-share cannot turn that into a file Uri. It fails inside its own
      // Android code with
      //     Attempt to invoke virtual method 'String android.net.Uri.getScheme()'
      //     on a null object reference
      // and the photo silently never attaches -- the exact bug this comment exists to
      // stop coming back. These profile URLs also carry NO file extension
      // (.../astrologer-profiles/1786899317973), so the type is the only signal there is.
      const headerMime = String(res.headers && res.headers.get('content-type') || '')
        .split(';')[0].trim().toLowerCase();
      const mime = /^image\//.test(headerMime) ? headerMime : DEFAULT_IMAGE_MIME;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onloadend = () => {
          const out = reader.result;
          if (typeof out !== 'string' || out.indexOf(',') < 0) return resolve(null);
          // Rebuild the prefix with the real type; keep the payload untouched.
          resolve({ dataUri: 'data:' + mime + ';base64,' + out.slice(out.indexOf(',') + 1), mime });
        };
        reader.readAsDataURL(blob);
      });
    })();

    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS));
    return await Promise.race([withTimeout, timeout]);
  } catch (_) {
    return null;
  }
}

/** "Vedic Astrology, Tarot" from the several shapes the API has used for specialties. */
function specialtiesText(astrologer) {
  const raw = astrologer?.specialties || astrologer?.categoryNames;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const names = raw
    .map((s) => (typeof s === 'string' ? s : s?.name))
    .filter(Boolean);
  return names.length ? names.slice(0, 4).join(', ') : null;
}

/**
 * The message body. Exported so it can be unit-tested without a share sheet, and so
 * the vendor app's copy can be diffed against this one.
 */
export function buildAstrologerShareMessage({ astrologer, mode = 'recommend', t }) {
  const name = astrologer?.name || astrologer?.firstName || t('share.fallbackName');
  // Emoji lives here, not in the translation files -- one definition instead of four
  // (two apps x two languages), and translators never have to preserve a surrogate pair.
  const lines = [NAMASTE + ' ' + t('share.namaste'), ''];

  lines.push(mode === 'self' ? t('share.selfLine', { name }) : t('share.otherLine', { name }));

  const years = Number(astrologer?.experience);
  if (Number.isFinite(years) && years > 0) lines.push(t('share.experienceLine', { years }));

  const specialties = specialtiesText(astrologer);
  if (specialties) lines.push(t('share.specialtiesLine', { list: specialties }));

  // Only a rating somebody actually gave. A default 5.0 with no reviews behind it
  // reads as a claim, and this text goes to strangers.
  const rating = Number(astrologer?.rating ?? astrologer?.averageRating);
  const reviews = Number(astrologer?.totalReviews);
  if (mode !== 'self' && Number.isFinite(rating) && rating > 0 && Number.isFinite(reviews) && reviews > 0) {
    // The review COUNT is deliberately not shown. It still gates the line -- a
    // rating nobody gave is a claim, not a fact -- but a genuine 5.0 from two
    // early customers reads as weaker than saying nothing, and this text goes
    // to strangers who cannot tell the difference between new and unpopular.
    lines.push(t('share.ratingLine', { rating: rating.toFixed(1) }));
  }

  lines.push('');
  lines.push(mode === 'self' ? t('share.selfClosing') : t('share.otherClosing', { name }));
  lines.push('');
  lines.push(t('share.downloadLine'));
  lines.push(PLAY_STORE_URL);

  return lines.join('\n');
}

/**
 * Open the share sheet for an astrologer's profile.
 *
 * @param {object}   astrologer  the profile being shared
 * @param {string}   mode        'self' | 'recommend'
 * @param {function} t           translation fn from LanguageContext
 * @param {function} [onEvent]   optional analytics hook: (name, props) => void
 * @returns {Promise<boolean>} whether the sheet opened (NOT whether the user sent)
 */
export async function shareAstrologerProfile({ astrologer, mode = 'recommend', t, onEvent }) {
  const message = buildAstrologerShareMessage({ astrologer, mode, t });
  // The two apps disagree about `userId`: it is the astrologer's id in the customer
  // app, but an OBJECT of name/gender/phone fields in the vendor app's Profile screen.
  // Take it only when it is actually a string, so analytics never receives an object
  // (or, worse, a phone number) in place of an id.
  const astrologerId = typeof astrologer?.userId === 'string'
    ? astrologer.userId
    : (astrologer?._id || astrologer?.id || null);
  const title = t('share.dialogTitle');
  const report = (name, props) => { try { onEvent && onEvent(name, props); } catch (_) {} };

  const imageUrl = astrologer?.profileImage || astrologer?.profile_pic_url || astrologer?.image;
  const image = await imageAsDataUri(imageUrl);

  // iOS infers what an attachment IS from the filename's EXTENSION, not from `type`.
  // With a bare 'astrowani-astrologer' the share sheet showed "File - 62 KB" and only
  // offered Copy / Print / Save to Files, instead of treating it as a photo. Android
  // is unaffected either way because react-native-share reads `type` there.
  // Measured on an iPhone 14 Pro simulator, 2026-09-09.
  const ext = image && /png/i.test(image.mime || '') ? '.png'
    : image && /webp/i.test(image.mime || '') ? '.webp'
    : '.jpg';

  // The share sheet shows the FILENAME as the item's title, so a generic
  // 'astrowani-astrologer' is what the recipient sees above the photo. Use the
  // astrologer's actual name instead.
  //
  // Sanitised because this becomes a real file on disk and is handed to another
  // app through a content provider: keep letters, COMBINING MARKS, digits, spaces,
  // underscores and hyphens; drop everything else, path separators included.
  //
  // \p{M} is NOT optional. Devanagari vowel signs (matras) are combining marks
  // rather than letters in Unicode, so matching only \p{L} silently strips them and
  // "आचार्य विशाल शर्मा" arrives as the mangled "आचरय वशल शरम".
  //
  // Whitespace runs are collapsed and the length capped, since some receivers
  // truncate or reject very long names. Falls back to the old slug if sanitising
  // leaves nothing usable (a name that was entirely punctuation, say).
  const shareName = String(astrologer?.name || astrologer?.firstName || '')
    .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
  const shareFilename = `${shareName || 'astrowani-astrologer'}${ext}`;

  // 1. Photo + text. `type` and `filename` are both required on Android: these profile
  //    URLs have no file extension, so without them react-native-share has nothing to
  //    derive a file name from and fails to build a Uri (see imageAsDataUri above).
  if (Share && image && image.dataUri) {
    try {
      await Share.open({
        title,
        message,
        url: image.dataUri,
        type: image.mime,
        filename: shareFilename,
        // MUST be true. react-native-share decodes the base64 to a real file and hands
        // the receiving app a content:// Uri for it. With this false (its default) it
        // writes to getExternalCacheDir()/Download -- which is null whenever external
        // storage is unavailable, so the write fails, getURI() returns null, and
        // ClipData.newUri then throws
        //     NullPointerException: ... android.net.Uri.getScheme() on a null object
        // inside the library. Our catch then falls through to text-only and the photo
        // silently never attaches. Measured on an Android 17 emulator.
        //
        // The library's own FileProvider config agrees: share_download_paths.xml
        // declares <cache-path path="/"> (the INTERNAL cache, which is what this flag
        // selects) but its <external-path path="Download/"> points at
        // /sdcard/Download, NOT at getExternalCacheDir()/Download where the external
        // branch actually writes. So the internal path is the only one wired up
        // correctly end to end.
        useInternalStorage: true,
        failOnCancel: false,
      });
      report('astrologer_profile_shared', { mode, with_image: true, astrologer_id: astrologerId });
      return true;
    } catch (_) {
      // fall through -- a share sheet that refuses an attachment must not lose the text
    }
  }

  // 2. Text only, still through the native sheet (skipped when the module is absent).
  try {
    if (!Share) throw new Error('react-native-share unavailable');
    await Share.open({ title, message, failOnCancel: false });
    report('astrologer_profile_shared', { mode, with_image: false, astrologer_id: astrologerId });
    return true;
  } catch (_) {}

  // 3. Last resort: React Native's own sheet. Covers the case where the native module
  //    is missing entirely -- e.g. a JS bundle that reached a build predating it.
  try {
    await RNShare.share({ message });
    report('astrologer_profile_shared', { mode, with_image: false, fallback: true, astrologer_id: astrologerId });
    return true;
  } catch (_) {}

  report('astrologer_profile_share_failed', { mode, astrologer_id: astrologerId });
  return false;
}

export default shareAstrologerProfile;
