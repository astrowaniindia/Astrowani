// astrowani-backend/src/customerLookup.js
//
// Tolerant "find the account behind this JWT phone claim" lookup.
//
// THE BUG THIS EXISTS TO KILL
// Thirteen separate call sites resolved the caller by doing, verbatim:
//
//     .from('customers').select(...).eq('mobile', decoded.phone)
//
// an EXACT match between a JWT claim and a column. The Aug-2026 OTP audit
// canonicalized both endpoints and migrated existing rows to bare 10 digits
// (scripts/normalizePhoneNumbers20260818.js), which fixed the DATA -- but a JWT
// minted BEFORE that change still carries a raw claim like "+919119395097" or
// "919119395097". Those tokens live in AsyncStorage until the user happens to log
// out, so they keep arriving indefinitely.
//
// When the claim and the column disagree by so much as a "+91", the lookup finds
// nothing, and the failure is never a clean 401 "log in again" -- it is whatever
// each call site does with a null:
//   * PUT /api/users/profile  -> 404 "Customer not found" (reported from a real
//                                phone: edit profile silently refuses to save)
//   * login (intent: 'login') -> 404 NO_ACCOUNT, and therefore no SMS at all
//   * wallet / orders / astro reports / referrals -> caller treated as absent
// i.e. one stale token quietly breaks most of the app for that person, with an
// error message that blames the account rather than the token.
//
// WHY NOT JUST NORMALIZE THE CLAIM
// Normalizing the incoming claim alone assumes every stored row is canonical. The
// migration made that true as of Aug 2026 with ONE deliberate exception noted in
// the audit, and nothing stops a future import from reintroducing another. So this
// matches from BOTH directions: the claim is canonicalized, and the query also
// accepts the known legacy shapes of the same number. One round trip, via .in().
//
// This does NOT weaken identity. Every variant below is the same 10 national
// digits; it is the same handset either way. It cannot match a different person's
// account, because two different numbers never share a canonical form.

/** Bare 10 digits, or null. Mirrors normalizePhone() in index.js. */
function canonicalDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  // "919876543210" -> country code prefix
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  // "09876543210" -> landline-style trunk prefix
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

/**
 * Every shape this number could plausibly be stored as, canonical first.
 * Ordered so the overwhelmingly common case is the first thing Postgres matches.
 */
function phoneVariants(raw) {
  const ten = canonicalDigits(raw);
  if (!ten) {
    // Unparseable: fall back to the literal string so behaviour is never WORSE
    // than the exact-match code this replaces.
    const literal = String(raw || '').trim();
    return literal ? [literal] : [];
  }
  return [ten, `+91${ten}`, `91${ten}`, `0${ten}`];
}

/**
 * Resolve a customer row from a JWT phone claim, tolerating legacy formats on
 * either side.
 *
 * @param {object} db       Supabase client (anon or service — caller's choice)
 * @param {string} phone    decoded.phone from the JWT
 * @param {string} columns  select() list, e.g. 'id, name'
 * @returns {Promise<object|null>} the row, or null
 */
async function findCustomerByPhone(db, phone, columns = 'id, name') {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  const { data, error } = await db
    .from('customers')
    .select(columns)
    .in('mobile', variants)
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0];
}

/** Same, for the astrologers table (its column is phone_number). */
async function findAstrologerByPhone(db, phone, columns = 'id') {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  const { data, error } = await db
    .from('astrologers')
    .select(columns)
    .in('phone_number', variants)
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0];
}

module.exports = {
  canonicalDigits,
  phoneVariants,
  findCustomerByPhone,
  findAstrologerByPhone,
};
