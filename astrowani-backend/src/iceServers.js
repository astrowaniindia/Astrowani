// Serves the WebRTC ICE server list to the apps.
//
// WHY THIS EXISTS (2026-10-01)
//
// The ICE list was hardcoded in SIX app files (customer VoiceCallScreen /
// VideoCallScreen / LiveViewerScreen, vendor EnxScreenVoice / EnxScreenVideo /
// GoLiveScreen). Three consequences, all of which bit:
//
//   1. The TURN credentials shipped inside both APKs and could not be rotated
//      without a store release.
//   2. `openrelay.metered.ca` — three of the seven entries, and the ONLY
//      relay besides our own — went dead. Verified 2026-10-01: its TCP ports
//      accept a connection but it never answers STUN/TURN at all, because the
//      free `openrelayproject` credentials are no longer served. Every app in
//      the field still wastes ICE gathering time on it, and the config LOOKS
//      like it has a backup relay when it has none.
//   3. Adding a relay — a second provider, or TURNS on 443 for networks that
//      block UDP and non-standard ports — required an app release and then
//      waiting for adoption.
//
// With the list served from here, a relay can be added, replaced or repaired
// for every installed app within one backend deploy.
//
// TURN IS THE CALL'S AUTOMATIC BACKUP. It is not a second call and not a
// redial: ICE gathers direct (host/srflx) and relay candidates in parallel
// during the SAME connection attempt, and if the direct path fails it switches
// to the relay by itself, usually within a second or two. That is why keeping
// this list correct matters more than almost anything else in the call path.
//
// CREDENTIAL MODES, in order of preference:
//
//   A. TURN_STATIC_AUTH_SECRET — coturn's time-limited credentials
//      (`use-auth-secret`). username = "<unix-expiry>:<user>", credential =
//      base64(HMAC-SHA1(secret, username)). Credentials are minted per request
//      and expire, so a leaked one is worthless within hours. This is the
//      correct production setting.
//   B. TURN_USERNAME / TURN_CREDENTIAL — a static pair from the environment.
//      Rotatable with a deploy, but long-lived.
//   C. Neither set — falls back to the pair currently compiled into the apps,
//      so deploying this module changes nothing until it is configured.
//
// FAILURE POSTURE: the apps keep their own bundled list and use it whenever
// this endpoint is unreachable, slow or unauthorised. This endpoint being down
// must never stop a call from connecting — it can only ever improve the list.

const crypto = require('crypto');

// How long a minted credential stays valid. Long enough to cover a long call
// plus reconnects; short enough that a leaked credential is not a free relay.
const TURN_TTL_SECONDS = Number(process.env.TURN_CREDENTIAL_TTL_SECONDS || 12 * 3600);

// The relay host(s). Comma-separated so a second provider can be added without
// touching code: TURN_URLS="turn:a.example:3478,turns:a.example:5349"
const DEFAULT_TURN_URLS = [
  'turn:76.13.243.165:3478',
  'turn:76.13.243.165:3478?transport=tcp',
];

// Public STUN. Cheap, and only used to discover the reflexive candidate.
const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

// Mode C fallback — what the shipped apps already carry.
const LEGACY_TURN_USERNAME = 'astrowani';
const LEGACY_TURN_CREDENTIAL = '23fc84a011212f5bc729bf9752961d2e';

function splitEnvList(value, fallback) {
  const raw = (value || '').trim();
  if (!raw) return fallback;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

/**
 * Mint a coturn time-limited credential pair.
 * Returns null when no shared secret is configured.
 */
function mintTimeLimitedCredential(secret, label = 'astrowani') {
  if (!secret) return null;
  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${expiry}:${label}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential, expiresAt: expiry };
}

/**
 * Build the ICE server list.
 *
 * @param {string} [label] identifies the caller in the minted username; useful
 *                         for reading coturn logs. Never trusted for auth.
 */
function buildIceServers(label) {
  const stunUrls = splitEnvList(process.env.STUN_URLS, DEFAULT_STUN_URLS);
  const turnUrls = splitEnvList(process.env.TURN_URLS, DEFAULT_TURN_URLS);

  const servers = stunUrls.map((urls) => ({ urls }));

  const minted = mintTimeLimitedCredential(process.env.TURN_STATIC_AUTH_SECRET, label);
  const username = minted ? minted.username : (process.env.TURN_USERNAME || LEGACY_TURN_USERNAME);
  const credential = minted ? minted.credential : (process.env.TURN_CREDENTIAL || LEGACY_TURN_CREDENTIAL);

  if (turnUrls.length) {
    // One entry carrying every relay URL: the browser/RN stack tries them all,
    // and grouping avoids repeating the credential per URL.
    servers.push({ urls: turnUrls, username, credential });
  }

  return {
    iceServers: servers,
    // Lets the app cache sensibly and re-fetch before the credential dies.
    expiresInSeconds: minted ? TURN_TTL_SECONDS : null,
    mode: minted ? 'time-limited' : (process.env.TURN_USERNAME ? 'static-env' : 'legacy-builtin'),
  };
}

/**
 * GET /api/call/ice-servers
 *
 * Auth is required — these are relay credentials and an open endpoint is a free
 * bandwidth relay for anyone who finds it. It is safe to require because the
 * apps fall back to their bundled list on ANY failure, so a rejected request
 * degrades to today's behaviour rather than breaking a call.
 *
 * Accepts EITHER a customer or an astrologer token: both sides of a call need
 * the same relays. The token is only used to establish "is a logged-in user
 * asking" and to label the minted credential — nothing here is scoped per user.
 *
 * Deliberately self-contained rather than reusing resolveCustomerFromReq():
 * that does a phone->row database lookup, and this endpoint sits directly in
 * the call-setup path where an extra round trip to a free-tier database in
 * another region is exactly what you do not want.
 */
function registerIceServerRoutes(app, { jwtSecret }) {
  const jwt = require('jsonwebtoken');

  app.get('/api/call/ice-servers', (req, res) => {
    let label = 'astrowani';
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }
      const decoded = jwt.verify(token, jwtSecret);
      label = String(decoded.astroId || decoded.id || decoded.phone || 'astrowani').slice(0, 40);
    } catch (_) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
      res.json({ success: true, ...buildIceServers(label) });
    } catch (err) {
      console.error('[iceServers] build failed:', err.message);
      // Even here, answer with the built-in list rather than an error: the
      // caller asked for relays, and giving them the old ones beats giving none.
      res.json({ success: true, ...buildIceServers() });
    }
  });
}

module.exports = {
  buildIceServers,
  mintTimeLimitedCredential,
  registerIceServerRoutes,
  TURN_TTL_SECONDS,
};
