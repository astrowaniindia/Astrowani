// Who this phone is, what it is allowed to do, and what happened to the
// notifications we sent it.
//
// THE PROBLEM THIS SOLVES. Before this file, the backend knew one thing about a
// customer's notifications: a single `fcm_token` column, written by whichever
// device logged in last. Measured on the live database on 2026-11-07: 4,857
// customers, 289 reachable, and for the other 4,568 nothing anywhere recorded
// whether they had tapped "Don't allow", had never been asked, or had removed the
// app. "How many people have notifications on" was unanswerable.
//
// It also had no idea whether anybody ever SAW one. 46 broadcasts had gone out and
// not one of them could be scored.
//
// Pure JS. `react-native-device-info` and `@react-native-firebase/messaging` are
// already in both binaries, so all of this reaches installed builds by OTA with no
// store release.

import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import DeviceInfo from 'react-native-device-info';
import Instance from '../api/ApiCall';
import { DEVICE_PLATFORM } from './devicePlatform';
import { getCurrentLanguage } from '../context/LanguageContext';

const DEVICE_ID_KEY = 'awNotificationDeviceId';
const LAST_STATUS_KEY = 'awNotificationPermissionLast';
const ASKED_KEY = 'awNotificationPermissionAsked';

// ─────────────────────────────────────────────────────────── the device id ──

let deviceIdMemo = null;

/**
 * A stable id for THIS INSTALL, kept in AsyncStorage.
 *
 * Seeded from DeviceInfo.getUniqueId() but then stored, because that value is not
 * guaranteed stable across reinstalls on either platform — and a device id that
 * changes would create a second row per reinstall and make the device count, which
 * the admin reads as "how many phones", drift upwards forever.
 *
 * Falls back to a random id rather than throwing: a device with no id recorded is
 * better than a login that fails.
 */
