// Cleans the astrologer-editable profile text before it is stored (2026-11-13).
//
// WHY. An astrologer's name, languages and bio are shown to EVERY customer — in both
// apps and on the public website — and the website inserted them into HTML without
// escaping. One astrologer typing `<img src=x onerror=…>` into their own name ran script
// in every visitor's browser, with the customer's login token in localStorage. The
// website template is fixed too (script.js astroEsc); this is the second layer, so a
// future page or an export that forgets to escape cannot be turned against customers.
//
// It STRIPS rather than rejects: an installed app build that sends an odd character must
// still be able to save the rest of its profile. Nothing a real name, a language or a
// bio needs is removed — only angle brackets and control characters.
//
// No I/O, so scripts/testProfileText.js can exercise it directly.

const TEXT_FIELDS = ['first_name', 'last_name', 'bio', 'email', 'gender',
  'bank_account_holder', 'bank_account_number', 'bank_ifsc', 'bank_name', 'upi_id'];

function cleanText(v) {
  if (v == null) return v;
  if (typeof v !== 'string') return v;
  return v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/** A photo URL is kept only if it is plain https. javascript:, data: and the rest
 *  are dropped to null — an attribute escape alone does not neutralise a scheme. */
function cleanUrl(v) {
  if (v == null || v === '') return v;
  const s = String(v).trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
}

/**
 * Returns a shallow copy with every astrologer-editable text field cleaned. Fields that
 * are absent stay absent, so a partial PATCH-style update is unaffected.
 */
function cleanAstrologerProfile(body) {
  if (!body || typeof body !== 'object') return body;
  const out = { ...body };
  for (const k of TEXT_FIELDS) if (k in out) out[k] = cleanText(out[k]);
  if ('languages' in out) {
    if (Array.isArray(out.languages)) {
      out.languages = out.languages.map(cleanText).filter((x) => typeof x !== 'string' || x.length);
    } else {
      out.languages = cleanText(out.languages);
    }
  }
  if ('profile_pic_url' in out) out.profile_pic_url = cleanUrl(out.profile_pic_url);
  return out;
}

module.exports = { cleanAstrologerProfile, cleanText, cleanUrl };
