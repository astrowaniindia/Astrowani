// Brute-force and SMS-cost guards for OTP login (security audit 2026-11-13).
//
// 1. A cap on WRONG guesses per phone number across codes (sql/otp_failure_guard.sql).
//    OTP_MAX_ATTEMPTS burns one code after 5 misses, but a fresh code could be had every
//    45s forever. Now 15 misses in 6 hours lock that number for 6 hours.
// 2. A per-IP limit on OTP *sends*, keyed on Cloudflare's CF-Connecting-IP. Without it a
//    script could spray SMS at thousands of numbers up to the global hourly cap — real
//    money per message (SMS pumping). Deliberately generous: Indian mobile carriers put
//    many people behind one IP (CGNAT), and a limit tight enough to bite a pumping
//    script must not lock out a crowded cell tower.
//
// Both FAIL OPEN on a database error: a guard that blocks every login because its own
// table is unreachable is a bigger outage than the attack it prevents.

const MAX_FAILURES = 15;
const WINDOW_SECONDS = 6 * 60 * 60;
const LOCK_SECONDS = 6 * 60 * 60;

// The store-reviewer number's OTP is published in the App Store / Play review notes.
// Locking it would let anyone shut the reviewer out mid-review; guarding it protects
// nothing, since the code is public. Exempt.
const EXEMPT = new Set(['9999999999']);

function createOtpGuard(db, { now = () => Date.now() } = {}) {
  async function lockedUntil(phone) {
    if (EXEMPT.has(String(phone))) return null;
    try {
      const { data } = await db.from('otp_failure_guard')
        .select('locked_until').eq('phone_number', String(phone)).maybeSingle();
      const t = data?.locked_until ? new Date(data.locked_until).getTime() : 0;
      return t > now() ? t : null;
    } catch (_) {
      return null;
    }
  }

  async function recordFailure(phone) {
    if (EXEMPT.has(String(phone))) return null;
    try {
      const { data, error } = await db.rpc('otp_guard_record_failure', {
        p_phone: String(phone), p_max: MAX_FAILURES,
        p_window_seconds: WINDOW_SECONDS, p_lock_seconds: LOCK_SECONDS,
      });
      if (error) return null;
      const t = data ? new Date(data).getTime() : 0;
      return t > now() ? t : null;
    } catch (_) {
      return null;
    }
  }

  async function clear(phone) {
    try { await db.from('otp_failure_guard').delete().eq('phone_number', String(phone)); } catch (_) { /* best effort */ }
  }

  return { lockedUntil, recordFailure, clear };
}

/** Human message for a locked number, in minutes. */
function lockedMessage(untilMs) {
  const mins = Math.max(1, Math.ceil((untilMs - Date.now()) / 60000));
  const when = mins >= 60 ? `${Math.ceil(mins / 60)} hour(s)` : `${mins} minute(s)`;
  return `Too many incorrect codes for this number. For your security, please try again in ${when}.`;
}

/** The client IP for rate limiting. Cloudflare sets CF-Connecting-IP and the origin
 *  only accepts Cloudflare's ranges, so it cannot be forged from outside; website
 *  traffic arrives through the shop's nginx proxy, where req.ip would be that proxy. */
function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  return (typeof cf === 'string' && cf.trim()) || req.ip || 'unknown';
}

module.exports = { createOtpGuard, lockedMessage, clientIp, MAX_FAILURES, WINDOW_SECONDS, LOCK_SECONDS };
