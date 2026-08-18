import axios from 'axios';
import { SOCKET_URL } from '../config/api';

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

export const api = SOCKET_URL;
// export const api = SOCKET_URL
export default Instance;

export const PROKERALA_API_KEY = 'CLEXsZgZTKo890F2Al0Nn1u3LYDfjdydiX2BFJgE';