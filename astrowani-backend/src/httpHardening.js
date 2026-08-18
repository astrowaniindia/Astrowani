// astrowani-backend/src/httpHardening.js
//
// Baseline HTTP protections: security headers, response compression, CORS, and
// a deliberately loose per-IP flood backstop.
//
// HISTORY — READ BEFORE TIGHTENING ANY LIMIT HERE. The original version of this
// file capped OTP sends at 6 per 15 minutes PER IP. That rejected legitimate
// vendor signups in production with 429s (2026-08-15) and the limiting was
// removed wholesale. The value was not really the problem; the DIMENSION was.
// Indian mobile carriers use CGNAT, so thousands of unrelated subscribers share
// one public IP address. Any per-IP budget is therefore spent by strangers, and
// the users who get rejected are whoever happens to arrive last — which looks
// exactly like a random, unreproducible signup failure.
//
// So the real OTP controls now live in index.js, keyed to the phone number and
// to the code itself, where abuse actually happens:
//   - per-number send cooldown + hourly send cap  (stops flooding one number)
//   - per-code failed-attempt cap                 (stops brute force)
//   - global hourly send cap                      (stops spray across numbers)
// What remains here is only a coarse backstop against a single host hammering
// the API, set high enough that a shared carrier NAT will never reach it.

const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

const jsonLimitHandler = (req, res) =>
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please wait a moment and try again.',
  });

// Requests per IP per minute. Override with RATE_LIMIT_PER_MIN.
//
// RAISED 240 -> 6000 on 2026-08-18. The 240 contradicted the reasoning in the
// header above: it is NOT "high enough that a shared carrier NAT will never
// reach it". The budget is spent by every subscriber behind that NAT together,
// and one app launch is not one request — it fans out to astrologers, banners,
// blogs, thoughts and categories. A few dozen unrelated people on the same Jio
// or Airtel egress IP opening the app in the same minute could exhaust 240, and
// then EVERY user on that IP gets a 429, including people midway through
// signing up. That is the 2026-08-15 incident this file was written to prevent,
// reintroduced at a different threshold.
//
// 6000/min (100 req/s) is still a real backstop against a single host hammering
// the API, while sitting far above what a shared carrier IP produces for an app
// this size. If legitimate users ever 429, RAISE this — do not lower it and do
// not reach for a per-IP OTP limit, for the reason in the header.
const GENERAL_RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 6000);

// Login and signup are exempt from the IP budget ENTIRELY, not merely given a
// bigger one. Any per-IP threshold is the wrong dimension under CGNAT: pick a
// number low enough to deter a spray and it also rejects a crowd of real users
// arriving at once; pick one high enough for the crowd and it deters nothing.
// So these two endpoints rely on the controls that are keyed to the thing being
// abused, all of which already exist in index.js:
//   - per-number 45s send cooldown        (stops flooding one number)
//   - per-number 25-sends/20min window    (stops sustained abuse of one number)
//   - global hourly send cap              (stops a spray across many numbers)
//   - 5 failed attempts per code          (stops brute force)
// Net effect: no number of simultaneous sign-ups can IP-throttle each other.
const PHONE_THROTTLED_PATHS = new Set([
  '/api/users/mobile-otp-request',
  '/api/users/mobile-otp-verify',
]);

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: GENERAL_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler,
  // Socket.io polling and health checks must not consume the budget, and the
  // auth endpoints are throttled per-number instead (see above).
  skip: (req) =>
    req.path.startsWith('/socket.io') ||
    req.path === '/health' ||
    PHONE_THROTTLED_PATHS.has(req.path),
});

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
  app.use(generalLimiter);
}

module.exports = {
  applyHttpHardening,
};
