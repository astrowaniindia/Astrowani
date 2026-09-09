// A stable identity for THIS install, used to sign devices in and out
// individually.
//
// Why this exists: astrologers.fcm_token and logged_out_at are account-level
// fields recording device-level events, so signing out on one device signed the
// astrologer out everywhere. Measured 2026-09-09 — an astrologer online on an
// iPhone was hidden from every customer, and had their push token wiped, because
// they logged out of the Android app afterwards. Their own screen still said
// "You are Online". See astrowani-backend/sql/vendor_devices.sql.
//
// ── Two deliberate choices ────────────────────────────────────────────────────
//
// 1. A RANDOM id, not DeviceInfo.getUniqueId(). That returns ANDROID_ID /
//    identifierForVendor — a device fingerprint that outlives our app and can
//    correlate a person across installs. We only need "is this the same install
//    that signed in", which a random value answers without collecting anything
//    about the hardware.
//
// 2. NOT the FCM token, which is what the backend keys on too. Those rotate on
//    reinstall, restore and Firebase's own refresh, so a device keyed on one can
//    stop recognising itself and then cannot sign itself out — leaving a row that
//    keeps the astrologer looking reachable forever.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

const KEY = 'vendorDeviceId';

// 128 bits of randomness in the shape of a UUID. Math.random is not
// cryptographically strong and does not need to be: this is a uniqueness token,
// never a secret, and it is scoped to one astrologer's own rows server-side.
function newId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let cached = null;

/**
 * This install's device id, creating and persisting one on first use.
 *
 * Never throws and never returns null: if storage is unreadable we still hand back
 * an in-memory id for this session. A login that cannot produce a device id would
 * fall back to the old account-level behaviour, which is the bug — so it is better
 * to have an id that does not survive a restart than none at all.
 */
export async function getDeviceId() {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) { cached = stored; return cached; }
  } catch (_) {
    // fall through and mint one
  }
  cached = newId();
  try {
    await AsyncStorage.setItem(KEY, cached);
  } catch (_) {
    // In-memory only for this session. Still better than no id.
  }
  return cached;
}

/**
 * Re-persist the device id after AsyncStorage.clear().
 *
 * ⚠ THE LOGOUT PATH CLEARS ALL OF AsyncStorage, which would take the device id
 * with it. A fresh id on the next sign-in means the SAME phone looks like a new
 * device — so if a previous logout never reached the server (offline, app killed),
 * its row survives and the astrologer is warned they are "signed in on another
 * device" that is really this same handset. Call this immediately after any
 * clear().
 */
export async function preserveDeviceId() {
  const id = await getDeviceId();
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch (_) {
    // Keeps working from the in-memory cache.
  }
  return id;
}

/** The fields the backend wants alongside the id, for the login payload. */
export async function deviceInfoPayload() {
  return {
    deviceId: await getDeviceId(),
    devicePlatform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: (() => {
      try { return DeviceInfo.getVersion(); } catch (_) { return undefined; }
    })(),
  };
}
