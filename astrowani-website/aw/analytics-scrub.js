/**
 * What may leave this browser — the only security-relevant part of analytics.js,
 * kept in its own module with no browser globals so it can be run and asserted
 * on in Node. (`aw/test-analytics-scrub.js`, the same pattern the backend uses
 * for contactLeakDetector and chatImageComposer.)
 *
 * The reason this exists at all: the site reads `slug`, `id`, `cat`, `type`,
 * `mode` and `astrologer` from the query string today, and PostHog stamps
 * $current_url, $referrer and the initial person properties onto EVERY event. So
 * one personal value in one URL is one personal value on every event of that
 * session, and the SEO audit is explicit that personal data must stay out of
 * analytics and out of URLs. An allowlist is the only form of this that stays
 * correct when somebody adds a seventh parameter.
 */

/** Query parameters that may be reported. Everything else is dropped, not inspected. */
export const URL_PARAMS_KEPT = new Set(['slug', 'id', 'cat', 'type', 'mode', 'astrologer', 'page', 'lang']);

/**
 * Property keys that must never be sent.
 *
 * `name` is on the list on purpose. A call site that wants to say WHICH
 * astrologer sends `astrologer_id`; the same key on a customer-facing event is a
 * person's name, and no reviewer of a new call site should have to work out
 * which kind it is. A search term is allowed through as `term`, truncated —
 * what visitors look for is most of the point of analytics on a marketing site.
 *
 * `name` MATCHES AS A SUBSTRING, NOT A WORD. It was \bname\b first, and `_` is a
 * word character — so `customer_name` sailed straight through the guard that
 * exists to stop exactly that. No key this site sends contains the string.
 */
export const SENSITIVE_KEY = /phone|mobile|otp|email|name|dob|birth|address|pin|token|password|secret|message|text|transcript|caption/i;

export const MAX_STRING = 120;

/**
 * Strip every query parameter that is not on the allowlist.
 *
 * Returns undefined for anything unparseable rather than passing it through: a
 * value that is not a URL is a value nobody has checked, and this function's
 * whole job is to not forward those.
 */
export function scrubUrl(value, base) {
  if (!value || typeof value !== 'string') return value;
  try {
    const url = new URL(value, base);
    for (const key of Array.from(url.searchParams.keys())) {
      if (!URL_PARAMS_KEPT.has(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch (_) {
    return undefined;
  }
}

/** Scalars only, sensitive keys dropped, strings truncated. */
export function sanitiseProps(props) {
  const out = {};
  if (!props || typeof props !== 'object') return out;
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (value === null || value === undefined) continue;
    const type = typeof value;
    // An object or array is a shape nobody has checked for personal data, and
    // flattening one here would be guessing at what is in it.
    if (type === 'string') out[key] = value.slice(0, MAX_STRING);
    else if (type === 'number' || type === 'boolean') out[key] = value;
  }
  return out;
}

const URLISH_KEY = /url|referrer/i;

/**
 * PostHog's before_send hook: scrub the URL-bearing properties the SDK adds by
 * itself, including the ones inside $set / $set_once, which outlive the event as
 * person properties. Returns null to drop the event if scrubbing itself fails —
 * letting an unscrubbed event through would defeat the point, and dropping it
 * silently would hide a bug, so it also warns.
 */
export function scrubEvent(event, { base, warn = () => {} } = {}) {
  try {
    const props = event && event.properties;
    if (props) {
      for (const key of Object.keys(props)) {
        if (URLISH_KEY.test(key) && typeof props[key] === 'string') {
          props[key] = scrubUrl(props[key], base);
        }
      }
      for (const bag of ['$set', '$set_once']) {
        const set = props[bag];
        if (!set || typeof set !== 'object') continue;
        for (const key of Object.keys(set)) {
          if (URLISH_KEY.test(key) && typeof set[key] === 'string') {
            set[key] = scrubUrl(set[key], base);
          }
        }
      }
    }
  } catch (err) {
    warn('[aw/analytics] scrub failed; event dropped');
    return null;
  }
  return event;
}
