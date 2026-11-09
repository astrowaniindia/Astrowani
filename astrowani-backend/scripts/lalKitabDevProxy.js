// A local proxy for testing the Lal Kitab assistant on an emulator.
//
// Run:  node --env-file=.env scripts/lalKitabDevProxy.js
//       (optional)  PORT=4610 node --env-file=.env scripts/lalKitabDevProxy.js
//
// WHY THIS EXISTS. The customer app's SOCKET_URL is a hardcoded
// https://backend.astrowani.com (src/config/api.js), and the assistant's routes are
// not deployed there yet. So an emulator build either talks to production and 404s
// on every new route, or talks to something local and loses login, the astrologer
// list and everything else. This serves ONLY the assistant's routes itself and
// forwards every other request to the real backend, so the app behaves normally
// and the new feature is live.
//
// index.js IS NEVER BOOTED. Booting it starts sessionManager's 30-second billing
// worker and the hourly earnings reset against the LIVE production database
// (CLAUDE.md standing rules, and the local-backend-bills-production memory). This
// is a bare Express app that mounts one route module.
//
// IT IS A TEST TOOL AND NOTHING ELSE. It must never be deployed, never be used by
// a customer, and never be left running. It holds a production service-role key in
// memory and will happily forward anything.

const express = require('express');

// Node 20 has no global WebSocket, which @supabase/realtime-js needs at import.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* fails loudly below */ }
}

const UPSTREAM = 'https://backend.astrowani.com';
const PORT = Number(process.env.PORT || 4610);

// Only these are served locally. Everything else is forwarded, so nothing that
// already works can be broken by this file.
const LOCAL_PREFIX = '/api/lal-kitab/';
const LOCAL_ADMIN = '/api/admin/lal-kitab-assistant';

const app = express();
// A photo in a chat is base64, so the real server allows a large body; match it.
app.use(express.json({ limit: '12mb' }));

// A one-line log of every request, because the whole point of running this is to
// see whether the app is reaching the new routes at all.
app.use((req, _res, next) => {
  const local = req.path.startsWith(LOCAL_PREFIX) || req.path === LOCAL_ADMIN;
  console.log(`${new Date().toISOString().slice(11, 19)}  ${local ? 'LOCAL ' : 'proxy '} ${req.method} ${req.path}`);
  next();
});

/**
 * TOKEN EXCHANGE, and this is the part that makes the whole tool work.
 *
 * The app holds a JWT signed by PRODUCTION. This process verifies with the local
 * .env JWT_SECRET, and the two are NOT the same value (scripts/jwtSecretParity.js
 * proves it in one request). So the assistant's routes answered 401 to every real
 * app token — and the customer app treats a 401 as a session expiry and logs the
 * person out, which is what it did on the emulator: a correct feature looking like
 * a broken one.
 *
 * Rather than putting the production secret on this machine, PRODUCTION IS ASKED
 * WHO THE CALLER IS. The app's own Authorization header is forwarded to
 * GET /api/users/profile upstream; if that answers 200, the token is genuine and
 * the response says whose it is. A short-lived token is then minted with the LOCAL
 * secret and swapped in, so the module's ordinary auth runs unchanged.
 *
 * The exchange is cached per token so a conversation costs one upstream call, not
 * one per turn. It is a TEST TOOL: production remains the only authority on who a
 * token belongs to, and nothing here weakens the real routes.
 */
const exchangeCache = new Map(); // app token -> { local, at }
const EXCHANGE_TTL_MS = 10 * 60 * 1000;

app.use(async (req, res, next) => {
  if (!req.path.startsWith(LOCAL_PREFIX)) return next();
  const auth = req.headers.authorization;
  if (!auth) return next(); // let the route answer 401 itself

  const appToken = String(auth).replace('Bearer ', '');
  const hit = exchangeCache.get(appToken);
  if (hit && Date.now() - hit.at < EXCHANGE_TTL_MS) {
    req.headers.authorization = 'Bearer ' + hit.local;
    return next();
  }

  try {
    const r = await fetch(UPSTREAM + '/api/users/profile', { headers: { Authorization: auth } });
    if (!r.ok) {
      console.log(`  token exchange: upstream said ${r.status} - leaving the token alone`);
      return next();
    }
    const body = await r.json();
    const p = (body && (body.profile || body.data || body.user)) || body || {};
    const phone = p.mobile || p.phone || p.mobile_number;
    const userId = p.id || p._id || p.userId || p.customer_id;
    if (!phone && !userId) {
      console.log('  token exchange: upstream 200 but no identity in the body - leaving the token alone');
      return next();
    }
    const jwtLib = require('jsonwebtoken');
    const local = jwtLib.sign({ phone, userId }, process.env.JWT_SECRET, { expiresIn: '2h' });
    exchangeCache.set(appToken, { local, at: Date.now() });
    req.headers.authorization = 'Bearer ' + local;
    console.log('  token exchange: production vouched for this token, re-signed locally');
  } catch (e) {
    console.log('  token exchange failed: ' + (e && e.message));
  }
  return next();
});

// The assistant's own routes. requireAdmin is stubbed: this is a local test tool
// and the admin dashboard is not what it is for.
require('../src/lalKitabAssistant')(app, {
  requireAdmin: (req, res, next) => next(),
});

// Everything else -> the real backend, headers and body passed through.
app.use(async (req, res) => {
  const url = UPSTREAM + req.originalUrl;
  try {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      // host must not be forwarded (it would name this machine), and the hop-by-hop
      // ones are meaningless upstream.
      if (['host', 'connection', 'content-length', 'accept-encoding'].includes(k)) continue;
      headers[k] = v;
    }
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const r = await fetch(url, {
      method: req.method,
      headers: { ...headers, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
      body: hasBody && req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : undefined,
    });
    const text = await r.text();
    res.status(r.status);
    const ct = r.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.send(text);
  } catch (e) {
    console.log('  proxy error: ' + (e && e.message));
    res.status(502).json({ success: false, message: 'dev proxy could not reach the backend' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nLal Kitab dev proxy on http://0.0.0.0:${PORT}`);
  console.log(`  serving locally : ${LOCAL_PREFIX}*  and  ${LOCAL_ADMIN}`);
  console.log(`  forwarding      : everything else -> ${UPSTREAM}`);
  console.log('\nPoint the app at it. From an Android emulator the host is 10.0.2.2:');
  console.log(`  src/config/api.js  ->  export const SOCKET_URL = 'http://10.0.2.2:${PORT}';`);
  console.log('REVERT that line when you are done - it must never be committed.\n');
});
