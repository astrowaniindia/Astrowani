// astrowani-backend/src/httpHardening.js
//
// Baseline HTTP protections. None of these existed: no rate limiting anywhere,
// no security headers, no response compression, and cors() wide open to every
// origin on the internet.
//
// The rate limiting is the urgent one, and specifically on OTP. /api/send-otp
// causes a real SMS to be sent through EnableX, billed per message. With no
// limit, a script hitting that endpoint in a loop is a direct, uncapped charge
// to the business — the cheapest possible attack and the most expensive to
// absorb. Everything else here is hygiene.
//
// Limits are per-IP and deliberately generous: the goal is to stop scripts and
// runaway retry loops, not to inconvenience a real user on a flaky train
// connection who taps resend a few times.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

// Behind Nginx on the VPS, req.ip is the proxy unless Express is told to read
// X-Forwarded-For. Without this every user shares one bucket and the limiter
// throttles everybody at once.
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 1);

const jsonLimitHandler = (req, res) =>
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please wait a moment and try again.',
  });

// OTP: the money one. Six sends per 15 minutes per IP is far above any honest
// usage (a real user needs one, maybe two) and far below what makes an SMS
// flood worth attempting.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    success: false,
    message: 'Too many OTP requests. Please wait 15 minutes before trying again.',
  }),
});

// OTP, keyed by phone number instead of IP. otpLimiter above stops one IP from
// hammering many numbers, but does nothing to stop an attacker rotating across a
// handful of IPs to flood ONE number with repeated OTP texts — each individual IP
// stays under the per-IP limit while the victim's phone keeps buzzing. Observed in
// production 2026-08-14: OTP requests for the same number from 4 different IPs
// over several days, none of which ever tripped otpLimiter. This closes that gap
// by capping how many OTPs a single phone number can receive regardless of source.
const otpPhoneLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const digits = String(req.body?.phoneNumber || '').replace(/\D/g, '');
    if (digits) return digits;
    // No phone number yet — the route's own validation rejects the request right
    // after; fall back to IP so this middleware never throws on a malformed body.
    // Must go through ipKeyGenerator (not raw req.ip) — express-rate-limit refuses
    // to start otherwise, since an un-normalized IPv6 address is too fine-grained
    // to rate-limit meaningfully (see ERR_ERL_KEY_GEN_IPV6).
    return ipKeyGenerator(req.ip);
  },
  handler: (req, res) => res.status(429).json({
    success: false,
    message: 'Too many OTP requests for this number. Please wait before trying again.',
  }),
});

// Login / verify: slows credential stuffing without locking out a real person
// who fat-fingers the code a few times.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler,
});

// Anything that moves money or creates a session. Well above real usage —
// a customer cannot plausibly start 40 calls in 15 minutes — but it caps the
// damage from a stuck client retrying in a loop.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler,
});

// Everything else. High enough that the apps' normal chatter never notices,
// low enough to blunt a scraper.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler,
  // Socket.io polling and health checks should not consume the budget.
  skip: (req) => req.path.startsWith('/socket.io') || req.path === '/health',
});

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
  otpLimiter,
  otpPhoneLimiter,
  authLimiter,
  writeLimiter,
};
