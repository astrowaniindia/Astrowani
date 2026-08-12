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
const { TtlCache } = require('./ttlCache');

const POSTHOG_HOST = process.env.POSTHOG_HOST; // e.g. https://us.i.posthog.com
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

function isConfigured() {
  return !!(POSTHOG_HOST && POSTHOG_PROJECT_ID && POSTHOG_PERSONAL_API_KEY);
}

// TTL cache so a 30-60s dashboard auto-refresh doesn't re-hit PostHog's Query
// API on every poll — using the shared TtlCache (src/ttlCache.js) rather than
// a hand-rolled Map so concurrent identical queries (e.g. two admins with the
// Analytics page open at once) single-flight onto one PostHog call instead of
// each issuing their own during a cache-miss window.
const queryCache = new TtlCache({ ttlMs: 60 * 1000, maxEntries: 200 });

async function runHogQL(hogql) {
  return queryCache.get(hogql, async () => {
    const { data } = await axios.post(
      `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
      { query: { kind: 'HogQLQuery', query: hogql } },
      { headers: { Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}` }, timeout: 15000 }
    );
    return data.results || [];
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Every card on the Analytics page shares ONE date-range control (preset buttons +
// custom From/To) instead of each card having its own — this is the single place that
// resolves whatever the frontend sent into a HogQL WHERE clause. `from`/`to` (both
// YYYY-MM-DD, inclusive) take priority; `days` is kept working as a fallback for any
// caller that hasn't been updated (e.g. a stale cached frontend build) rather than
// breaking it outright.
function resolveDateWhere(req, { defaultDays = 7, maxDays = 180 } = {}) {
  const { from, to } = req.query;
  if (ISO_DATE.test(from || '') && ISO_DATE.test(to || '')) {
    return `toDate(timestamp) >= toDate('${from}') AND toDate(timestamp) <= toDate('${to}')`;
  }
  const days = clampDays(req.query.days, defaultDays, maxDays);
  return `timestamp >= now() - INTERVAL ${days} DAY`;
}

function clampDays(raw, fallback, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
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
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT
        count() AS views,
        count(DISTINCT person_id) AS uniques,
        count(DISTINCT if(timestamp >= now() - INTERVAL 1 DAY, person_id, NULL)) AS dau,
        count(DISTINCT if(timestamp >= now() - INTERVAL 7 DAY, person_id, NULL)) AS wau,
        count(DISTINCT if(timestamp >= now() - INTERVAL 30 DAY, person_id, NULL)) AS mau
      FROM events
      WHERE event = '$screen' AND ${ENV_FILTER} AND ${dateWhere}
    `);
    const [views, uniques, dau, wau, mau] = rows[0] || [0, 0, 0, 0, 0];
    return res.json({
      success: true,
      views: Number(views) || 0,
      uniques: Number(uniques) || 0,
      dau: Number(dau) || 0,
      wau: Number(wau) || 0,
      mau: Number(mau) || 0,
    });
  }));

  // ── Daily screen-view trend, split by app, for a line chart ──
  app.get('/api/admin/analytics/trend', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 30 });
    const rows = await runHogQL(`
      SELECT toDate(timestamp) AS day, properties.app AS app, count() AS views
      FROM events
      WHERE event = '$screen' AND ${ENV_FILTER} AND ${dateWhere}
      GROUP BY day, app
      ORDER BY day ASC
    `);
    const points = rows.map(([day, appName, views]) => ({
      day: String(day),
      app: appName || 'unknown',
      views: Number(views) || 0,
    }));
    return res.json({ success: true, points });
  }));

  // ── Top screens by view count, for one app, over the period ──
  app.get('/api/admin/analytics/top-screens', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const appName = req.query.app === 'vendor' ? 'vendor' : 'customer';
    const rows = await runHogQL(`
      SELECT properties.$screen_name AS screen, count() AS views
      FROM events
      WHERE event = '$screen' AND properties.app = '${appName}' AND ${ENV_FILTER} AND ${dateWhere}
      GROUP BY screen
      ORDER BY views DESC
      LIMIT 20
    `);
    const screens = rows.map(([screen, views]) => ({ screen: screen || '(unknown)', views: Number(views) || 0 }));
    return res.json({ success: true, app: appName, screens });
  }));

  // ── Call/chat funnel: initiated → actually connected ──
  // Customer-only by nature — `call_initiated`/`chat_initiated` only fire on the customer
  // side (the vendor only ever accepts/rejects, never initiates), so there's no equivalent
  // "vendor funnel" to toggle to. "Ended" isn't a useful third stage — doEndCall()/
  // endSessionLocal() fire on every call/chat regardless of whether it connected, so it
  // wouldn't represent further drop-off the way a real funnel stage should. Connected vs
  // not-connected is the real conversion question ("of everyone who tried, how many
  // actually got through").
  app.get('/api/admin/analytics/funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT event, count() AS n
      FROM events
      WHERE event IN ('call_initiated', 'call_connected', 'chat_initiated', 'chat_started')
        AND properties.app = 'customer'
        AND ${ENV_FILTER}
        AND ${dateWhere}
      GROUP BY event
    `);
    const counts = Object.fromEntries(rows.map(([event, n]) => [event, Number(n) || 0]));
    return res.json({
      success: true,
      call: { initiated: counts.call_initiated || 0, connected: counts.call_connected || 0 },
      chat: { initiated: counts.chat_initiated || 0, connected: counts.chat_started || 0 },
    });
  }));

  // ── Signup / Login funnels — where new customers actually drop off ──
  // Deliberately a SMALL, curated set of named events (not "track every tap") — each
  // stage below is a real decision point in the flow, not decorative. `_tapped` events
  // fire on the tap itself (so a dead/fake button — see the 2026-08-10 signup bug where
  // the photo picker did nothing — shows up as a real stage with a real count instead of
  // being invisible); every other event fires on a confirmed outcome (an OTP actually
  // sent, actually verified), matching the existing call_initiated/chat_initiated
  // convention above rather than inventing a new one.
  const AUTH_FUNNELS = {
    signup: {
      label: 'Signup',
      stages: [
        { key: 'viewed', label: 'Viewed Signup Screen', screenName: 'Register' },
        { key: 'photo_tapped', label: 'Tapped Upload Photo', event: 'signup_photo_tapped' },
        { key: 'submitted', label: 'Tapped Submit', event: 'signup_submit_tapped' },
        { key: 'otp_sent', label: 'OTP Sent', event: 'signup_otp_sent' },
        { key: 'otp_verified', label: 'OTP Verified', event: 'signup_otp_verified' },
        { key: 'completed', label: 'Account Created', event: 'signup_completed' },
      ],
    },
    login: {
      label: 'Login',
      stages: [
        { key: 'viewed', label: 'Viewed Login Screen', screenName: 'Login' },
        { key: 'submitted', label: 'Tapped Get OTP', event: 'login_submit_tapped' },
        { key: 'otp_sent', label: 'OTP Sent', event: 'login_otp_sent' },
        { key: 'completed', label: 'Logged In', event: 'login_completed' },
      ],
    },
  };

  app.get('/api/admin/analytics/auth-funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const type = AUTH_FUNNELS[req.query.type] ? req.query.type : 'signup';
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const def = AUTH_FUNNELS[type];

    const selects = def.stages.map((s) => s.screenName
      ? `count(DISTINCT if(event = '$screen' AND properties.$screen_name = '${s.screenName}', person_id, NULL)) AS ${s.key}`
      : `count(DISTINCT if(event = '${s.event}', person_id, NULL)) AS ${s.key}`
    ).join(',\n        ');
    const eventList = def.stages.map((s) => `'${s.event || '$screen'}'`).join(', ');

    const rows = await runHogQL(`
      SELECT
        ${selects}
      FROM events
      WHERE properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
        AND event IN (${eventList})
    `);
    const values = rows[0] || def.stages.map(() => 0);
    const stages = def.stages.map((s, i) => ({ key: s.key, label: s.label, count: Number(values[i]) || 0 }));
    return res.json({ success: true, type, label: def.label, stages });
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

  // ── Home screen interaction breakdown (customer app) ──
  // Every tappable thing on Home.js EXCEPT per-astrologer cards (search, banners,
  // category tiles, free-service/astro-report cards, blog cards, review cards, the
  // "View All" links, the fixed Chat/Call bar) fires `captureEvent('home_screen_click',
  // {section, label})` — see astrowani_customer-main/src/screens/Home/Home.js.
  // Banner taps fire a separate `banner_click` event from the shared PlacementBanner
  // component (it's reused on non-Home screens too), so this query UNIONs in only the
  // two home_* placements rather than reading home_screen_click alone.
  app.get('/api/admin/analytics/home-interactions', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT section, count() AS n FROM (
        SELECT properties.section AS section
        FROM events
        WHERE event = 'home_screen_click' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
        UNION ALL
        SELECT 'banner' AS section
        FROM events
        WHERE event = 'banner_click' AND properties.app = 'customer'
          AND properties.placement IN ('home_primary', 'home_secondary')
          AND ${ENV_FILTER} AND ${dateWhere}
      )
      GROUP BY section
      ORDER BY n DESC
      LIMIT 30
    `);
    const sections = rows.map(([section, n]) => ({ section: section || '(unknown)', count: Number(n) || 0 }));
    return res.json({ success: true, sections });
  }));

  // ── Where people go after Home (and how often Home is the last screen of a session) ──
  // Uses the existing $screen autocapture stream — no new client instrumentation needed.
  // For every session, `leadInFrame` looks at the very next $screen event after each row;
  // ClickHouse returns NULL there when a row is the last event in its partition (session),
  // which is exactly "nothing came after this — the session ended on this screen."
  app.get('/api/admin/analytics/home-flow', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      WITH ordered AS (
        SELECT
          properties.$screen_name AS screen,
          leadInFrame(properties.$screen_name) OVER (PARTITION BY properties.$session_id ORDER BY timestamp) AS next_screen
        FROM events
        WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
      )
      SELECT next_screen, count() AS n
      FROM ordered
      WHERE screen = 'Home'
      GROUP BY next_screen
      ORDER BY n DESC
      LIMIT 20
    `);
    let totalHomeViews = 0;
    let exitedFromHome = 0;
    const nextScreens = [];
    for (const [nextScreen, n] of rows) {
      const count = Number(n) || 0;
      totalHomeViews += count;
      if (nextScreen === null) exitedFromHome = count;
      else nextScreens.push({ screen: nextScreen, count });
    }
    return res.json({
      success: true,
      totalHomeViews,
      exitedFromHome,
      exitRatePercent: totalHomeViews > 0 ? Math.round((exitedFromHome / totalHomeViews) * 1000) / 10 : 0,
      nextScreens,
    });
  }));

  console.log(isConfigured()
    ? '[postHogRoutes] Analytics routes registered under /api/admin/analytics'
    : '[postHogRoutes] Analytics routes registered but POSTHOG_* env vars are unset — will 503 until configured');
};
