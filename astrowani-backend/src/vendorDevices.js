/**
 * vendorDevices.js — per-device sign-in state for astrologers.
 *
 * `astrologers.fcm_token` and `logged_out_at` are ACCOUNT-level fields recording
 * DEVICE-level events, so signing out on one device signed the astrologer out
 * everywhere. Measured 2026-09-09: an astrologer online on an iPhone was hidden
 * from every customer — and had their push token wiped — because they logged out
 * of the Android app afterwards. See sql/vendor_devices.sql.
 *
 * ── THE COMPATIBILITY RULE, which is the whole risk ─────────────────────────
 *
 *     isLoggedOut = (device rows exist) ? false : !!logged_out_at
 *
 * A device row PROVES signed-in. The absence of rows proves nothing — installed
 * builds do not send a device_id and never will — so it must fall back to the
 * legacy flag rather than hide someone. Any rule that reads "no rows" as
 * signed-out makes every astrologer on an old build vanish on deploy.
 *
 * Everything here also tolerates the table not existing yet: each function
 * answers as if there were no device rows, which lands on the legacy behaviour.
 * Deploy order therefore does not matter, same posture as src/wallet.js.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// PostgREST reports a missing table as PGRST205, Postgres as 42P01. Checking only
// 42P01 turned a not-yet-migrated database into a 500 once already — see the
// postgrest_missing_table_code memory.
const isMissingTable = (err) =>
  !!err && (err.code === 'PGRST205' || err.code === '42P01'
    || /Could not find the table|does not exist/i.test(err.message || ''));

let warnedMissing = false;
function noteMissing(where) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(
    `[vendorDevices] ${where}: vendor_devices is not installed — falling back to the ` +
    'legacy astrologers.fcm_token / logged_out_at behaviour. Run sql/vendor_devices.sql.',
  );
}

/**
 * Record a device as signed in. Called on login and on push-token refresh.
 *
 * Upserts on (astrologer_id, device_id) so repeated sign-ins update one row
 * rather than accumulating one per login.
 *
 * @returns {Promise<boolean>} whether a device row was actually written. False
 *   means the caller must keep maintaining the legacy columns — which it should
 *   do regardless while old builds exist.
 */
