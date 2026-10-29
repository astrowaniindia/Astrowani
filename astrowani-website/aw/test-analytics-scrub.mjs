/**
 * What analytics may and may not send. Run it:
 *
 *   node aw/test-analytics-scrub.js
 *
 * No network, no browser, no PostHog. It tests aw/analytics-scrub.js, which is
 * the whole reason that module is separate from analytics.js: the rest of that
 * file needs `location` and `localStorage` at import time, so none of this could
 * be asserted on without a browser.
 *
 * EVERY DROP TEST IS PAIRED WITH A KEEP TEST. A scrubber that returned {} for
 * everything would pass every "does not leak" assertion on its own and silently
 * turn analytics off, which is the failure mode worth guarding against here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// analytics-scrub.js is an ES module with a .js extension, and this directory
// cannot carry {"type":"module"} because apply-seo.js, bump-version.js and
// make-hindi-pages.js all sit beside it and are CommonJS. Renaming it to .mjs
// would be worse: aw/bump-version.js only adds ?v= to '.js' imports, so the
// browser would cache it forever at an unchanging URL. So the test imports a
// temporary copy with the extension Node needs.
const SRC = new URL('./analytics-scrub.js', import.meta.url);
const tmp = path.join(os.tmpdir(), `aw-analytics-scrub-${process.pid}.mjs`);
fs.writeFileSync(tmp, fs.readFileSync(SRC, 'utf8'));
let mod;
try {
  mod = await import(pathToFileURL(tmp).href);
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}
const { URL_PARAMS_KEPT, SENSITIVE_KEY, MAX_STRING, scrubUrl, sanitiseProps, scrubEvent } = mod;

let pass = 0;
const failures = [];

function ok(label, cond) {
  if (cond) pass += 1;
  else failures.push(label);
}

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const BASE = 'https://astrowani.com';

// ── scrubUrl: the positive controls first ──────────────────────────────────────

eq(
  'keeps an article slug',
  scrubUrl('https://astrowani.com/blog-post.html?slug=mangal-dosh', BASE),
  'https://astrowani.com/blog-post.html?slug=mangal-dosh',
);
eq(
  'keeps every allowlisted parameter at once',
  scrubUrl('https://astrowani.com/x?slug=a&id=b&cat=c&type=audio&mode=chat&astrologer=d&page=2&lang=hi', BASE),
  'https://astrowani.com/x?slug=a&id=b&cat=c&type=audio&mode=chat&astrologer=d&page=2&lang=hi',
);
ok('the allowlist is the eight documented parameters', URL_PARAMS_KEPT.size === 8);

// ── scrubUrl: the drops ───────────────────────────────────────────────────────

eq(
  'drops a phone number, keeps the slug beside it',
  scrubUrl('https://astrowani.com/?slug=keep&phone=9999999999', BASE),
  'https://astrowani.com/?slug=keep',
);
eq(
  'drops an OTP',
  scrubUrl('https://astrowani.com/?otp=123456', BASE),
  'https://astrowani.com/',
);
eq(
  'drops a session id',
  scrubUrl('https://astrowani.com/chat.html?session=0f8a-uuid&astrologer=keep', BASE),
  'https://astrowani.com/chat.html?astrologer=keep',
);
eq(
  'drops parameters nobody has reviewed, such as a future one',
  scrubUrl('https://astrowani.com/?email=a@b.c&utm_term=x&anything=y', BASE),
  'https://astrowani.com/',
);
eq(
  'keeps the path and the fragment',
  scrubUrl('https://astrowani.com/calculators.html?phone=1#numerology', BASE),
  'https://astrowani.com/calculators.html#numerology',
);
eq('resolves a relative URL against the base', scrubUrl('/about.html', BASE), 'https://astrowani.com/about.html');
eq('an unparseable value is dropped, not forwarded', scrubUrl('not a url at all', undefined), undefined);
eq('a non-string is returned untouched', scrubUrl(null, BASE), null);

// ── sanitiseProps: the positive controls ──────────────────────────────────────

eq(
  'keeps the properties the call sites actually send',
  sanitiseProps({
    astrologer_id: 'abc-123',
    rate: 25,
    mode: 'chat',
    call_type: 'audio',
    amount: 500,
    settled: true,
    reason: 'busy_live',
    stage: 'payment',
    duration_seconds: 184,
    connected: false,
    slug: 'mangal-dosh',
    article_language: 'hi',
    store: 'play',
    page: 'index',
    site_language: 'en',
    term: 'vastu for a rented flat',
  }),
  {
    astrologer_id: 'abc-123',
    rate: 25,
    mode: 'chat',
    call_type: 'audio',
    amount: 500,
    settled: true,
    reason: 'busy_live',
    stage: 'payment',
    duration_seconds: 184,
    connected: false,
    slug: 'mangal-dosh',
    article_language: 'hi',
    store: 'play',
    page: 'index',
    site_language: 'en',
    term: 'vastu for a rented flat',
  },
);
ok('zero survives (it is a real duration, not a missing one)', sanitiseProps({ duration_seconds: 0 }).duration_seconds === 0);
ok('false survives', sanitiseProps({ connected: false }).connected === false);

// ── sanitiseProps: the drops ──────────────────────────────────────────────────

for (const key of [
  'phone',
  'phoneNumber',
  'mobile',
  'otp',
  'email',
  'name',
  'customer_name',
  'astrologer_name',
  'dob',
  'birth_time',
  'date_of_birth',
  'address',
  'pin',
  'token',
  'password',
  'secret',
  'message',
  'text',
  'transcript',
  'caption',
]) {
  eq(`drops ${key}`, sanitiseProps({ [key]: 'x', amount: 1 }), { amount: 1 });
}
ok('customer_name is caught (a \\b boundary would have missed it)', SENSITIVE_KEY.test('customer_name'));
eq('drops nested objects rather than flattening them', sanitiseProps({ user: { id: 1 }, amount: 1 }), { amount: 1 });
eq('drops arrays', sanitiseProps({ tags: ['a'], amount: 1 }), { amount: 1 });
eq('drops null and undefined', sanitiseProps({ a: null, b: undefined, amount: 1 }), { amount: 1 });
eq('no properties at all is an empty object, never a throw', sanitiseProps(undefined), {});
ok(
  'truncates a long string to MAX_STRING',
  (sanitiseProps({ term: 'x'.repeat(500) }).term || '').length === MAX_STRING,
);

// ── scrubEvent ────────────────────────────────────────────────────────────────

const event = {
  event: 'recharge_started',
  properties: {
    amount: 500,
    $current_url: 'https://astrowani.com/wallet.html?phone=9999999999&slug=keep',
    $referrer: 'https://astrowani.com/?otp=123456',
    $pathname: '/wallet.html',
    $set: { $initial_current_url: 'https://astrowani.com/?phone=9999999999' },
    $set_once: { $initial_referrer: 'https://astrowani.com/?email=a@b.c' },
  },
};
const scrubbed = scrubEvent(event, { base: BASE });
eq('scrubs $current_url', scrubbed.properties.$current_url, 'https://astrowani.com/wallet.html?slug=keep');
eq('scrubs $referrer', scrubbed.properties.$referrer, 'https://astrowani.com/');
eq('scrubs the initial URL in $set', scrubbed.properties.$set.$initial_current_url, 'https://astrowani.com/');
eq('scrubs the initial referrer in $set_once', scrubbed.properties.$set_once.$initial_referrer, 'https://astrowani.com/');
eq('leaves everything else alone', scrubbed.properties.amount, 500);
eq('leaves a non-URL property alone', scrubbed.properties.$pathname, '/wallet.html');
ok('returns the event, so it is still sent', scrubbed === event);
ok('an event with no properties passes through', scrubEvent({ event: 'x' }, { base: BASE }) !== null);

let warned = 0;
const hostile = { event: 'x' };
Object.defineProperty(hostile, 'properties', {
  get() {
    throw new Error('boom');
  },
});
eq('a scrub that throws drops the event', scrubEvent(hostile, { base: BASE, warn: () => { warned += 1; } }), null);
ok('and says so rather than dropping it silently', warned === 1);

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
