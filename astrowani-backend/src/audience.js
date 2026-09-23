// astrowani-backend/src/audience.js
//
// Who gets which welcome offer, based on where the customer came from.
//
// The free 12-minute call and the free 5-minute chat both cost real money — an
// astrologer's time, and Gemini API spend. Traffic that already cost money to acquire
// (a paid ad) does not always deserve a second subsidy, while cheap traffic (a printed
// QR poster) is exactly where the nudge pays for itself. This module is the one place
// that answers "is this customer allowed feature X".
//
// It reads customers.acquisition_source, written at signup by src/acquisition.js. It
// NEVER writes anything.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE GUARANTEE THIS MODULE EXISTS TO KEEP
//
// Every customer who signed up before the install-referrer build went live has
// acquisition_source = NULL, as does every iOS customer (Apple has no Play Install
// Referrer equivalent) and every sideload. Measured 2026-09-23: that was ALL 701
// customers. Those people must keep behaving exactly as they do today.
//
// So:
//   1. The default for every feature is `everyone` — no restriction at all. Shipping
//      this file changes nothing for anybody until an admin writes a rule.
//   2. NULL is its own segment, `unknown`, and is only ever affected by a rule that
//      names it explicitly. A rule about "google" cannot silently catch it.
//   3. This layer FAILS OPEN. Missing key, malformed JSON, unreachable database — the
//      answer is "allowed", i.e. today's behaviour.
//
// Point 3 is deliberately the opposite of freeCallRoutes' isNewCustomer(), which fails
// CLOSED. The difference is what each failure costs: a wrongly-granted free call is one
// astrologer hour, while a wrongly-WITHHELD offer is a customer who bounced and never
// came back. This module can only ever take an offer away, so its failure direction is
// "take nothing away".
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const { TtlCache } = require('./ttlCache');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SETTINGS_KEY = 'audience_rules';

// The features that can be gated. A featureKey not in here is always allowed, so a
// typo in the stored config can never block anything.
const FEATURES = ['free_call', 'free_chat'];

// Reserved segment id for "we never learned where they came from". Not a match rule —
// it is the answer when acquisition_source is null.
const UNKNOWN = 'unknown';

// Same 60s as appPromptRoutes' config cache: short enough that an admin toggling a rule
// is live almost immediately, long enough that a launch spike is not one app_settings
// read per request.
const cache = new TtlCache({ ttlMs: 60000, maxEntries: 4 });

// What every failure path returns, and what ships on day one: nobody is restricted.
const PERMISSIVE = Object.freeze({ segments: [], features: {} });

/** The segments the admin page offers out of the box. Purely a starting point. */
const DEFAULT_SEGMENTS = Object.freeze([
  { id: 'qr', label: 'QR posters', match: { kind: 'prefix', value: 'qr_' } },
  { id: 'ads', label: 'Tracked ad links', match: { kind: 'prefix', value: 'ad_' } },
  { id: 'google', label: 'Google Ads / Play Store', match: { kind: 'prefix', value: 'google' } },
  { id: UNKNOWN, label: 'Unknown (all iPhone, and everyone before tracking)', match: { kind: 'null' } },
]);

// ── Config ───────────────────────────────────────────────────────────────────

/**
 * Normalize whatever is stored into a shape the rest of this file can trust.
 *
 * Everything here is admin free-text that has been through a generic settings PATCH,
 * so nothing is assumed: a bad segment is dropped rather than throwing, and a feature
 * whose mode is unrecognised falls back to `everyone`.
 */
