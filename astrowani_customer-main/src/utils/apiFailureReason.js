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
