// astrowani-backend/src/notifications/devices.js
//
// Everything about WHO WE CAN REACH.
//
// The customer side has had one text column, `customers.fcm_token`, written by
// whichever device logged in last. This replaces that with per-device rows and —
// the part that actually matters — records the OS permission state, which nothing
// has ever recorded. Measured on 2026-11-07: 4,857 live customers, 289 reachable,
// and for the other 4,568 the database could not say whether they had denied the
// prompt, never been asked, or uninstalled.
//
// `customers.fcm_token` IS STILL WRITTEN and still holds the primary device. Twenty-
// five push call sites read it directly; none of them change.
//
// EVERYTHING HERE IS BEST-EFFORT. Every function is called from a login or an app
// foreground, and a failure to record a statistic must never fail one of those.

const { db, pageAll } = require('./db');
const { normalizePlatform } = require('../devicePlatform');

const PERMISSION_STATES = new Set(['undetermined', 'granted', 'denied', 'blocked']);

/** Unrecognised reads as `undetermined` rather than throwing: an older app build,
 *  or a platform that reports something new, must not break a login. */
function normalisePermission(value) {
  const v = String(value || '').trim().toLowerCase();
  return PERMISSION_STATES.has(v) ? v : 'undetermined';
}

/** 'en' | 'hi' | null. ABSENT IS NULL, NOT 'en' — the same rule as
 *  devicePlatform's absent-is-not-unknown: stamping a guess over a column that is
 *  about to be reported correctly is strictly worse than leaving it empty, and
 *  every build shipped before today sends nothing. */
function normaliseLocale(value) {
  const v = String(value || '').trim().toLowerCase().slice(0, 5);
  if (!v) return null;
  if (v.startsWith('hi')) return 'hi';
  if (v.startsWith('en')) return 'en';
  return null;
}

/**
 * Record what a device is and what it is allowed to do. Called on login, on token
 * refresh, and on every app foreground.
 *
 * Reads the existing row before writing rather than using a blind upsert, because
 * a blind upsert would null `permission_asked_at` on every subsequent call — and
 * "when did we first ask" is only answerable once.
 *
 * Returns { ok, deviceId, reachable } and never throws.
 */
async function registerDevice({
  customerId, deviceId, fcmToken, platform, appVersion, locale,
  permissionStatus, permissionAsked,
} = {}) {
  const client = db();
  if (!client || !customerId || !deviceId) return { ok: false, reachable: false };

  const status = permissionStatus ? normalisePermission(permissionStatus) : null;
  const plat = normalizePlatform(platform);
  const loc = normaliseLocale(locale);
  const now = new Date().toISOString();

  try {
    const { data: existing } = await client
      .from('customer_devices')
      .select('id, permission_status, permission_asked_at, fcm_token')
      .eq('customer_id', customerId)
      .eq('device_id', String(deviceId).slice(0, 120))
      .maybeSingle();

    const patch = { last_seen_at: now };
    if (fcmToken) patch.fcm_token = String(fcmToken);
    if (plat) patch.platform = plat;
    if (appVersion) patch.app_version = String(appVersion).slice(0, 40);
    if (loc) patch.locale = loc;

    if (status) {
      patch.permission_status = status;
      // Only stamp the decision when there IS one. 'undetermined' is the absence of
      // a decision, so stamping it would record a date for something that never
      // happened.
      if (status !== 'undetermined' && existing?.permission_status !== status) {
        patch.permission_decided_at = now;
      }
    }
    // First ask only — see the comment above about this being answerable once.
    if (permissionAsked && !existing?.permission_asked_at) patch.permission_asked_at = now;

    // A fresh token means this install is alive again. Clearing the mark here is
    // what stops a customer who reinstalled from being reported as gone forever.
    if (fcmToken) {
      patch.app_removed_at = null;
      patch.app_removed_reason = null;
    }

    if (existing?.id) {
      const { error } = await client.from('customer_devices').update(patch).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await client.from('customer_devices').insert([{
        customer_id: customerId,
        device_id: String(deviceId).slice(0, 120),
        permission_status: status || 'undetermined',
        ...patch,
      }]);
      if (error) throw error;
    }

    // Keep the legacy primary in step. Only when the push can actually arrive:
    // writing a token from a device whose permission was denied would restore the
    // exact over-reporting this table exists to end.
    if (fcmToken && (!status || status === 'granted')) {
      await client
        .from('customers')
        .update({ fcm_token: String(fcmToken), app_removed_at: null, app_removed_reason: null })
        .eq('id', customerId);
    }

    return { ok: true, deviceId, reachable: !!fcmToken && (!status || status === 'granted') };
  } catch (err) {
    console.error('[notifications] registerDevice failed:', err.message);
    return { ok: false, reachable: false };
  }
}

/**
 * The tokens a push should actually go to, for a set of customers.
 *
 * Returns Map<customerId, { tokens: string[], locale, platform }>. A customer with
 * no live device is simply absent from the map — the caller records that as a
 * suppression with a reason rather than letting it vanish.
 */