function normalizeRules(raw) {
  if (!raw || typeof raw !== 'object') return PERMISSIVE;

  const segments = [];
  const seen = new Set();
  for (const s of Array.isArray(raw.segments) ? raw.segments : []) {
    if (!s || typeof s !== 'object') continue;
    const id = String(s.id || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
    if (!id || seen.has(id)) continue;
    const kind = s.match && typeof s.match === 'object' ? String(s.match.kind || '') : '';
    if (!['prefix', 'exact', 'null', 'raw_contains'].includes(kind)) continue;
    const value = String((s.match && s.match.value) || '').toLowerCase().slice(0, 120);
    // Every kind except `null` needs something to match against; a prefix rule with an
    // empty value would match EVERY customer, which is never what anyone meant.
    if (kind !== 'null' && !value) continue;
    seen.add(id);
    segments.push({
      id,
      label: String(s.label || id).slice(0, 80),
      match: { kind, value },
    });
  }

  const features = {};
  const rawFeatures = raw.features && typeof raw.features === 'object' ? raw.features : {};
  for (const key of FEATURES) {
    const f = rawFeatures[key];
    const mode = f && typeof f === 'object' ? String(f.mode || '') : '';
    if (mode !== 'block' && mode !== 'only') continue; // anything else => everyone
    const list = (Array.isArray(f.segments) ? f.segments : [])
      .map((x) => String(x || '').trim().toLowerCase())
      .filter((x) => x && seen.has(x));
    // A `block` with nothing listed blocks nobody; an `only` with nothing listed would
    // block EVERYONE, which is never a deliberate configuration. Both degrade to
    // `everyone` rather than doing something drastic by omission.
    if (!list.length) continue;
    features[key] = { mode, segments: list };
  }

  return { segments, features };
}

/** Read and normalize the stored rules. Never throws; returns PERMISSIVE on any problem. */
async function loadRules() {
  return cache.get(SETTINGS_KEY, async () => {
    try {
      const { data, error } = await db
        .from('app_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle();
      if (error || !data || !data.value) return PERMISSIVE;
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return normalizeRules(parsed);
    } catch (err) {
      // A rules read that fails must cost nobody their offer.
      console.error('[audience] could not read rules, allowing everyone:', err.message);
      return PERMISSIVE;
    }
  });
}

function invalidateAudienceCache() {
  cache.store.delete(SETTINGS_KEY);
}

// ── Matching ─────────────────────────────────────────────────────────────────

function matches(segment, source, raw) {
  const { kind, value } = segment.match;
  if (kind === 'null') return !source;
  if (!source && kind !== 'raw_contains') return false;
  const s = String(source || '').toLowerCase();
  if (kind === 'prefix') return s.startsWith(value);
  if (kind === 'exact') return s === value;
  if (kind === 'raw_contains') return String(raw || '').toLowerCase().includes(value);
  return false;
}

/**
 * Which segment a customer belongs to.
 *
 * First match wins, so segment ORDER in the config is meaningful — a specific rule
 * should sit above a general one. A customer matching nothing is `unknown`, the same
 * bucket as a customer with no source at all: in both cases we cannot say where they
 * came from, and a rule has to name `unknown` to affect them either way.
 */
function segmentOf(segments, source, raw) {
  for (const seg of segments) {
    if (matches(seg, source, raw)) return seg.id;
  }
  return UNKNOWN;
}

/**
 * Decide the whole picture for one customer in a single pass.
 * Returns { segment, features: { free_call: bool, free_chat: bool } }.
 */
function decideWith(rules, source, raw) {
  const segment = segmentOf(rules.segments, source, raw);
  const features = {};
  for (const key of FEATURES) {
    const rule = rules.features[key];
    if (!rule) { features[key] = true; continue; }
    const listed = rule.segments.includes(segment);
    features[key] = rule.mode === 'only' ? listed : !listed;
  }
  return { segment, features };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * The full decision for a customer row. Never throws.
 *
 * `customer` is any object carrying acquisition_source / acquisition_raw — i.e. the row
 * these endpoints already load. Pass null for an anonymous caller and everything is
 * allowed, which is what the app shows a logged-out visitor anyway.
 */
async function decide(customer) {
  try {
    const rules = await loadRules();
    return decideWith(rules, customer?.acquisition_source, customer?.acquisition_raw);
  } catch (err) {
    console.error('[audience] decide failed, allowing everything:', err.message);
    const features = {};
    for (const key of FEATURES) features[key] = true;
    return { segment: UNKNOWN, features };
  }
}

/** Is this customer allowed this feature? Never throws, always allows on failure. */
async function isAllowed(customer, featureKey) {
  if (!FEATURES.includes(featureKey)) return true;
  const { features } = await decide(customer);
  return features[featureKey] !== false;
}

module.exports = {
  SETTINGS_KEY,
  FEATURES,
  UNKNOWN,
  DEFAULT_SEGMENTS,
  PERMISSIVE,
  normalizeRules,
  loadRules,
  invalidateAudienceCache,
  segmentOf,
  decideWith,
  decide,
  isAllowed,
};
