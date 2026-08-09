// ─────────────────────────────────────────────────────────────────────────────
// Product-analytics (PostHog) proxy for the admin dashboard.
//
// The admin dashboard (astrowani-admin) never talks to PostHog directly — it
// hits these routes with the normal admin JWT, and this file holds the
// PostHog Personal API Key server-side (read-only, Project+Query scope only).
// Mirrors the least-privilege pattern already used for BUG_AGENT_TOKEN
// (bugAgentRoutes.js) and the Sentry DSN (sentry.js): a narrowly-scoped
// secret, never the admin JWT, and a graceful no-op (not a crash) when the
// env vars aren't configured yet.
//
// Screen views are auto-captured by both RN apps as PostHog's standard
// `$screen` event, with a custom `app` property ('customer' | 'vendor') so
// the two apps can be told apart inside one shared PostHog project.
//
// EVERY query below filters `properties.environment = 'production'` — both
// apps tag every event (screen views + business events) with the
// app_settings.analytics_environment value read at launch ('test' until an
// admin flips it in the toggle on the Analytics page). This means pre-launch
// testing with friends/family standing in as astrologers structurally never
// shows up here — no data deletion needed, and switching back to 'test' later
// (e.g. a QA pass) can't pollute real numbers either.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { requireAdmin } = require('./adminRoutes');

const POSTHOG_HOST = process.env.POSTHOG_HOST; // e.g. https://us.i.posthog.com
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

function isConfigured() {
  return !!(POSTHOG_HOST && POSTHOG_PROJECT_ID && POSTHOG_PERSONAL_API_KEY);
}

// Small in-memory cache so a 30-60s dashboard auto-refresh doesn't re-hit
// PostHog's Query API on every poll. Same TTL-cache shape as astroRoutes.js's
// PDF cache.
const CACHE_TTL_MS = 60 * 1000;
const queryCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of queryCache) if (entry.expires < now) queryCache.delete(key);
}, 5 * 60 * 1000);

async function runHogQL(hogql) {
  const cached = queryCache.get(hogql);
  if (cached && cached.expires > Date.now()) return cached.data;

  const { data } = await axios.post(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
    { query: { kind: 'HogQLQuery', query: hogql } },
    { headers: { Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}` }, timeout: 15000 }
  );
  const rows = data.results || [];
  queryCache.set(hogql, { data: rows, expires: Date.now() + CACHE_TTL_MS });
  return rows;
}

function clampDays(raw, fallback, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

// Named ranges for the funnel's Today/Yesterday/Week/Month selector. Returns a HogQL
// boolean expression for `timestamp`. "Today"/"Yesterday" need calendar-day boundaries,
// not a rolling INTERVAL N DAY window, so this is separate from clampDays above.
function rangeToWhere(range) {
  switch (range) {
    case 'today':
      return `toDate(timestamp) = today()`;
    case 'yesterday':
      return `toDate(timestamp) = today() - 1`;
    case 'month':
      return `timestamp >= now() - INTERVAL 30 DAY`;
    case 'week':
    default:
      return `timestamp >= now() - INTERVAL 7 DAY`;
  }
}

const ENV_FILTER = `properties.environment = 'production'`;

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[postHogRoutes] ${req.method} ${req.path} error:`, err.response?.data || err.message);
  res.status(502).json({ success: false, message: 'PostHog query failed' });
});

function requireConfigured(req, res, next) {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, message: 'Analytics not configured (missing POSTHOG_* env vars)' });
  }
  next();
}

