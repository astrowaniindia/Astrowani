// A short retry for transient failures reaching Supabase's own gateway.
//
// WHY THIS EXISTS: on 2026-10-06 and 2026-10-07 the backend logged bursts of
// Cloudflare 522/525 errors calling gateway.supabase.co (20+ in a single
// 31-minute window on 2026-10-07), while Supabase's own edge_logs showed
// thousands of requests succeeding with zero errors in that exact window, and
// Supabase's status page showed 100% uptime for ap-northeast-1 the whole time.
// That rules out a Supabase-side outage or this project hitting its connection
// ceiling — the request never reached Supabase's logged layer at all, so it's a
// network-path blip between this VPS and Cloudflare's edge for gateway.supabase.co.
// A short retry rides out that kind of blip; the alternative (what the code did
// before) was silently handing out a JWT for an account that may never have been
// created — see the mobile-otp-verify caller for what that cost in real signups.
const RETRYABLE_MESSAGE = /cloudflare|error code 52[0-7]|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i;

function isRetryableSupabaseError(error) {
  if (!error) return false;
  if (error.code === '57014' || error.code === '08006' || error.code === '08003') return true; // pg: query canceled / connection failure
  return RETRYABLE_MESSAGE.test(String(error.message || error));
}

// fn: () => Promise<{data, error}> (a supabase-js call, or anything with that
// shape). Retries once, after a short delay, ONLY when the error looks
// transient/network-level per isRetryableSupabaseError above — never on a real
// data error (constraint violation, bad input, RLS refusal), since retrying
// those would just fail again or, for a non-idempotent write, risk doing it
// twice.
async function withSupabaseRetry(fn, { retries = 1, delayMs = 400 } = {}) {
  let last;
  for (let attempt = 0; ; attempt += 1) {
    try {
      last = await fn();
    } catch (thrown) {
      // supabase-js normally resolves to {error}, but a hard network failure
      // (DNS, connection refused before any HTTP response) can reject instead.
      last = { data: null, error: thrown };
    }
    if (!last || !last.error) return last;
    if (attempt >= retries || !isRetryableSupabaseError(last.error)) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

module.exports = { withSupabaseRetry, isRetryableSupabaseError };
