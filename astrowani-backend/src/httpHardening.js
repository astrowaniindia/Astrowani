// astrowani-backend/src/httpHardening.js
//
// Baseline HTTP protections: security headers, response compression, and CORS.
// Rate limiting was removed at the user's request (2026-08-15) after it started
// rejecting legitimate vendor-registration traffic with 429s. There is currently
// NO protection against OTP-spam / SMS-billing abuse or brute-force retries —
// see git history (src/httpHardening.js prior to this change) if reintroducing
// rate limiting is needed later.

const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

// Behind Nginx on the VPS, req.ip is the proxy unless Express is told to read
// X-Forwarded-For.
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 1);

/**
 * CORS. The apps are native and send no Origin header, so they are unaffected
 * either way — this exists for the admin dashboard and to stop a random web
 * page from driving the API with a victim's browser.
 *
 * Set CORS_ORIGINS to a comma-separated allowlist. Left unset, behaviour is
 * unchanged (open) and a warning is logged, so deploying this cannot break the
 * admin dashboard before someone has had a chance to configure it.
 */
function buildCors() {
  const raw = (process.env.CORS_ORIGINS || '').trim();
  if (!raw) {
    console.warn(
      '[startup] CORS_ORIGINS is not set — the API accepts requests from any origin. ' +
      'Set it to a comma-separated allowlist, e.g. ' +
      'CORS_ORIGINS=https://backend.astrowani.com,https://admin.astrowani.com',
    );
    return cors();
  }
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  console.log(`[startup] CORS allowlist: ${allowed.join(', ')}`);
  return cors({
    origin(origin, cb) {
      // No Origin = a native app or a server-to-server call, not a browser.
      if (!origin) return cb(null, true);
      return cb(null, allowed.includes(origin));
    },
    credentials: true,
  });
}

/**
 * Apply the global middleware. Call BEFORE any route is registered.
 */
function applyHttpHardening(app) {
  app.set('trust proxy', TRUST_PROXY_HOPS);

  app.use(helmet({
    // The backend serves the admin dashboard's built assets from /admin, and a
    // default CSP would block its inline bundle. Headers that matter for a JSON
    // API (nosniff, frameguard, referrer policy, HSTS) are all still applied.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Astrologer lists and report payloads are highly compressible JSON; this is
  // the cheapest bandwidth win available, and matters most on Indian mobile data.
  app.use(compression());

  app.use(buildCors());
}

module.exports = {
  applyHttpHardening,
};