module.exports = function registerPostHogRoutes(app) {
  // ── Summary stat cards: views + unique/DAU/WAU/MAU over the period ──
  app.get('/api/admin/analytics/summary', requireAdmin, requireConfigured, h(async (req, res) => {
    const days = clampDays(req.query.days, 7, 90);
    const rows = await runHogQL(`
      SELECT
        count() AS views,
        count(DISTINCT person_id) AS uniques,
        count(DISTINCT if(timestamp >= now() - INTERVAL 1 DAY, person_id, NULL)) AS dau,
        count(DISTINCT if(timestamp >= now() - INTERVAL 7 DAY, person_id, NULL)) AS wau,
        count(DISTINCT if(timestamp >= now() - INTERVAL 30 DAY, person_id, NULL)) AS mau
      FROM events
      WHERE event = '$screen' AND ${ENV_FILTER} AND timestamp >= now() - INTERVAL ${Math.max(days, 30)} DAY
    `);
    const [views, uniques, dau, wau, mau] = rows[0] || [0, 0, 0, 0, 0];
    return res.json({
      success: true, days,
      views: Number(views) || 0,
      uniques: Number(uniques) || 0,
      dau: Number(dau) || 0,
      wau: Number(wau) || 0,
      mau: Number(mau) || 0,
    });
  }));

  // ── Daily screen-view trend, split by app, for a line chart ──
  app.get('/api/admin/analytics/trend', requireAdmin, requireConfigured, h(async (req, res) => {
    const days = clampDays(req.query.days, 30, 180);
    const rows = await runHogQL(`
      SELECT toDate(timestamp) AS day, properties.app AS app, count() AS views
      FROM events
      WHERE event = '$screen' AND ${ENV_FILTER} AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY day, app
      ORDER BY day ASC
    `);
    const points = rows.map(([day, appName, views]) => ({
      day: String(day),
      app: appName || 'unknown',
      views: Number(views) || 0,
    }));
    return res.json({ success: true, days, points });
  }));

  // ── Top screens by view count, for one app, over the period ──
  app.get('/api/admin/analytics/top-screens', requireAdmin, requireConfigured, h(async (req, res) => {
    const days = clampDays(req.query.days, 7, 90);
    const appName = req.query.app === 'vendor' ? 'vendor' : 'customer';
    const rows = await runHogQL(`
      SELECT properties.$screen_name AS screen, count() AS views
      FROM events
      WHERE event = '$screen' AND properties.app = '${appName}' AND ${ENV_FILTER} AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY screen
      ORDER BY views DESC
      LIMIT 20
    `);
    const screens = rows.map(([screen, views]) => ({ screen: screen || '(unknown)', views: Number(views) || 0 }));
    return res.json({ success: true, days, app: appName, screens });
  }));

  // ── Call/chat funnel: initiated → actually connected ──
  // Customer-only by nature — `call_initiated`/`chat_initiated` only fire on the customer
  // side (the vendor only ever accepts/rejects, never initiates), so there's no equivalent
  // "vendor funnel" to toggle to. "Ended" isn't a useful third stage — doEndCall()/
  // endSessionLocal() fire on every call/chat regardless of whether it connected, so it
  // wouldn't represent further drop-off the way a real funnel stage should. Connected vs
  // not-connected is the real conversion question ("of everyone who tried, how many
  // actually got through").
  //
  // Accepts `range` (today|yesterday|week|month, default week) instead of `days` — the
  // Today/Yesterday buckets need calendar-day boundaries that a rolling day-count can't
  // express.
  app.get('/api/admin/analytics/funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const range = ['today', 'yesterday', 'week', 'month'].includes(req.query.range) ? req.query.range : 'week';
    const rows = await runHogQL(`
      SELECT event, count() AS n
      FROM events
      WHERE event IN ('call_initiated', 'call_connected', 'chat_initiated', 'chat_started')
        AND properties.app = 'customer'
        AND ${ENV_FILTER}
        AND ${rangeToWhere(range)}
      GROUP BY event
    `);
    const counts = Object.fromEntries(rows.map(([event, n]) => [event, Number(n) || 0]));
    return res.json({
      success: true,
      range,
      call: { initiated: counts.call_initiated || 0, connected: counts.call_connected || 0 },
      chat: { initiated: counts.chat_initiated || 0, connected: counts.chat_started || 0 },
    });
  }));

  // ── D1/D7 retention (customer app) ──
  // "Of everyone whose FIRST screen view fell on day X, what fraction came back on
  // day X+1 (D1) / day X+7 (D7)." Verified against real (test-tagged) data before
  // shipping — see git history for the manual HogQL test run. Cohorts are excluded
  // once they haven't had enough time to reach the D1/D7 mark yet (e.g. a D7 cohort
  // needs day0 to be at least 7 days ago), same reasoning as the WHERE clause below.
  app.get('/api/admin/analytics/retention', requireAdmin, requireConfigured, h(async (req, res) => {
    const days = clampDays(req.query.days, 30, 90);
    const [d1Rows, d7Rows] = await Promise.all([
      runHogQL(`
        WITH first_seen AS (
          SELECT person_id, min(toDate(timestamp)) AS day0
          FROM events WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER}
          GROUP BY person_id
        ),
        active_days AS (
          SELECT DISTINCT person_id, toDate(timestamp) AS active_day
          FROM events WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER}
        )
        SELECT count(DISTINCT f.person_id) AS cohort_size, count(DISTINCT a.person_id) AS returned
        FROM first_seen f
        LEFT JOIN active_days a ON a.person_id = f.person_id AND a.active_day = f.day0 + 1
        WHERE f.day0 <= today() - 1 AND f.day0 >= today() - ${days}
      `),
      runHogQL(`
        WITH first_seen AS (
          SELECT person_id, min(toDate(timestamp)) AS day0
          FROM events WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER}
          GROUP BY person_id
        ),
        active_days AS (
          SELECT DISTINCT person_id, toDate(timestamp) AS active_day
          FROM events WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER}
        )
        SELECT count(DISTINCT f.person_id) AS cohort_size, count(DISTINCT a.person_id) AS returned
        FROM first_seen f
        LEFT JOIN active_days a ON a.person_id = f.person_id AND a.active_day = f.day0 + 7
        WHERE f.day0 <= today() - 7 AND f.day0 >= today() - ${days}
      `),
    ]);
    const [d1Cohort, d1Returned] = d1Rows[0] || [0, 0];
    const [d7Cohort, d7Returned] = d7Rows[0] || [0, 0];
    return res.json({
      success: true,
      days,
      d1: { cohortSize: Number(d1Cohort) || 0, returned: Number(d1Returned) || 0 },
      d7: { cohortSize: Number(d7Cohort) || 0, returned: Number(d7Returned) || 0 },
    });
  }));

  console.log(isConfigured()
    ? '[postHogRoutes] Analytics routes registered under /api/admin/analytics'
    : '[postHogRoutes] Analytics routes registered but POSTHOG_* env vars are unset — will 503 until configured');
};
