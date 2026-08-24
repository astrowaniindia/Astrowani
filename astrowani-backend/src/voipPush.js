// astrowani-backend/src/voipPush.js
//
// APNs VoIP push sender for the vendor (astrologer) iOS app.
//
// WHY THIS EXISTS, and why FCM is not enough:
// On iOS a data-only FCM push cannot reliably wake a KILLED app to ring an incoming
// consultation. Android's socket + FCM + CallForegroundService combination has no iOS
// equivalent. The platform's answer is PushKit - a dedicated high-priority VoIP push
// channel iOS delivers even when the app is not running - paired with CallKit for the
// native full-screen incoming-call UI.
//
// This matters more than it sounds: CLAUDE.md's analytics audit measured a 39.3% accept
// rate with `missed: 48` versus `rejected: 7` on Android. Astrologers are not declining
// work, they are not being reached. iOS without PushKit would be strictly worse.
//
// IOS CONTRACT - do not break this:
// A VoIP push MUST result in the app reporting a call to CallKit essentially immediately.
// iOS terminates the app if it does not, and repeated offences get the app's VoIP push
// privilege revoked. The app side satisfies this in NATIVE code, inside the PushKit
// handler in AppDelegate.mm, rather than waiting for JS to boot. Never send a VoIP push
// for anything that is not a real incoming call.
//
// Deliberately built on Node's built-in http2 plus the jsonwebtoken dependency the
// backend already has, rather than adding node-apn. No new dependencies.
//
// GRACEFUL UNTIL CONFIGURED - same pattern as src/push.js and the EnableX SMS
// integration: with no APNs credentials this module logs once and every send becomes a
// no-op returning { ok: false, skipped: true }. The existing FCM push and socket paths
// are untouched, so an unconfigured deployment behaves exactly as it does today.

const fs = require('fs');
const http2 = require('http2');
const path = require('path');
const jwt = require('jsonwebtoken');

const KEY_ID = process.env.APNS_KEY_ID;
const TEAM_ID = process.env.APNS_TEAM_ID;
const RAW_KEY = process.env.APNS_PRIVATE_KEY;
const KEY_PATH = process.env.APNS_PRIVATE_KEY_PATH;

// The VoIP topic is ALWAYS the app's bundle id with ".voip" appended - it is not the
// plain bundle id, and getting this wrong yields a 400 TopicDisallowed that is easy to
// misread as a credential problem.
const VOIP_TOPIC = process.env.APNS_VOIP_TOPIC || 'com.astrowaniVendor.voip';

// A build signed with a development/ad-hoc profile gets its VoIP token from the APNs
// SANDBOX. A TestFlight or App Store build gets it from PRODUCTION. Sending a sandbox
// token to the production host (or vice versa) fails with BadDeviceToken - which is the
// single most common "push mysteriously does not work" cause on iOS. Default is sandbox,
// because the first builds of this port will be development ones.
const USE_PRODUCTION = String(process.env.APNS_PRODUCTION || '').toLowerCase() === 'true';
const APNS_HOST = USE_PRODUCTION
  ? 'https://api.push.apple.com'
  : 'https://api.sandbox.push.apple.com';

function loadPrivateKey() {
  if (RAW_KEY && RAW_KEY.trim()) {
    // Env vars cannot hold real newlines in most process managers, so accept the common
    // "\n"-escaped form as well as a genuine multi-line value.
    return RAW_KEY.includes('\\n') ? RAW_KEY.replace(/\\n/g, '\n') : RAW_KEY;
  }
  if (KEY_PATH) {
    try {
      return fs.readFileSync(path.resolve(KEY_PATH), 'utf8');
    } catch (err) {
      console.error('[voipPush] could not read APNS_PRIVATE_KEY_PATH:', err.message);
      return null;
    }
  }
  return null;
}

const PRIVATE_KEY = loadPrivateKey();
const isReady = Boolean(KEY_ID && TEAM_ID && PRIVATE_KEY);

if (!isReady) {
  console.log(
    '[voipPush] APNs VoIP not configured (need APNS_KEY_ID, APNS_TEAM_ID and ' +
      'APNS_PRIVATE_KEY or APNS_PRIVATE_KEY_PATH) - iOS killed-app call ringing is ' +
      'disabled. FCM and socket paths are unaffected.',
  );
} else {
  console.log(`[voipPush] APNs VoIP enabled -> ${APNS_HOST} topic ${VOIP_TOPIC}`);
}