async function liveDevicesFor(customerIds) {
  const client = db();
  const out = new Map();
  if (!client || !customerIds?.length) return out;

  const ids = [...new Set(customerIds.map(String))];
  const CHUNK = 300; // keeps the generated ?in=(...) query string well under 414 territory

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { rows } = await pageAll(() => client
      .from('customer_devices')
      .select('customer_id, fcm_token, locale, platform, last_seen_at')
      .in('customer_id', slice)
      .not('fcm_token', 'is', null)
      .is('app_removed_at', null)
      .eq('permission_status', 'granted')
      .order('last_seen_at', { ascending: false }));

    for (const r of rows) {
      const key = String(r.customer_id);
      if (!out.has(key)) out.set(key, { tokens: [], locale: r.locale || null, platform: r.platform || null });
      const entry = out.get(key);
      if (r.fcm_token && !entry.tokens.includes(r.fcm_token)) entry.tokens.push(r.fcm_token);
      // Ordered newest-first, so the first non-null wins — the most recently used
      // device decides which language this person reads the app in.
      if (!entry.locale && r.locale) entry.locale = r.locale;
      if (!entry.platform && r.platform) entry.platform = r.platform;
    }
  }
  return out;
}

/** The admin reachability panel. One round trip; see sql/notification_audience.sql. */
async function reachSummary() {
  const client = db();
  if (!client) return null;
  const { data, error } = await client.rpc('notification_reach_summary');
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

// ──────────────────────────────────────────────────── the astrologer side ──
//
// Deliberately a second set of functions rather than a `table` parameter on the
// ones above. The two sides look alike and are not: `vendor_devices` is keyed on
// `astrologer_id`, carries a `voip_token` nothing on the customer side has, and —
// the part that actually matters — a row there can exist with NO fcm_token at all,
// because `vendorDevices.registerDevice` writes the row on a login that could not
// obtain one. A shared function would have to branch on all three anyway, and the
// branch would sit in the middle of the query that decides who can be rung.

/**
 * Live push tokens per astrologer, from `vendor_devices`.
 *
 * NOTE this is NOT what an incoming consultation uses. `vendorDevices.pushTargetFor`
 * rings the NEWEST device only, on purpose — ringing every phone an astrologer has
 * ever signed in on would be worse than useless. This is for CAMPAIGNS, where
 * reaching all of their devices is right.
 */
async function liveAstrologerDevicesFor(astrologerIds) {
  const client = db();
  const out = new Map();
  if (!client || !astrologerIds?.length) return out;

  const ids = [...new Set(astrologerIds.map(String))];
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    try {
      const { rows } = await pageAll(() => client
        .from('vendor_devices')
        .select('astrologer_id, fcm_token, locale, platform, last_seen_at')
        .in('astrologer_id', ids.slice(i, i + CHUNK))
        .not('fcm_token', 'is', null)
        .is('app_removed_at', null)
        .eq('permission_status', 'granted')
        .order('last_seen_at', { ascending: false }));

      for (const r of rows) {
        const key = String(r.astrologer_id);
        if (!out.has(key)) out.set(key, { tokens: [], locale: r.locale || null, platform: r.platform || null });
        const entry = out.get(key);
        if (r.fcm_token && !entry.tokens.includes(r.fcm_token)) entry.tokens.push(r.fcm_token);
        if (!entry.locale && r.locale) entry.locale = r.locale;
        if (!entry.platform && r.platform) entry.platform = r.platform;
      }
    } catch (err) {
      // Returning an EMPTY map here is safe and the caller depends on it: with no
      // device entry, `govern` falls back to `astrologers.fcm_token`, which is the
      // behaviour that existed before this table had permission columns. So an
      // unapplied migration costs reach data, never reach.
      console.warn('[notifications] vendor_devices read failed, falling back to the legacy token:', err.message);
      return new Map();
    }
  }
  return out;
}

/** The astrologer reachability panel, including who is open for business and
 *  cannot be reached — which is an earnings problem, not a reporting one. */
async function astrologerReachSummary() {
  const client = db();
  if (!client) return null;
  const { data, error } = await client.rpc('notification_astrologer_reach_summary');
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

/** The names behind `unreachable_online`. A count nobody can act on is not worth
 *  showing. */
async function unreachableAstrologers(limit = 50) {
  const client = db();
  if (!client) return [];
  const { data, error } = await client.rpc('notification_astrologers_unreachable', { p_limit: limit });
  if (error) throw error;
  return data || [];
}

/** Per-device rows for one customer, for the admin's customer detail view. */
async function devicesFor(customerId) {
  const client = db();
  if (!client || !customerId) return [];
  const { data, error } = await client
    .from('customer_devices')
    .select('id, device_id, platform, app_version, locale, permission_status, permission_asked_at, permission_decided_at, app_removed_at, last_seen_at, created_at, fcm_token')
    .eq('customer_id', customerId)
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  // The token is a routing credential; the admin needs to know one exists, never
  // what it is.
  return (data || []).map(({ fcm_token: token, ...rest }) => ({
    ...rest,
    has_token: !!token,
    token_tail: token ? String(token).slice(-8) : null,
  }));
}

module.exports = {
  registerDevice,
  liveDevicesFor,
  reachSummary,
  devicesFor,
  liveAstrologerDevicesFor,
  astrologerReachSummary,
  unreachableAstrologers,
  normalisePermission,
  normaliseLocale,
  PERMISSION_STATES,
};
