// astrowani-backend/src/degradation.js
//
// Makes swallowed read failures VISIBLE without changing what the API returns.
//
// THE PROBLEM THIS SOLVES
// ~26 read endpoints deliberately degrade instead of failing: /api/banners/all
// answers `{data: [], intervalSeconds: 4}` when its query throws, /api/categories
// answers `{categories: []}`, and so on. Most of those decisions are CORRECT --
// a missing thought-of-the-day should not 500 the Home screen, and
// /api/chat/check-availability deliberately fails open so a transient error
// cannot block a paying customer from starting a chat.
//
// The bug was never that they degrade. It was that they degrade SILENTLY. On
// 2026-08-26 the Supabase credential broke and every one of those endpoints
// quietly returned "nothing", for nine hours, while /health said ok. The only
// trace was console.error into a PM2 log nobody was watching. A human noticed
// before any machine did.
//
// So instead of rewriting 26 endpoint contracts (which would break the
// intentional fail-open behaviour and probably the apps), this records each
// swallowed failure and exposes the aggregate:
//
//   * every failure is reported to Sentry via captureError, so it lands
//     somewhere a person actually looks
//   * a rolling window is exposed to /health, so MASS failure flips the health
//     check to degraded and the uptime monitor fires
//
// WHY THE THRESHOLD LOOKS AT DISTINCT SCOPES, NOT JUST A COUNT
// One endpoint failing repeatedly is a flaky endpoint. Banners AND categories
// AND blogs AND remedies all failing at once is an outage. Requiring several
// DISTINCT scopes before declaring degraded is what separates "something is a
// bit broken" from "the database is gone", and keeps a single noisy endpoint
// from paging anyone at 3am.

const { captureError } = require('./sentry');

// Rolling window of recent swallowed failures.
const WINDOW_MS = 5 * 60 * 1000;
// Below these, we record and report but do NOT call the service degraded.
const DEGRADED_MIN_FAILURES = 5;
const DEGRADED_MIN_SCOPES = 3;

/** @type {Array<{at: number, scope: string, message: string}>} */
let recent = [];

// Sentry de-duplication: the same scope erroring on every request would
// otherwise send thousands of identical events during an outage, which is both
// noisy and a good way to burn a quota exactly when you need it.
const SENTRY_DEDUPE_MS = 60 * 1000;
const lastReported = new Map();

function prune(now) {
  if (recent.length && now - recent[0].at > WINDOW_MS) {
    recent = recent.filter((r) => now - r.at <= WINDOW_MS);
  }
}

/**
 * Record a failure that the caller is about to swallow.
 *
 * Call this INSTEAD OF a bare console.error in a catch block that returns a
 * degraded-but-successful response. It does not throw and returns nothing, so
 * it can never turn a handled error into an unhandled one.
 *
 * @param {string} scope  stable identifier, e.g. 'banners' or 'categories'
 * @param {any}    err    the caught error
 */
function noteReadFailure(scope, err) {
  try {
    const now = Date.now();
    const message = (err && err.message) || String(err || 'unknown');

    prune(now);
    recent.push({ at: now, scope, message });
    // Hard cap so a pathological loop cannot grow this unbounded.
    if (recent.length > 500) recent = recent.slice(-500);

    // Still log — this is what you read when SSH'd into the box mid-incident.
    console.error(`[degraded:${scope}] ${message}`);

    const last = lastReported.get(scope) || 0;
    if (now - last > SENTRY_DEDUPE_MS) {
      lastReported.set(scope, now);
      captureError(err instanceof Error ? err : new Error(`[${scope}] ${message}`));
    }
  } catch (_) {
    // Observability must never be the thing that breaks a request.
  }
}

/**
 * Aggregate view for /health.
 *
 * @returns {{degraded: boolean, failures: number, scopes: string[], lastMessage: string|null, windowMinutes: number}}
 */
function getDegradation() {
  const now = Date.now();
  prune(now);
  const scopes = [...new Set(recent.map((r) => r.scope))];
  return {
    degraded: recent.length >= DEGRADED_MIN_FAILURES && scopes.length >= DEGRADED_MIN_SCOPES,
    failures: recent.length,
    scopes,
    lastMessage: recent.length ? recent[recent.length - 1].message : null,
    windowMinutes: WINDOW_MS / 60000,
  };
}

/** Test seam only. */
function _reset() {
  recent = [];
  lastReported.clear();
}

module.exports = { noteReadFailure, getDegradation, _reset };
