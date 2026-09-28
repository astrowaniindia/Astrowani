// astrowani-backend/src/push.js
// Firebase Admin push sending. Inactive (no-op, logs only) until a service-account
// credential is provided via FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH —
// same "graceful until configured" pattern as the EnableX SMS integration in index.js.

const path = require('path');
// firebase-admin v12+ dropped the old namespaced admin.credential/admin.messaging()
// API from the default require('firebase-admin') export — cert/initializeApp and
// messaging now live in their own modular subpaths.
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { createClient } = require('@supabase/supabase-js');

// Own service-role client, same convention as every other module here. Service role
// because this writes to `customers`, which anon has held no write privilege on since
// hardening_15/17.
//
// Built LAZILY rather than at module scope, which is the one place this file departs
// from that convention. index.js requires push.js on line 8, so a throw here would
// happen before the server exists and would take the whole backend down at boot —
// and `createClient` does throw on a runtime without native WebSocket unless a `ws`
// transport is supplied (Node < 22; there is no shim in this repo). Trading a boot
// failure for "dead tokens go unrecorded" is the right way round for bookkeeping that
// the module's whole design says must never affect a notification.
let dbClient;
function getDb() {
  if (dbClient !== undefined) return dbClient;
  try {
    dbClient = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : null;
  } catch (err) {
    console.error('[push] could not create Supabase client — dead tokens will not be recorded:', err.message);
    dbClient = null;
  }
  return dbClient;
}

// TEMP diagnostic state — safe to inspect without leaking the actual secret
// (only length + first/last char, never the credential content itself).
const debugInfo = { hasEnvVar: false, envVarLength: 0, envVarFirstChar: null, envVarLastChar: null, initError: null };

function initFirebaseAdmin() {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    debugInfo.hasEnvVar = !!serviceAccountJson;
    if (serviceAccountJson) {
      debugInfo.envVarLength = serviceAccountJson.length;
      debugInfo.envVarFirstChar = serviceAccountJson[0];
      debugInfo.envVarLastChar = serviceAccountJson[serviceAccountJson.length - 1];
    }

    let credential;
    if (serviceAccountJson) {
      credential = cert(JSON.parse(serviceAccountJson));
    } else if (serviceAccountPath) {
      credential = cert(require(path.resolve(serviceAccountPath)));
    } else {
      console.log('[push] Firebase service account not configured — push notifications disabled.');
      return false;
    }

    initializeApp({ credential });
    console.log('[push] Firebase Admin initialized — push notifications enabled.');
    return true;
  } catch (err) {
    console.error('[push] Failed to initialize Firebase Admin:', err.message);
    debugInfo.initError = err.message;
    return false;
  }
}

const isReady = initFirebaseAdmin();

// ---------------------------------------------------------------------------
// Dead-token detection
//
// Firebase answers EVERY send with a per-token verdict, and an uninstalled app comes
// back as `messaging/registration-token-not-registered`. That answer was being thrown
// away: sendPush returned the whole response object but no caller has ever read
// `responses[]`, so a token stayed in the database forever after the app it pointed at
// was gone. Two visible consequences — the Customer Tracking badge claimed push was on
// for people who had removed the app, and the broadcast recipient count in adminRoutes
// (which counts `fcm_token is not null`) overstated reach by the same amount.
//
// So: read the verdicts, clear the dead token, and stamp when it died.
//
// THE ONE RULE HERE: none of this may affect the send. It runs after the response is in
// hand, it is never awaited by sendPush, and every branch swallows its own errors. A
// failure to record a statistic must never turn into a failed notification.
// ---------------------------------------------------------------------------

// Errors that mean "this token is dead, stop using it" rather than "try again later".
// A transient failure (quota, unavailable, internal) is deliberately NOT here — treating
// a 503 as an uninstall would wipe the tokens of everyone who happened to be in a failed
// batch, which is unrecoverable: we could never push them again to find out we were wrong.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered', // the app is gone from that device
  'messaging/invalid-registration-token',        // malformed — it was never usable
  'messaging/invalid-argument',                  // FCM's newer code for a bad token
]);

