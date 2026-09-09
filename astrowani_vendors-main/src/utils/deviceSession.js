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
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { preserveDeviceId } from './deviceId';

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
 * Uses Alert rather than a themed modal on purpose: this fires during the sign-in
 * transition, before any screen has settled, and a root-level modal raised at that
 * moment is the stacked-modal shape that freezes iOS (see the ios_platform_traps
 * memory). cancelable:false so it cannot be dismissed into an undecided state.
 */
export function confirmDeviceTakeover(others, t) {
  const list = (others || []).map((d) => describeDevice(d, t)).join('\n');
  return new Promise((resolve) => {
    Alert.alert(
      t('device.alreadySignedInTitle'),
      t('device.alreadySignedInBody', { list }),
      [
        { text: t('device.keepOther'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('device.continueHere'), style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
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
