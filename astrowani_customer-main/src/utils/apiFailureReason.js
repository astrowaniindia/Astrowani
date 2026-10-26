// Why a request failed, as ONE short analytics-safe string.
//
// WHY THIS EXISTS (2026-09-18). The signup/login screens reported every failed
// OTP request as the single reason `other`, and the OTP screen reported every
// failed verify as `otp_verify_error`. Both were dead ends when diagnosing a
// real drop in signups: `other` could not tell "the phone had no connection"
// from "nginx answered 502" from "the backend threw", and a wrong OTP (an HTTP
// 400, which axios throws on) was filed under the same label as a network
// outage. On 2026-09-17 three people failed to sign up within six minutes and
// the only record left was the word `other` — the evidence was gone.
//
// Order matters: the server's own code is the most specific thing available, so
// it wins. Below that, distinguish "no response at all" (the request never
// completed) from "a response we did not expect", because those two have
// completely different owners — the user's network vs ours.
export function apiFailureReason(error) {
  const res = error?.response;

  // 1. The backend named the problem itself (NO_ACCOUNT, OTP_EXPIRED, ...).
  const code = res?.data?.code;
  if (typeof code === 'string' && code) return code;

  // 2. A response arrived but carried no code — keep the status, since a 502 or
  //    504 means the proxy/backend, while a 400 means our own payload.
  if (res?.status) return `http_${res.status}`;

  // 3. No response. Axios reports a timeout distinctly from a dropped or
  //    refused connection, and telling those apart is the difference between
  //    "our server was slow" and "their phone had no internet".
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) return 'timeout';
  if (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK') return 'network_error';
  if (error?.code) return String(error.code).slice(0, 40);

  return 'unknown';
}

/**
 * True when the request never got an answer -- the phone was offline, the connection
 * dropped, or it timed out waiting. NOT true for anything the server replied with,
 * however bad: a 500 is our fault and must not be blamed on the user's internet.
 *
 * It exists so screens can tell the two apart in what they SAY. "Something went wrong"
 * for a dropped connection reads as a bug in the app, sends people to support for a
 * problem support cannot fix, and hides the one action that actually works -- trying
 * again. Measured 2026-10-26 on the dev machine: a dead IPv6 route plus a slow IPv4
 * fallback produced exactly this error on the login screen.
 */
export function isConnectivityError(error) {
  const reason = apiFailureReason(error);
  return reason === 'timeout' || reason === 'network_error';
}