// Latched so a database missing the migration logs once per process instead of on every
// push. Same posture as src/wallet.js's dedupe guard: the feature degrades to "not
// recorded" and the pushes themselves carry on untouched.
let removalColumnAvailable = true;

// A SINGLE `not-registered` response is not reliable enough to act on immediately.
// Measured 2026-09-28: a customer actively chatting (recharging, being billed minute by
// minute) got marked "app removed" mid-session. FCM's HTTP v1 API is documented to return
// this code sporadically under a burst of sends to the same token in quick succession —
// exactly what a live chat produces, since every message the astrologer sends fires its
// own single-token push (see /api/push/notify-chat-message) — without the token actually
// being dead. Trusting the first response nulled a token that kept working seconds later.
//
// So: require the SAME token to be seen dead again after some real time has passed, with
// no successful send to it in between, before actually clearing it. A genuinely
// uninstalled app keeps failing every time and gets caught a few minutes later than
// before; a burst-flaky response self-heals the moment the very next send succeeds.
// In-memory only (resets on redeploy) — same posture as every other in-memory counter in
// this codebase; worst case after a restart is one extra confirmation cycle, never a
// wrongly-cleared token.
const DEAD_CONFIRM_WINDOW_MS = 5 * 60 * 1000;
const pendingDeadSince = new Map(); // token -> ms timestamp of first dead sighting

/**
 * Given this round's dead and successful tokens, returns the subset of `dead` that
 * should actually be recorded as removed now — those seen dead before, at least
 * DEAD_CONFIRM_WINDOW_MS ago, with no success in between. Updates `pendingDeadSince`
 * in place: records a first sighting, clears an entry on success, and clears a
 * confirmed entry once it's about to be acted on (the token is about to be nulled in
 * the database, so it can never be sent to — and therefore never reconfirmed — again).
 */
function confirmDeadTokens(dead, succeeded) {
  const now = Date.now();
  for (const token of succeeded) pendingDeadSince.delete(token);

  const confirmed = [];
  for (const token of dead) {
    const firstSeen = pendingDeadSince.get(token);
    if (firstSeen == null) {
      pendingDeadSince.set(token, now);
    } else if (now - firstSeen >= DEAD_CONFIRM_WINDOW_MS) {
      confirmed.push(token);
      pendingDeadSince.delete(token);
    }
  }
  return confirmed;
}

