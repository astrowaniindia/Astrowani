/**
 * Safe values for hand-built PostgREST filter strings (`.or(...)`, `.in(...)`).
 *
 * This is NOT about SQL injection — PostgREST parameterises the SQL it generates, so
 * no value reaching it can become SQL. It is about the LOGIC TREE that `.or()` parses.
 * A value interpolated raw into one of those strings can close the group it is in and
 * add predicates of its own, which changes WHICH ROWS come back.
 *
 * Measured against production on 2026-10-02, with the real shape of
 * GET /api/vendor/chat-threads/:customerId:
 *
 *   .or(`and(sender_id.eq.${vendorId},receiver_id.eq.${customerId}),
 *        and(sender_id.eq.${customerId},receiver_id.eq.${vendorId})`)
 *
 * a `customerId` of `<uuid>),id.not.is.null,and(sender_id.eq.<uuid>` turned a
 * correctly-scoped 0-row query into "every row in chat_messages" — on the
 * SERVICE-ROLE client, which bypasses RLS. One astrologer could read every private
 * conversation on the platform.
 *
 * Two tools, and the right one depends on the column:
 *
 *   - `isUuid()` for a uuid column. Prefer it: the value is either a uuid or the
 *     request is malformed, so a 400 is the honest answer and nothing has to be
 *     escaped at all.
 *   - `quoteFilterValue()` for a text column (search boxes, ilike patterns), where
 *     any string is legitimately a value. PostgREST lets a filter value be
 *     double-quoted, with `"` and `\` backslash-escaped inside; a quoted value is
 *     read as one literal no matter what punctuation it contains.
 *
 * Verified 2026-10-02 against the live API: with quoting, a search term carrying
 * `%,id.not.is.null,title.ilike.%` returns 0 rows instead of the whole table, while
 * an ordinary term still matches exactly as before and an embedded quote or
 * backslash no longer 400s the query.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed UUID. Use to reject, not to sanitise. */
function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

const BACKSLASH = String.fromCharCode(92);
const DQUOTE = String.fromCharCode(34);

/**
 * A PostgREST filter value that can never break out of its position in a logic tree.
 * Returns the value double-quoted, so `,` `(` `)` and `.` inside it are literal.
 *
 * Note this quotes for POSTGREST, not for SQL LIKE — `%` and `_` keep their wildcard
 * meaning, which is what a search box wants.
 */
function quoteFilterValue(value) {
  const escaped = String(value == null ? '' : value)
    .split(BACKSLASH).join(BACKSLASH + BACKSLASH)
    .split(DQUOTE).join(BACKSLASH + DQUOTE);
  return DQUOTE + escaped + DQUOTE;
}

/** `quoteFilterValue` around an ilike pattern, i.e. `%term%` with the term made safe. */
function quoteLikePattern(term) {
  return quoteFilterValue(`%${String(term == null ? '' : term).trim()}%`);
}

/**
 * Make an array safe to hand to `.in()` / `.notIn()`.
 *
 * `.in()` has the same logic-tree problem as `.or()`, for a different reason: it builds
 * `in.(a,b,c)` itself, and postgrest-js 2.108.2 quotes a value only when it contains one
 * of `[,()]` — WITHOUT escaping a `"` or `\` inside it:
 *
 *   if (typeof s === 'string' && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`
 *
 * So a value carrying BOTH a comma and a quote closes the quoting the library just added
 * and becomes several values. Measured against production 2026-10-02: a single-element
 * array `['ZZNOPE","gemstone']` matched 33 rows instead of 0.
 *
 * This escapes exactly the two characters the library forgets, and only for strings, so
 * the library's own typed handling is left completely alone — numbers, booleans, uuids
 * and `null` pass through untouched (`null` must stay `null`, not the string "null").
 *
 * It is a NO-OP for any value that contains no quote or backslash, which is every value
 * the 83 existing `.in()` call sites pass (uuids, ids read back from the database,
 * whitelisted enum strings). Verified against production: identical row counts escaped
 * vs not on text, uuid, integer and boolean columns, and the breakout above drops to 0.
 *
 * Use it on any array whose values came from a request. Arrays built from ids this
 * server read out of the database do not need it, but applying it costs nothing.
 */
function safeInValues(values) {
  if (!Array.isArray(values)) return values;
  return values.map((v) => (typeof v === 'string'
    ? v.split(BACKSLASH).join(BACKSLASH + BACKSLASH).split(DQUOTE).join(BACKSLASH + DQUOTE)
    : v));
}

module.exports = { isUuid, quoteFilterValue, quoteLikePattern, safeInValues };
