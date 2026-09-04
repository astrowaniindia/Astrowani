import axios from 'axios';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '../config/api';
import { navigationRef } from '../utils/NavigationService';
import { translate } from '../context/LanguageContext';

const Instance = axios.create({
  baseURL: SOCKET_URL,
  // Was unset (audit 2026-08-18), meaning a stalled request hung forever: on the
  // OTP screen that showed as a spinner that never resolved until the OS finally
  // dropped the socket.
  //
  // 20s is deliberately LONGER than the backend's own 10s timeout on the EnableX
  // send, so the backend is always the party that decides a send failed and can
  // roll the stored OTP back. If this ever drops below that, the app starts
  // reporting failures for requests the backend went on to complete — which is
  // the exact bug this pair of timeouts exists to prevent.
  timeout: 20000,
});

/**
 * Per-request override for the handful of calls that legitimately take longer
 * than the 20s default: pass `{ timeout: LONG_REQUEST_TIMEOUT_MS }`.
 *
 * The default above exists so a stalled request cannot hang the UI forever. But
 * two things here are genuinely slow and were previously protected only by
 * having no timeout at all:
 *   - POST /api/upload-image  — a base64 profile photo is often 1-3 MB, and on
 *     Indian mobile data that can easily exceed 20s.
 *   - POST /api/astro/:key    — the backend waits on the third-party Jyotisham
 *     report generation before it can answer.
 * Capping those at 20s would trade the OTP hang for a broken photo upload and
 * broken paid reports, so they opt out explicitly.
 *
 * Note the Free Services screens are unaffected either way — they call the API
 * with bare `fetch`, not this instance.
 */
export const LONG_REQUEST_TIMEOUT_MS = 60000;

// ── Expired-session handling ────────────────────────────────────────────────
//
// The backend issues 30-day JWTs and NOTHING used to react to a 401. The token was
// only ever cleared by a manual logout, so once a token aged out the customer got
// empty lists, failing calls and silent errors with no indication that logging in
// again was the fix. This is the interceptor that closes that.
//
// Paths that are part of SIGNING IN must be exempt. They legitimately 401 (wrong
// OTP, unknown number) and reacting to those would clear a token that was never
// there and bounce someone out of the login flow they are standing in.
const AUTH_PATHS = [
  '/api/users/mobile-otp-request',
  '/api/users/mobile-otp-verify',
  '/api/users/verify-otp',
  '/api/users/login-with-email',
  '/api/guide-avatar/config',
];

// One expiry can produce many parallel 401s (a screen firing several requests at
// once). Without this latch each would clear storage and stack its own alert.
// Reset once the customer is back on Login, so a genuine second expiry later in
// the same app run is still handled.
let handlingExpiredSession = false;

async function handleExpiredSession() {
  if (handlingExpiredSession) return;

  // Latch BEFORE the first await, not after.
  //
  // Every `await` yields the event loop. With the flag set further down, five
  // concurrent 401s all cleared the check above before any of them reached the
  // assignment, and the user got five stacked alerts and five navigation resets —
  // measured, not hypothetical. Setting it synchronously here is what actually makes
  // this single-fire.
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
    await AsyncStorage.removeItem('token');
  } catch (_) {
    // Even if storage misbehaves, still get them to Login — a stuck token is
    // better than a stuck app.
  }

  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
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
      // Fire-and-forget: the rejection below must not wait on storage/navigation,
      // so every caller's own catch block still runs at the normal time.
      handleExpiredSession();
    }
    return Promise.reject(error);
  },
);

export const api = SOCKET_URL;
// export const api = SOCKET_URL
export default Instance;

export const PROKERALA_API_KEY = 'CLEXsZgZTKo890F2Al0Nn1u3LYDfjdydiX2BFJgE';