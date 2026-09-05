import axios from 'axios';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '../config/api';
import { navigationRef } from '../utils/navigationRef';
import { translate } from '../context/LanguageContext';

const Instance = axios.create({
  baseURL: SOCKET_URL,
  // baseURL: 'https://f92c77194ad6.ngrok-free.app/',
  // Raised from 15s (audit 2026-08-18). The backend's EnableX send had no
  // timeout at all, so a slow carrier meant this client gave up first: the app
  // showed "Failed to send OTP" while the backend went on to send the SMS and
  // store the row. The user got a code AND an error, tapped Resend, and hit the
  // 45s cooldown 429.
  //
  // 20s is deliberately LONGER than the backend's own 10s EnableX timeout, so
  // the backend is always the party that decides a send failed and can roll the
  // stored OTP back. Never drop this below that.
  timeout: 20000,
});

// ── Expired-session handling ────────────────────────────────────────────────
//
// Port of the customer app's interceptor (src/api/ApiCall.js). The backend issues
// 30-day JWTs to astrologers too, and NOTHING here used to react to a 401 — this
// file had no interceptors at all. The token was only ever cleared by a manual
// logout, so once one aged out the astrologer got empty history, a dead wallet
// screen and silently failing accepts, with no indication that logging in again was
// the fix.
//
// Paths that are part of SIGNING UP or SIGNING IN must be exempt. They legitimately
// 401 (wrong OTP, unknown number, an expired pre-registration token) and reacting to
// those would bounce someone out of the very flow they are standing in.
const AUTH_PATHS = [
  '/api/users/mobile-otp-request',
  '/api/users/mobile-otp-verify',
  // Registration carries the short-lived pre-registration token, not a session one.
  '/api/vendor/register',
  '/api/upload-image',
];

// One expiry can produce many parallel 401s — HomeScreen alone fires several
// requests at once. Without this latch each would clear storage and stack its own
// alert. Released on a timer so a genuine second expiry later in the same app run is
// still handled.
let handlingExpiredSession = false;

async function handleExpiredSession() {
  if (handlingExpiredSession) return;

  // Latch BEFORE the first await, not after.
  //
  // Every `await` yields the event loop. With the flag set further down, concurrent
  // 401s all clear the check above before any of them reaches the assignment, and the
  // user gets one alert and one navigation reset per request — measured on the
  // customer app, not hypothetical. Setting it synchronously here is what actually
  // makes this single-fire.
  handlingExpiredSession = true;

  // No stored token means this 401 is "not logged in", not "session expired" — the
  // app is already somewhere that expects that, so say nothing. Re-arm immediately
  // rather than on the timer: nothing was consumed, and a real expiry moments later
  // must not be swallowed.
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    handlingExpiredSession = false;
    return;
  }

  try {
    // Only the token, NOT AsyncStorage.clear(). The logout path clears everything
    // because the astrologer chose to leave; here they are about to sign back into
    // the same account, and astroId/fcmToken/language are still theirs.
    await AsyncStorage.removeItem('token');
  } catch (_) {
    // Even if storage misbehaves, still get them to Login — a stuck token is better
    // than a stuck app.
  }

  if (navigationRef.current?.isReady()) {
    navigationRef.current.reset({ index: 0, routes: [{ name: 'Login' }] });
  }
  Alert.alert(translate('session.expiredTitle'), translate('session.expiredMsg'));

  // Deliberately released on a timer rather than on navigation: the reset above is
  // the last thing this flow does, and re-arming immediately would let the burst of
  // in-flight 401s that triggered it queue a second alert behind the first.
  setTimeout(() => { handlingExpiredSession = false; }, 5000);
}

Instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    if (status === 401 && !AUTH_PATHS.some((p) => url.includes(p))) {
      // Fire-and-forget: the rejection below must not wait on storage/navigation, so
      // every caller's own catch block still runs at the normal time.
      handleExpiredSession();
    }
    return Promise.reject(error);
  },
);

export const api = SOCKET_URL;
// export const api = SOCKET_URL
export default Instance;
