import {NativeModules, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which offline QR poster (or ad) this install came from.
 *
 * Each printed poster's QR points at a Play Store link carrying its own
 * `referrer=utm_source=qr_<place>`. Play stores that against the install and hands it
 * back through the native InstallReferrer module; we read it once and send it with the
 * signup, where the backend records it on the new customer row.
 *
 * Read at SIGNUP rather than at app launch, deliberately: Play retains the referrer
 * indefinitely, so reading it later returns the same value, and doing it here means
 * there is no launch-time work and no state to keep in sync. An install that never
 * signs up is not attributed by us at all — that gap is Play Console's job to report,
 * and trying to cover it here would mean tracking anonymous devices.
 *
 * THREE WAYS THIS RETURNS NOTHING, all normal and all handled:
 *   - iOS: there is no Play Install Referrer equivalent without a paid attribution SDK.
 *   - An older store build running this over OTA: the native module does not exist.
 *   - A sideloaded APK, or a device with no Play Store.
 * In every case the customer signs up exactly as before and is simply unattributed.
 */

// Cached so a retried signup (wrong OTP, then right one) does not rebind the Play
// service. Only ever holds a value we successfully read.
const CACHE_KEY = 'acquisitionReferrer';

// The native call binds to a Play Store service, which is normally instant but can
// hang on a device whose Play Services is wedged. This runs inside the OTP
// verification request, so it is capped: an attribution is worth a moment, never a
// customer stuck on a spinner.
const TIMEOUT_MS = 2500;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(''), ms)),
  ]);

/**
 * Pull utm_source out of a Play referrer string.
 *
 * Mirrors the backend's parser (astrowani-backend/src/acquisition.js) so the app can
 * report the same value it will be attributed under. The backend re-derives it
 * regardless and its answer is the authority — this is a convenience, not a source of
 * truth, which is why a parse failure here is harmless.
 */
function parseSource(referrer) {
  if (!referrer) return null;
  const match = /(?:^|&)utm_source=([^&]*)/.exec(String(referrer));
  if (!match) return null;
  let value = match[1];
  try {
    value = decodeURIComponent(value.replace(/\+/g, ' '));
  } catch (e) {
    // A malformed percent-escape is not worth losing the signup over; fall through
    // with the undecoded value and let the backend's own parser decide.
  }
  const cleaned = String(value).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 80);
  return cleaned || null;
}

/**
 * Read the install referrer, for sending with a signup.
 *
 * ALWAYS resolves — never throws and never rejects. Returns
 * `{acquisitionSource, acquisitionRaw}` with nulls when nothing could be determined,
 * shaped to be spread straight into the verify request body.
 */
export async function getAcquisition() {
  const empty = {acquisitionSource: null, acquisitionRaw: null};

  try {
    if (Platform.OS !== 'android') return empty;

    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) return {acquisitionSource: parseSource(cached), acquisitionRaw: cached};

    // Guarded rather than imported at the top: this file ships over OTA to store
    // builds made before the native module existed, where the module is simply
    // absent. Touching a method on it would throw during signup.
    const native = NativeModules.InstallReferrer;
    if (!native || typeof native.getInstallReferrer !== 'function') return empty;

    const raw = await withTimeout(native.getInstallReferrer(), TIMEOUT_MS);
    if (!raw) return empty;

    // Cache failures are irrelevant — the value is already in hand for this signup.
    AsyncStorage.setItem(CACHE_KEY, String(raw)).catch(() => {});

    return {acquisitionSource: parseSource(raw), acquisitionRaw: String(raw)};
  } catch (e) {
    return empty;
  }
}

export default {getAcquisition};
