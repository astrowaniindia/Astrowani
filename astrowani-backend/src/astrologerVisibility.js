/**
 * Who an astrologer may be SHOWN to customers as: approved, not suspended, not
 * a store-reviewer/test account, and profile-complete.
 *
 * Moved verbatim out of index.js on 2026-11-16 so the public website profile
 * pages (src/astrologerProfilePages.js) apply EXACTLY the rule the app's lists
 * use. Two copies of a visibility rule drift, and the drift would be a hidden
 * or suspended astrologer with a public, indexed page.
 */
// Whether an astrologer's core profile is complete: full name, valid email, gender,
// experience, profile photo, at least one language, and at least one per-minute charge.
function astrologerProfileComplete(row) {
  if (!row) return false;
  const s = (v) => (v == null ? '' : String(v)).trim();
  const name = (s(row.first_name) + ' ' + s(row.last_name)).trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(row.email));
  const hasPhoto = !!(s(row.profile_image) || s(row.profile_pic_url));
  const langs = row.languages || row.language;
  const hasLang = Array.isArray(langs) ? langs.length > 0 : !!s(langs);
  const expOk = Number(row.experience) > 0;
  const hasCharge =
    Number(row.chat_charge_per_minute) > 0 ||
    Number(row.call_charge_per_minute) > 0 ||
    Number(row.video_charge_per_minute) > 0;
  return !!(name && emailOk && s(row.gender) && expOk && hasPhoto && hasLang && hasCharge);
}

// An astrologer shows in the customer app only when admin-approved, not suspended,
// AND profile-complete. New signups (approval_status='pending') and half-filled
// profiles therefore stay hidden until both gates pass.
function astrologerVisibleToCustomers(row) {
  return (
    row &&
    row.approval_status === 'approved' &&
    row.is_suspended !== true &&
    // App Store / Play Store reviewer and other test accounts can use the astrologer
    // app but must never be offered to real, paying customers.
    row.hidden_from_customers !== true &&
    astrologerProfileComplete(row)
  );
}

module.exports = { astrologerProfileComplete, astrologerVisibleToCustomers };
