// The "you are already signed in on another device" flow.
//
// Ringing goes to the NEWEST signed-in device only, so a second signed-in device
// is a trap: it shows "You are Online" with every service toggle green and will
// never receive a call. The astrologer has to be told at sign-in and given the
// choice. See astrowani-backend/src/vendorDevices.js.
//
// Blocking the second sign-in until they log out on the old device was considered
// and rejected: an astrologer whose old phone is lost, broken, sold or simply not
// to hand would be locked out of their own income with no self-service way back.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { showStatusPopup } from '../components/StatusPopup';
import { preserveDeviceId, getDeviceId } from './deviceId';

/** "Android, 2 hours ago" — enough to recognise the device, nothing more. */
function describeDevice(d, t) {
  const platform = d?.platform === 'ios' ? 'iPhone'
    : d?.platform === 'android' ? 'Android'
    : t('device.unknownDevice');

  if (!d?.lastSeenAt) return platform;
  const mins = Math.max(0, Math.round((Date.now() - new Date(d.lastSeenAt).getTime()) / 60000));
  if (mins < 2) return `${platform} · ${t('device.justNow')}`;
  if (mins < 60) return `${platform} · ${t('device.minutesAgo', { n: mins })}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${platform} · ${t('device.hoursAgo', { n: hrs })}`;
  return `${platform} · ${t('device.daysAgo', { n: Math.round(hrs / 24) })}`;
}

/**
 * Ask whether to take the account over on this device.
 *
 * @returns {Promise<boolean>} true = continue here and sign the others out.
 *
 * Uses the app's own themed popup rather than the OS Alert. An earlier version used
 * Alert on the theory that a root-level modal raised during the sign-in transition
 * was the stacked-modal shape that freezes iOS — but this is awaited BEFORE
 * navigation.reset, so only one modal is ever on screen, and the plain white system
 * dialog looked broken next to the rest of the app on both platforms.
 *
 * Dismissing it (Android back) resolves FALSE — the safe direction, since it keeps
 * the device the astrologer is actually holding rather than silently taking over.
 */
export function confirmDeviceTakeover(others, t) {
  const list = (others || []).map((d) => describeDevice(d, t)).join('\n');
  return new Promise((resolve) => {
    showStatusPopup({
      variant: 'info',
      title: t('device.alreadySignedInTitle'),
      message: t('device.alreadySignedInBody', { list }),
      confirmText: t('device.continueHere'),
      cancelText: t('device.keepOther'),
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/**
 * End this device's session because ANOTHER device took the account over.
 *
 * Deliberately does NOT call /api/vendor/logout: the row for this device is already
 * gone (the takeover deleted it), and calling logout would look like "the last
 * device signed out" and stamp logged_out_at on an account that is signed in and
 * online elsewhere — reintroducing the exact bug this whole subsystem exists to fix.
 */
export async function forceSignOutLocally() {
  try {
    await AsyncStorage.clear();
  } catch (_) { /* ignore */ }
  // clear() takes the device id with it; see deviceId.js.
  await preserveDeviceId();
}

/**
 * Is this device still signed in, or did another device take over while we were away?
 *
 * ⚠ FAILS OPEN in every direction — any error, any unreadable answer, and any
 * response that is not an explicit `signedIn: false` returns true. Wrongly signing
 * an astrologer out mid-shift costs them income; leaving a stale session up merely
 * shows a screen they can log out of.
 */
export async function isStillSignedIn() {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return true; // not signed in at all — not our problem to decide
    const deviceId = await getDeviceId();
    const res = await Instance.get('/api/vendor/devices/check', {
      params: { deviceId },
      headers: { Authorization: `Bearer ${token}` },
    });
    return res?.data?.signedIn !== false;
  } catch (e) {
    console.log('[deviceSession] session check failed, assuming signed in —', e?.message);
    return true;
  }
}

/**
 * Sign the astrologer's OTHER devices out, keeping this one.
 *
 * Best-effort: a failure here leaves the other device signed in, which is the
 * state they were already in a moment ago. Blocking a completed sign-in on it
 * would be worse than the stale row.
 */
export async function signOutOtherDevices(token, deviceId) {
  try {
    await Instance.post(
      '/api/vendor/devices/sign-out-others',
      { deviceId },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return true;
  } catch (e) {
    console.log('[deviceSession] could not sign out other devices —', e?.message);
    return false;
  }
}

/**
 * They chose to keep the other device: undo this sign-in.
 *
 * Removes the row this login just created, so nothing is left claiming this phone
 * is signed in — otherwise it would sit there as the NEWEST device and quietly
 * capture every incoming call away from the device they actually chose.
 *
 * That server call is what makes this more than a local cleanup, so it runs FIRST
 * and its failure is tolerated: the local state is cleared regardless, because
 * leaving them half-signed-in would be worse than a stale row the next sign-in
 * replaces anyway.
 */
export async function abandonThisSignIn(token, deviceId) {
  try {
    await Instance.post(
      '/api/vendor/logout',
      { deviceId },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (e) {
    console.log('[deviceSession] could not release this device —', e?.message);
  }
  try {
    await AsyncStorage.clear();
  } catch (_) { /* ignore */ }
  // clear() takes the device id with it. Put it back, or the next sign-in on this
  // same handset looks like a brand-new device and warns about itself.
  await preserveDeviceId();
}
