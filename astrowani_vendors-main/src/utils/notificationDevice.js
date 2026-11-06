// Whether this astrologer's phone is actually allowed to ring, and what happened
// to the notifications we sent it.
//
// WHY THIS MATTERS MORE HERE THAN ON THE CUSTOMER SIDE. A customer who cannot
// receive a push misses an offer. An astrologer who cannot receive one misses
// every consultation request that arrives while the app is backgrounded — and
// therefore the earnings. Measured on production 2026-11-07: 97 of 117
// astrologers reachable, and **6 who had chat, call or video switched on with no
// device that could receive a push at all**. Neither they nor the admin had any
// way of knowing.
//
// `vendor_devices` has recorded WHICH devices an astrologer is signed in on since
// 2026-09. It has never recorded whether any of them is permitted to show a
// notification. That is the only gap this file closes.
//
// IT DOES NOT GO THROUGH /api/vendor/fcm-token. That endpoint requires a token,
// and when the permission is DENIED there is no token — so `getFCMToken` fails,
// the existing sync never runs, and the refusal goes unrecorded. That is precisely
// the hole being closed, so it needs its own call.
//
// Pure JS: `react-native-device-info` and `@react-native-firebase/messaging` are
// already in the binary, so this reaches installed builds by OTA.

import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import DeviceInfo from 'react-native-device-info';
import Instance from '../api/ApiCall';
import { getDeviceId } from './deviceId';
import { getCurrentLanguage } from '../context/LanguageContext';

const LAST_STATUS_KEY = 'vendorNotificationPermissionLast';
const ASKED_KEY = 'vendorNotificationPermissionAsked';

/**
 * 'granted' | 'denied' | 'blocked' | 'undetermined'.
 *
 * `messaging().hasPermission()` is the primary signal on both platforms: on iOS it
 * reports the real four-way status, and on Android react-native-firebase answers
 * from NotificationManagerCompat.areNotificationsEnabled(), which is what makes
 * "switched it off in Settings" visible on Android 12 and below where there is no
 * runtime permission at all.
 *
 * DENIED AND BLOCKED ARE THE SAME OS ANSWER and separating them needs memory: if
 * this device has been recorded as granted before and the OS now says no, they
 * turned it off afterwards. Worth the one stored string, because the two need
 * different things said to the astrologer.
 *
 * Never throws.
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
    try {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        status = granted ? 'granted' : 'denied';
      }
    } catch (__) { status = 'undetermined'; }
  }

  try {
    const last = await AsyncStorage.getItem(LAST_STATUS_KEY);
    if (status === 'denied' && last === 'granted') status = 'blocked';
    if (status !== 'undetermined') {
      await AsyncStorage.setItem(LAST_STATUS_KEY, status === 'blocked' ? 'denied' : status);
    }
  } catch (_) { /* best-effort */ }

  return status;
}

export async function markPermissionAsked() {
  try { await AsyncStorage.setItem(ASKED_KEY, String(Date.now())); } catch (_) { /* best-effort */ }
}

async function wasEverAsked() {
  try { return !!(await AsyncStorage.getItem(ASKED_KEY)); } catch (_) { return false; }
}

// The app's own view of whether a request could reach it, so HomeScreen can warn
// without a round trip of its own. Updated by every sync.
let lastReachable = null;
export const getLastReachable = () => lastReachable;

let lastSyncAt = 0;
const SYNC_GAP_MS = 60 * 1000;

/**
 * Report this device's permission state, language and token.
 *
 * Called on login, on token refresh, on every foreground, and — most importantly —
 * immediately after the permission dialog is answered, which is the only moment a
 * REFUSAL can ever be recorded.
 *
 * @returns {{ok, permissionStatus, reachable}} `reachable` is the SERVER's answer
 *   across all of this astrologer's devices, not just this one, so a second phone
 *   that still works means no warning is shown.
 *
 * Never throws. Silently does nothing when not signed in; the login path syncs
 * again once there is an account to attach the device to.
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

    const lang = String(getCurrentLanguage() || '').toLowerCase();
    const locale = lang.startsWith('hi') ? 'hi' : 'en';

    const { data } = await Instance.post(
      '/api/vendor/notification-device',
      {
        deviceId,
        fcmToken: fcmToken || undefined,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        appVersion: (() => { try { return DeviceInfo.getVersion(); } catch (_) { return undefined; } })(),
        locale,
        permissionStatus,
        permissionAsked: everAsked,
      },
      { headers: { Authorization: `Bearer ${authToken}` } },
    );

    lastReachable = data?.reachable === true;
    return { ok: true, permissionStatus, reachable: lastReachable };
  } catch (_) {
    // A missed sync is corrected on the next foreground. Nothing here is worth an
    // error in front of an astrologer who is trying to take consultations.
    return { ok: false, reason: 'failed' };
  }
}

// ──────────────────────────────────────────────────────────────── tracking ──

const reported = new Set();

/**
 * Report what happened to a campaign notification: 'delivered', 'opened' or
 * 'clicked'. The backend resolves the row from the campaign id plus the
 * astrologer in the JWT, so nothing identifying travels in the push payload and a
 * phone cannot claim somebody else's open.
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
    reported.delete(key);
  }
}

export function campaignIdOf(remoteMessage) {
  return remoteMessage?.data?.campaignId || remoteMessage?.userInfo?.campaignId || null;
}

// ────────────────────────────────────────────────────────────── deep links ──

/**
 * Screens a notification is allowed to open.
 *
 * AN ALLOWLIST, not a pass-through: `navigate()` with a name no navigator knows
 * does nothing visible, so an admin's typo would produce a notification that opens
 * the app and then sits there — the exact failure the deep link exists to fix.
 *
 * Keep in step with DEEP_LINKS in astrowani-admin/src/pages/NotificationCenter.jsx.
 * NOTE the two apps have different screens, so a link meant for astrologers must be
 * chosen from this list and not from the customer app's.
 */
export const DEEP_LINK_SCREENS = new Set([
  'HomeScreen', 'Wallet', 'Profile', 'EditProfile', 'SessionHistory', 'MissedSessions',
  'MyCustomers', 'FreeCalls', 'Notification', 'Support', 'Settings',
  'PerformanceDashboard', 'RemedyReferrals', 'WhatsAppChats', 'RatingReview',
  'ChatHistoryList', 'GoLiveScreen', 'BlockedCustomers',
]);

export function resolveDeepLink(value) {
  const name = String(value || '').trim();
  if (!name) return null;
  return DEEP_LINK_SCREENS.has(name) ? name : null;
}