async function registerDevice(astrologerId, opts = {}) {
  const { deviceId, fcmToken = null, voipToken = null, platform = null, appVersion = null } = opts;
  if (!astrologerId || !deviceId) return false;

  const row = {
    astrologer_id: astrologerId,
    device_id: String(deviceId).slice(0, 200),
    last_seen_at: new Date().toISOString(),
  };
  // Only overwrite a token when one was actually supplied. A login from a device
  // that could not obtain a push token (iOS before the APNs key exists, a denied
  // notification permission) must not wipe a good token it registered earlier.
  if (fcmToken) row.fcm_token = fcmToken;
  if (voipToken) row.voip_token = voipToken;
  if (platform) row.platform = ['ios', 'android'].includes(platform) ? platform : 'unknown';
  if (appVersion) row.app_version = String(appVersion).slice(0, 40);

  const { error } = await db
    .from('vendor_devices')
    .upsert(row, { onConflict: 'astrologer_id,device_id' });

  if (error) {
    if (isMissingTable(error)) { noteMissing('registerDevice'); return false; }
    console.error('[vendorDevices] registerDevice failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Sign ONE device out. Returns how many of the astrologer's devices remain.
 *
 * The caller uses that count to decide whether the legacy account-level columns
 * should also be cleared: only when the LAST device signs out is the astrologer
 * genuinely signed out, and that is exactly the bug this module exists to fix.
 *
 * @returns {Promise<{removed: boolean, remaining: number|null}>} remaining is
 *   null when the table is unavailable — the caller must then fall back rather
 *   than assume zero.
 */
async function removeDevice(astrologerId, deviceId) {
  if (!astrologerId || !deviceId) return { removed: false, remaining: null };

  const { error } = await db
    .from('vendor_devices')
    .delete()
    .eq('astrologer_id', astrologerId)
    .eq('device_id', String(deviceId));

  if (error) {
    if (isMissingTable(error)) { noteMissing('removeDevice'); return { removed: false, remaining: null }; }
    console.error('[vendorDevices] removeDevice failed:', error.message);
    return { removed: false, remaining: null };
  }

  const remaining = await countDevices(astrologerId);
  return { removed: true, remaining };
}

/** How many devices this astrologer is signed in on. null if unavailable. */
async function countDevices(astrologerId) {
  const { count, error } = await db
    .from('vendor_devices')
    .select('id', { count: 'exact', head: true })
    .eq('astrologer_id', astrologerId);

  if (error) {
    if (isMissingTable(error)) { noteMissing('countDevices'); return null; }
    console.error('[vendorDevices] countDevices failed:', error.message);
    return null;
  }
  // A head+count request against a MISSING table came back with no error and a null
  // count — measured, not assumed. Returning 0 there would be read by the logout
  // path as "that was the last device" and would mark the whole account signed out,
  // which is the exact bug this module exists to prevent. A real empty table returns
  // 0, so null is unambiguously "could not tell".
  if (count === null || count === undefined) { noteMissing('countDevices'); return null; }
  return Number(count);
}

/**
 * The device to ring: the most recently seen one.
 *
 * Ringing every device was considered and deliberately not done — answering on
 * one would leave the other ringing, and a CallKit screen left ringing on iOS is
 * something Apple penalises. One target keeps the accept/reject race exactly as
 * it is today.
 *
 * @returns {Promise<{fcm_token, voip_token, device_id, platform}|null>} null when
 *   there are no device rows OR the table is unavailable — in both cases the
 *   caller falls back to the astrologer's legacy columns.
 */
async function activeDevice(astrologerId) {
  if (!astrologerId) return null;
  const { data, error } = await db
    .from('vendor_devices')
    .select('device_id, fcm_token, voip_token, platform')
    .eq('astrologer_id', astrologerId)
    .order('last_seen_at', { ascending: false })
    .limit(1);

  if (error) {
    if (isMissingTable(error)) { noteMissing('activeDevice'); return null; }
    console.error('[vendorDevices] activeDevice failed:', error.message);
    return null;
  }
  return (data && data[0]) || null;
}

/**
 * Which of these astrologers have at least one signed-in device.
 *
 * Batched for the list endpoints: /api/astrologers formats dozens of rows per
 * request and must not issue a query per row — the same reason buildBusyMap
 * exists in busyStatus.js.
 *
 * @returns {Promise<Set<string>>} ids WITH devices. Empty on any failure, which
 *   lands every astrologer on the legacy flag — the safe direction, since it can
 *   only preserve today's behaviour, never hide someone new.
 */
async function buildDeviceMap(astrologerIds) {
  const ids = (astrologerIds || []).filter(Boolean);
  if (ids.length === 0) return new Set();

  const { data, error } = await db
    .from('vendor_devices')
    .select('astrologer_id')
    .in('astrologer_id', ids);

  if (error) {
    if (isMissingTable(error)) noteMissing('buildDeviceMap');
    else console.error('[vendorDevices] buildDeviceMap failed:', error.message);
    return new Set();
  }
  return new Set((data || []).map((r) => r.astrologer_id));
}

/**
 * The push tokens to use for an astrologer, with the legacy fallback applied.
 *
 * Prefers the newest signed-in device; falls back to the account-level columns
 * when there are no device rows (an old build, or the migration not yet applied).
 * A device row missing a token individually also falls back, which matters on iOS
 * before the APNs key exists — a device can be genuinely signed in with no FCM
 * token at all.
 *
 * @returns {Promise<{fcm_token: ?string, voip_token: ?string}|null>}
 */
async function pushTargetFor(astrologerId) {
  if (!astrologerId) return null;

  const [device, legacyRes] = await Promise.all([
    activeDevice(astrologerId),
    db.from('astrologers').select('fcm_token, voip_token').eq('id', astrologerId).maybeSingle(),
  ]);
  const legacy = legacyRes && !legacyRes.error ? legacyRes.data : null;

  if (!device) return legacy;
  return {
    fcm_token: device.fcm_token || legacy?.fcm_token || null,
    voip_token: device.voip_token || legacy?.voip_token || null,
  };
}

module.exports = {
  pushTargetFor,
  registerDevice,
  removeDevice,
  countDevices,
  activeDevice,
  buildDeviceMap,
};
