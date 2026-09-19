/**
 * Picks the look of a one-button alert from what it actually says.
 *
 * Every single-button Alert.alert in the app is re-skinned by App.js. It used to
 * decide "success if the title contains 'success', otherwise ERROR" — so a
 * cancelled payment, "please fill all fields" and "astrologer not available"
 * all rendered with a red error icon. Red is now reserved for nothing: a real
 * failure gets a soft amber warning, everything else a calm, matching icon.
 *
 * Order matters: "payment cancelled successfully" is a cancellation, and
 * "login failed: no internet" is a network problem.
 */
const has = (text, words) => words.some((w) => text.includes(w));

const CANCELLED = ['cancel', 'रद्द'];
const NETWORK = ['network', 'internet', 'no connection', 'offline', 'नेटवर्क', 'इंटरनेट'];
const PERMISSION = ['permission', 'denied', 'अनुमति'];
const UNAVAILABLE = ['unavailable', 'not available', 'busy', 'उपलब्ध नहीं', 'व्यस्त'];
const FAILURE = ['fail', 'could not', "couldn't", 'unable', 'went wrong', 'error', 'विफल', 'त्रुटि', 'गलत हो',
  'nahi ho paa']; // Hinglish signup copy: "save nahi ho paayi"
const SUCCESS = ['success', 'copied', 'booking', 'submitted', 'thank', 'saved', 'updated',
  'logged out', 'deleted', 'सफल', 'धन्यवाद'];

// Titles that say nothing and only make a notice look like a crash.
const GENERIC_TITLES = ['error', 'त्रुटि', 'alert', 'oops'];

export function isGenericTitle(title) {
  return GENERIC_TITLES.includes(String(title || '').trim().toLowerCase());
}

/** @returns 'success'|'cancelled'|'network'|'permission'|'unavailable'|'warning'|'info' */
export function alertTone(title, message) {
  // A generic "Error" title carries no signal — judge by the message alone.
  const t = isGenericTitle(title) ? '' : String(title || '');
  // "Validation Error: phone number cannot be empty" is a nudge, not a failure.
  if (/validation|invalid/i.test(t)) return 'info';
  const text = `${t} ${message || ''}`.toLowerCase();
  if (has(text, CANCELLED)) return 'cancelled';
  if (has(text, NETWORK)) return 'network';
  if (has(text, PERMISSION)) return 'permission';
  if (has(text, UNAVAILABLE)) return 'unavailable';
  if (has(text, FAILURE)) return 'warning';
  if (has(text, SUCCESS)) return 'success';
  return 'info';
}