// ---------------------------------------------------------------------------
// Provider auth token. APNs accepts a JWT for up to 1 hour; Apple rejects tokens
// refreshed too aggressively, so cache and reuse for 50 minutes.
// ---------------------------------------------------------------------------
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function providerToken() {
  const now = Date.now();
  if (cachedToken && now - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  cachedToken = jwt.sign({ iss: TEAM_ID, iat: Math.floor(now / 1000) }, PRIVATE_KEY, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: KEY_ID },
  });
  cachedTokenAt = now;
  return cachedToken;
}

// ---------------------------------------------------------------------------
// One long-lived HTTP/2 session, reused across sends (APNs expects connection reuse;
// opening one per push is slow and can get you throttled). Torn down and lazily
// recreated on any error or close.
// ---------------------------------------------------------------------------
let session = null;

function getSession() {
  if (session && !session.closed && !session.destroyed) return session;
  session = http2.connect(APNS_HOST);
  session.on('error', (err) => {
    console.error('[voipPush] http2 session error:', err.message);
    session = null;
  });
  session.on('close', () => {
    session = null;
  });
  // Do not let an idle keep-alive session hold the process open.
  session.unref();
  return session;
}

/**
 * Send one VoIP push.
 *
 * @param {string} deviceToken  PushKit token (hex), from astrologers.voip_token
 * @param {object} payload      Arbitrary JSON the app reads in its PushKit handler
 * @returns {Promise<{ok: boolean, status?: number, reason?: string, skipped?: boolean, unregistered?: boolean}>}
 *
 * Never throws and never rejects. A failed ring must not fail the HTTP request that
 * triggered it - the socket emit and FCM push have already gone out by then, and the
 * customer is waiting on the response.
 */
async function sendVoipPush(deviceToken, payload = {}) {
  if (!isReady) return { ok: false, skipped: true };
  if (!deviceToken) return { ok: false, skipped: true };

  const body = Buffer.from(JSON.stringify(payload));

  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let req;
    try {
      req = getSession().request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken()}`,
        'apns-topic': VOIP_TOPIC,
        // Without apns-push-type: voip, iOS 13+ refuses to deliver to PushKit at all.
        'apns-push-type': 'voip',
        // 10 = deliver immediately. A ring is worthless late.
        'apns-priority': '10',
        // 0 = do not store and retry; an unanswered ring must not arrive minutes later
        // and pop a CallKit screen for a call that is long over.
        'apns-expiration': '0',
        'content-type': 'application/json',
        'content-length': body.length,
      });
    } catch (err) {
      console.error('[voipPush] request open failed:', err.message);
      return done({ ok: false, reason: err.message });
    }

    let status = 0;
    let chunks = '';

    req.on('response', (headers) => {
      status = Number(headers[':status']) || 0;
    });
    req.on('data', (c) => {
      chunks += c;
    });
    req.on('error', (err) => {
      console.error('[voipPush] stream error:', err.message);
      done({ ok: false, reason: err.message });
    });
    req.on('end', () => {
      if (status === 200) return done({ ok: true, status });
      let reason = '';
      try {
        reason = JSON.parse(chunks || '{}').reason || '';
      } catch (_) {
        reason = chunks;
      }
      // 410 Unregistered, or 400 BadDeviceToken, means this token is dead - the app was
      // uninstalled, or (very commonly during this port) a sandbox token is being sent
      // to the production host. Surfaced so the caller can clear the stored token.
      const unregistered = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
      console.warn(`[voipPush] send failed status=${status} reason=${reason || '(none)'}`);
      done({ ok: false, status, reason, unregistered });
    });

    req.setTimeout(10000, () => {
      try {
        req.close(http2.constants.NGHTTP2_CANCEL);
      } catch (_) {}
      done({ ok: false, reason: 'timeout' });
    });

    req.end(body);
  });
}

module.exports = {
  sendVoipPush,
  isVoipReady: () => isReady,
  getVoipDebugInfo: () => ({
    configured: isReady,
    host: APNS_HOST,
    topic: VOIP_TOPIC,
    production: USE_PRODUCTION,
    hasKeyId: Boolean(KEY_ID),
    hasTeamId: Boolean(TEAM_ID),
    hasPrivateKey: Boolean(PRIVATE_KEY),
  }),
};