function isMissingColumn(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`.toLowerCase();
  return err?.code === '42703' || err?.code === 'PGRST204' || msg.includes('app_removed_at');
}

/**
 * Records that these tokens are no longer deliverable: clears them from `customers`
 * and stamps `app_removed_at`, so the admin can see who has removed the app.
 *
 * Matched by token VALUE, not by customer id, because sendPush is handed raw tokens and
 * has no idea who they belong to — which is also why this cannot be done at the call
 * sites without repeating it in the eight places that push to customers.
 *
 * Never throws.
 */
async function recordDeadTokens(deadTokens) {
  const db = getDb();
  if (!db || !deadTokens.length) return;
  try {
    for (const token of deadTokens) {
      // `.is('app_removed_at', null)` keeps the FIRST sighting rather than bumping the
      // date on every later send. The useful question is "when did we lose them", and a
      // refreshed timestamp would answer "when did we last retry", which is our own
      // behaviour rather than theirs.
      const payload = removalColumnAvailable
        ? { fcm_token: null, app_removed_at: new Date().toISOString(), app_removed_reason: 'registration-token-not-registered' }
        : { fcm_token: null };

      const { error } = await db.from('customers').update(payload).eq('fcm_token', token);

      if (error && removalColumnAvailable && isMissingColumn(error)) {
        // Migration not applied yet. Fall back to clearing the token on its own, which
        // still stops us pushing into the void and still corrects the badge.
        removalColumnAvailable = false;
        console.warn('[push] customers.app_removed_at missing — run sql/customer_app_removed.sql. Clearing dead tokens only until then.');
        await db.from('customers').update({ fcm_token: null }).eq('fcm_token', token);
      } else if (error) {
        console.error('[push] could not clear dead token:', error.message);
      }
    }
  } catch (err) {
    console.error('[push] dead-token bookkeeping failed:', err.message);
  }
}

/** Pulls the dead tokens out of a multicast response. Order is guaranteed aligned. */
function deadTokensFrom(tokenList, response) {
  const responses = response?.responses;
  if (!Array.isArray(responses)) return [];
  const dead = [];
  responses.forEach((r, i) => {
    if (!r?.success && DEAD_TOKEN_CODES.has(r?.error?.code) && tokenList[i]) {
      dead.push(tokenList[i]);
    }
  });
  return dead;
}

/** Pulls the SUCCESSFULLY delivered tokens out of a multicast response — proof of life,
 *  used to clear a pending "might be dead" sighting for that token. */
function succeededTokensFrom(tokenList, response) {
  const responses = response?.responses;
  if (!Array.isArray(responses)) return [];
  const ok = [];
  responses.forEach((r, i) => {
    if (r?.success && tokenList[i]) ok.push(tokenList[i]);
  });
  return ok;
}

/**
 * Clears any "app removed" mark for a customer, called when a fresh token is registered
 * — i.e. they reinstalled and signed in again. Without this a returning customer would
 * be shown as removed forever while their push quietly worked.
 *
 * Never throws; the caller is a login path and must not fail over bookkeeping.
 */
async function clearAppRemovedMark(customerId) {
  const db = getDb();
  if (!db || !customerId || !removalColumnAvailable) return;
  try {
    const { error } = await db
      .from('customers')
      .update({ app_removed_at: null, app_removed_reason: null })
      .eq('id', customerId)
      .not('app_removed_at', 'is', null);
    if (error && isMissingColumn(error)) {
      removalColumnAvailable = false;
    }
  } catch (_) {
    // best-effort — a stale mark is corrected on the customer's next push anyway
  }
}

// tokens: string | string[]. data values are coerced to strings (FCM requirement).
async function sendPush(tokens, { title, body, data = {} } = {}) {
  const tokenList = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
  if (!isReady || !tokenList.length) {
    return { successCount: 0, failureCount: tokenList.length };
  }

  const stringData = {};
  Object.entries(data).forEach(([key, value]) => {
    stringData[key] = String(value);
  });

  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens: tokenList,
      notification: (title || body) ? { title, body } : undefined,
      data: stringData,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    // Deliberately NOT awaited: the caller is usually mid-request (an incoming call, a
    // chat message) and must not wait on bookkeeping. A dead token that slips through
    // one send is caught by the next.
    const dead = deadTokensFrom(tokenList, response);
    if (dead.length) {
      const succeeded = succeededTokensFrom(tokenList, response);
      const confirmed = confirmDeadTokens(dead, succeeded);
      if (confirmed.length) {
        console.log(`[push] ${confirmed.length} token(s) confirmed unregistered — app removed on those devices`);
        recordDeadTokens(confirmed).catch(() => {});
      }
    }

    return response;
  } catch (err) {
    console.error('[push] send error:', err.message);
    return { successCount: 0, failureCount: tokenList.length, error: err.message };
  }
}

module.exports = {
  sendPush,
  clearAppRemovedMark,
  isPushReady: () => isReady,
  getPushDebugInfo: () => debugInfo,
  // exported for tests
  _deadTokensFrom: deadTokensFrom,
  _succeededTokensFrom: succeededTokensFrom,
  _confirmDeadTokens: confirmDeadTokens,
  _pendingDeadSince: pendingDeadSince,
  _recordDeadTokens: recordDeadTokens,
  _DEAD_TOKEN_CODES: DEAD_TOKEN_CODES,
};