export async function getDeviceId() {
  if (deviceIdMemo) return deviceIdMemo;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) { deviceIdMemo = stored; return stored; }
  } catch (_) { /* fall through */ }

  let id;
  try {
    id = await DeviceInfo.getUniqueId();
  } catch (_) { id = null; }
  if (!id) id = `rnd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  deviceIdMemo = String(id).slice(0, 120);
  try { await AsyncStorage.setItem(DEVICE_ID_KEY, deviceIdMemo); } catch (_) { /* best-effort */ }
  return deviceIdMemo;
}

// ────────────────────────────────────────────────────── the permission state ──

/**
 * 'granted' | 'denied' | 'blocked' | 'undetermined'.
 *
 * `messaging().hasPermission()` is the primary signal on BOTH platforms. On iOS it
 * reports the real four-way authorization status. On Android, react-native-firebase
 * answers from NotificationManagerCompat.areNotificationsEnabled(), which is what
 * makes "switched it off in Settings" visible on Android 12 and below, where there
 * is no runtime permission to check at all.
 *
 * DENIED AND BLOCKED ARE THE SAME OS ANSWER, and separating them needs memory:
 * if we have recorded this device as granted before and the OS now says no, they
 * turned it off afterwards — which is a different conversation from someone who
 * said no to the prompt, so it is worth the one stored string.
 *
 * Never throws. An unreadable state reports 'undetermined', which is honest: we do
 * not know.
 */
export async function probePermissionStatus() {
  let status = 'undetermined';
  try {
    const authStatus = await messaging().hasPermission();
    if (authStatus === messaging.AuthorizationStatus.AUTHORIZED
      || authStatus === messaging.AuthorizationStatus.PROVISIONAL) {
      status = 'granted';
    } else if (authStatus === messaging.AuthorizationStatus.NOT_DETERMINED) {
      status = 'undetermined';
    } else {
      status = 'denied';
    }
  } catch (_) {
    // Fall back to the Android 13 runtime check, which is narrower but real.
    try {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        status = ok ? 'granted' : 'denied';
      }
    } catch (__) { status = 'undetermined'; }
  }

  try {
    const last = await AsyncStorage.getItem(LAST_STATUS_KEY);
    if (status === 'denied' && last === 'granted') status = 'blocked';
    // Only a settled answer is remembered. Storing 'undetermined' would erase the
    // history that makes the line above possible.
    if (status !== 'undetermined') await AsyncStorage.setItem(LAST_STATUS_KEY, status === 'blocked' ? 'denied' : status);
  } catch (_) { /* best-effort */ }

  return status;
}

/** Remember that an OS prompt was actually shown, so the backend can stamp
 *  `permission_asked_at` once and a later denial is readable as a refusal rather
 *  than as "never asked". */
export async function markPermissionAsked() {
  try { await AsyncStorage.setItem(ASKED_KEY, String(Date.now())); } catch (_) { /* best-effort */ }
}

async function wasEverAsked() {
  try { return !!(await AsyncStorage.getItem(ASKED_KEY)); } catch (_) { return false; }
}

// ───────────────────────────────────────────────────────────── the sync call ──

let lastSyncAt = 0;
const SYNC_GAP_MS = 60 * 1000;

/**
 * Tell the backend what this device is and what it is allowed to do.
 *
 * Called on login, on every FCM token refresh, on every app foreground, and —
 * most importantly — immediately after the permission dialog is answered, which is
 * the only moment a DENIAL can ever be recorded.
 *
 * @param {object}  opts
 * @param {string} [opts.token]     the current FCM token, if known
 * @param {boolean} [opts.force]    bypass the throttle (use it after an answer)
 * @param {boolean} [opts.asked]    an OS prompt was just shown
 *
 * Silently does nothing when the customer is not logged in — there is no account to
 * attach a device to yet, and the login path syncs again once there is.
 *
 * NEVER THROWS. Every caller is a startup or a foreground, and recording a
 * statistic must not be able to break either.
 */
export async function syncNotificationDevice({ token, force = false, asked = false } = {}) {
  try {
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken) return { ok: false, reason: 'not_logged_in' };

    if (!force && Date.now() - lastSyncAt < SYNC_GAP_MS) return { ok: false, reason: 'throttled' };
    lastSyncAt = Date.now();

    if (asked) await markPermissionAsked();

    const [deviceId, permissionStatus] = await Promise.all([getDeviceId(), probePermissionStatus()]);
    const everAsked = asked || await wasEverAsked();

    let fcmToken = token;
    if (!fcmToken) {
      try { fcmToken = await AsyncStorage.getItem('fcmToken'); } catch (_) { fcmToken = null; }
    }

    // 'Hindi' | 'English' from the app's own language context -> the 'hi' | 'en' the
    // backend stores. This is the only way the database can ever know which
    // language a customer reads the app in, which is why every notification has so
    // far gone out in one language to everybody.
    const lang = String(getCurrentLanguage() || '').toLowerCase();
    const locale = lang.startsWith('hi') ? 'hi' : 'en';

    await Instance.post(
      '/api/notifications/device',
      {
        deviceId,
        fcmToken: fcmToken || undefined,
        platform: DEVICE_PLATFORM,
        appVersion: DeviceInfo.getVersion?.() || undefined,
        locale,
        permissionStatus,
        permissionAsked: everAsked,
      },
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
    return { ok: true, permissionStatus };
  } catch (_) {
    // A missed sync is corrected on the next foreground. Nothing here is worth an
    // error in front of a customer.
    return { ok: false, reason: 'failed' };
  }
}

// ──────────────────────────────────────────────────────────────── tracking ──

const reported = new Set();

/**
 * Report what happened to a notification: 'delivered', 'opened' or 'clicked'.
 *
 * THERE IS NO SEND ID IN THE PAYLOAD. The backend finds the row from the campaign
 * id plus the authenticated caller, which is what lets it batch one identical
 * message to 500 phones at a time instead of building one per person — and means a
 * phone cannot claim somebody else's open.
 *
 * De-duplicated per process so a notification the OS hands us twice does not count
 * twice. The backend keeps the first timestamp per stage anyway, so this is only
 * saving requests, not correcting data.
 */
export async function trackNotification(campaignId, event) {
  if (!campaignId || !['delivered', 'opened', 'clicked'].includes(event)) return;
  const key = `${campaignId}:${event}`;
  if (reported.has(key)) return;
  reported.add(key);
  try {
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken) return;
    await Instance.post(
      '/api/notifications/track',
      { campaignId, event },
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
  } catch (_) {
    // Let it go. A lost open is a lost statistic; retrying from a push handler
    // would be a loop nobody is watching.
    reported.delete(key);
  }
}

/** Pulls the campaign id out of whatever shape the message arrived in. */
export function campaignIdOf(remoteMessage) {
  return remoteMessage?.data?.campaignId || remoteMessage?.userInfo?.campaignId || null;
}

// ────────────────────────────────────────────────────────────── deep links ──

/**
 * Screens a notification is allowed to open.
 *
 * AN ALLOWLIST, not a pass-through. `navigate()` with a name no navigator knows
 * does nothing visible and logs a warning nobody reads, so an admin's typo would
 * produce a notification that opens the app and then sits there — which is the
 * exact failure the deep link exists to fix. Anything not on this list falls back
 * to the notification list, where the message at least still is.
 *
 * Keep it in step with DEEP_LINKS in astrowani-admin/src/pages/NotificationCenter.jsx.
 */
export const DEEP_LINK_SCREENS = new Set([
  'Home', 'Wallet', 'MyOrders', 'Chat', 'Call', 'Video', 'Live', 'Store', 'Remedies',
  'BlogList', 'ReferFriend', 'Horoscope', 'NotificationScreen', 'FreeService',
  'CoinStore', 'GamificationHub', 'FavoriteScreen', 'SupportScreen', 'Settings',
  'VoiceNotes', 'InstantAstrologers',
]);

export function resolveDeepLink(value) {
  const name = String(value || '').trim();
  if (!name) return null;
  return DEEP_LINK_SCREENS.has(name) ? name : null;
}
