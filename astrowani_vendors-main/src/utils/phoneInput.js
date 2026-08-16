// Shared sanitizer for the phone-number field on Login and Registration.
//
// WHY: reported 2026-08-16 (customer app, same backend endpoint) as "OTP
// works for my number, not my friend's" — the phone TextInputs relied on a
// bare `maxLength` with no filtering, so pasting a number with the country
// code ("+91 98765 43210") got silently TRUNCATED to the first N characters
// — losing real digits — rather than cleaned up. The backend's
// toE164Strict (astrowani-backend/index.js) now normalizes a leading "91"
// or a landline-style leading "0" on its own, but only if those digits
// actually reach it; a maxLength cut before that already threw some away.
// This runs on every keystroke/paste so the field always holds a plausible
// number, not a truncated fragment of one.
//
// Deliberately permissive — strips non-digits and trims runaway length, but
// does not itself reject a leading 0 or a country code the way the
// backend's toE164Strict does. That real validation stays server-side.
export function sanitizePhoneInput(text) {
  // 12 covers every legitimate shape toE164Strict accepts: plain (10), a
  // leading landline-style 0 (11), or a pasted "91" country code (12).
  return String(text || '').replace(/\D/g, '').slice(0, 12);
}
