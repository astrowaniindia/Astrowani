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
  // ── Summary stat cards ──
  // Two separate queries on purpose. Views/uniques belong to the page's date range;
  // DAU/WAU/MAU emphatically do NOT — they are fixed 1/7/30-day windows by
  // definition. Computing them inside the range-filtered query (as this used to)
  // silently intersected the two, so with the page's default "This Week" range the
  // "MAU" card actually showed a 7-day number and all three cards converged on the
  // same value for short ranges. A metric whose label promises 30 days must never be
  // capped by an unrelated control.
  //
  // Both are also scoped to ONE app now. Astrologers keep the vendor app open all
  // day, so counting them alongside customers inflated the headline number that
  // reads as customer demand — while every other card on the page was app-scoped.
  app.get('/api/admin/analytics/summary', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const appName = req.query.app === 'vendor' ? 'vendor' : 'customer';
    const scope = `event = '$screen' AND properties.app = '${appName}' AND ${ENV_FILTER}`;

    const [rangeRows, activeRows] = await Promise.all([
      runHogQL(`
        SELECT count() AS views, count(DISTINCT person_id) AS uniques
        FROM events
        WHERE ${scope} AND ${dateWhere}
      `),
      runHogQL(`
        SELECT
          count(DISTINCT if(timestamp >= now() - INTERVAL 1 DAY, person_id, NULL)) AS dau,
          count(DISTINCT if(timestamp >= now() - INTERVAL 7 DAY, person_id, NULL)) AS wau,
          count(DISTINCT if(timestamp >= now() - INTERVAL 30 DAY, person_id, NULL)) AS mau
        FROM events
        WHERE ${scope} AND timestamp >= now() - INTERVAL 30 DAY
      `),
    ]);

    const [views, uniques] = rangeRows[0] || [0, 0];
    const [dau, wau, mau] = activeRows[0] || [0, 0, 0];
    return res.json({
      success: true,
      app: appName,
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
      // Counted as ATTEMPTS, not people — the question here is "of every call tried,
      // how many connected", and one person trying five times is five attempts. The
      // remedies funnel counts distinct persons instead (a drop-off question), so the
      // basis is reported explicitly rather than left for a reader to assume.
      basis: 'attempts',
      call: { initiated: counts.call_initiated || 0, connected: counts.call_connected || 0 },
      chat: { initiated: counts.chat_initiated || 0, connected: counts.chat_started || 0 },
    });
  }));

  // ── Remedies commerce funnel — add to cart → cart → checkout → pay → order ──
  //
  // This card used to query remedy_buy_now_clicked / remedy_place_order_clicked /
  // remedy_order_placed. Those events no longer exist ANYWHERE in either app: the
  // cart rewrite (CLAUDE.md subsystem Y) deleted the old Place Order modal and
  // replaced them, and this query was never updated — so the card rendered 0 → 0 → 0
  // permanently, which reads as "nobody is buying" rather than "this card is broken."
  // That is the worst class of analytics bug: a wrong number that looks like a finding.
  //
  // Rewired to the five events the cart flow actually fires. Counted as DISTINCT
  // PERSONS per stage, not raw events, because this is a drop-off question — one
  // person adding four items to their cart is one person who reached "add to cart",
  // not four. (The call/chat funnel above counts attempts instead, and says so; the
  // response labels which basis each funnel uses so the two are never read as
  // comparable.)
  app.get('/api/admin/analytics/remedies-funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT
        count(DISTINCT if(event = 'add_to_cart', person_id, NULL)) AS added,
        count(DISTINCT if(event = 'cart_viewed', person_id, NULL)) AS viewedCart,
        count(DISTINCT if(event = 'checkout_started', person_id, NULL)) AS checkoutStarted,
        count(DISTINCT if(event = 'payment_method_selected', person_id, NULL)) AS paymentSelected,
        count(DISTINCT if(event = 'order_placed', person_id, NULL)) AS orderPlaced,
        count(DISTINCT if(event = 'order_payment_failed', person_id, NULL)) AS paymentFailed,
        count(DISTINCT if(event = 'remedy_blocked_category_tapped', person_id, NULL)) AS blockedTapped
      FROM events
      WHERE event IN ('add_to_cart', 'cart_viewed', 'checkout_started', 'payment_method_selected',
                      'order_placed', 'order_payment_failed', 'remedy_blocked_category_tapped')
        AND properties.app = 'customer'
        AND ${ENV_FILTER}
        AND ${dateWhere}
    `);
    const [added, viewedCart, checkoutStarted, paymentSelected, orderPlaced, paymentFailed, blockedTapped] =
      rows[0] || [0, 0, 0, 0, 0, 0, 0];
    return res.json({
      success: true,
      basis: 'persons',
      stages: [
        { key: 'added', label: 'Added to cart', count: Number(added) || 0 },
        { key: 'viewedCart', label: 'Opened cart', count: Number(viewedCart) || 0 },
        { key: 'checkoutStarted', label: 'Started checkout', count: Number(checkoutStarted) || 0 },
        { key: 'paymentSelected', label: 'Chose payment', count: Number(paymentSelected) || 0 },
        { key: 'orderPlaced', label: 'Order placed', count: Number(orderPlaced) || 0 },
      ],
      paymentFailed: Number(paymentFailed) || 0,
      // People tapping a category you aren't delivering yet — i.e. measured demand
      // for switching a remedy_orders_enabled_<type> flag on.
      blockedCategoryTapped: Number(blockedTapped) || 0,
    });
  }));

  // ── Why signups and logins fail ─────────────────────────────────────────────
  // The auth funnels show WHERE people drop out. signup_failed / login_failed have
  // been carrying a `reason` property all along (no_account, account_exists,
  // otp_send_failed, otp_verify_rejected, …) and nothing ever read them, so the
  // dashboard could show a cliff in the funnel without the one detail that says what
  // to actually go fix.
  app.get('/api/admin/analytics/auth-failures', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT event, properties.reason AS reason, count() AS n
      FROM events
      WHERE event IN ('signup_failed', 'login_failed')
        AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
      GROUP BY event, reason
      ORDER BY n DESC
      LIMIT 40
    `);
    const signup = [];
    const login = [];
    for (const [event, reason, n] of rows) {
      const entry = { reason: reason || '(unspecified)', count: Number(n) || 0 };
      (event === 'signup_failed' ? signup : login).push(entry);
    }
    return res.json({ success: true, signup, login });
  }));

  // ── Why a call/chat never even got requested ────────────────────────────────
  // request-outcomes (adminRoutes.js) covers attempts that became a row in
  // call_requests/chat_requests. This covers the ones that never got that far: the
  // wallet check failed, the astrologer was busy, or the service toggle was off — so
  // no request row exists and Postgres has no record of it at all. The low-balance
  // case in particular is a direct revenue leak that was previously invisible
  // everywhere.
  app.get('/api/admin/analytics/blocked-attempts', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT properties.reason AS reason, properties.intent AS intent, count() AS n
      FROM events
      WHERE event = 'consult_blocked' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
      GROUP BY reason, intent
      ORDER BY n DESC
      LIMIT 40
    `);
    const byReason = new Map();
    let total = 0;
    for (const [reason, intent, n] of rows) {
      const count = Number(n) || 0;
      total += count;
      const key = reason || '(unspecified)';
      if (!byReason.has(key)) byReason.set(key, { reason: key, count: 0, byIntent: {} });
      const entry = byReason.get(key);
      entry.count += count;
      entry.byIntent[intent || 'unknown'] = (entry.byIntent[intent || 'unknown'] || 0) + count;
    }
    return res.json({
      success: true,
      total,
      reasons: [...byReason.values()].sort((a, b) => b.count - a.count),
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
      ? `count(DISTINCT if((event = '$screen' AND properties.$screen_name = '${s.screenName}') OR event = '${s.screenName === 'Register' ? 'signup_screen_viewed' : 'login_screen_viewed'}', person_id, NULL)) AS ${s.key}`
      : `count(DISTINCT if(event = '${s.event}', person_id, NULL)) AS ${s.key}`
    ).join(',\n        ');
    const eventList = [
      ...def.stages.map((s) => `'${s.event || '$screen'}'`),
      "'signup_screen_viewed'",
      "'login_screen_viewed'",
    ].join(', ');

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

  // ── Retention: D1 / D7 / D30, both blended and as a per-cohort curve ──
  //
  // "Of everyone whose FIRST screen view fell on day X, what fraction came back on
  // day X+N." A cohort is only counted once it has had time to reach the mark (a D7
  // number for a cohort that started yesterday is not 0% retention, it is unknown),
  // which is what the `day0 <= today() - N` bound enforces.
  //
  // This used to return ONE blended average per interval. That shows the level but
  // never the trend — and the trend is the only thing retention is actually used for,
  // since "is our retention improving" is unanswerable from a single pooled number.
  // Now returns both: the blended figure for the stat cards, plus one row per cohort
  // day so the admin can plot the curve. D30 added — the interval that actually
  // indicates a habit rather than a second visit.
  app.get('/api/admin/analytics/retention', requireAdmin, requireConfigured, h(async (req, res) => {
    const days = clampDays(req.query.days, 30, 90);
    const INTERVALS = [1, 7, 30];

    // One query, all three intervals, grouped by cohort day. `first_seen` and
    // `active_days` are the same CTEs as before; the difference is GROUP BY day0 and
    // a conditional aggregate per interval, so this is no more expensive than the
    // two queries it replaces.
    const rows = await runHogQL(`
      WITH first_seen AS (
        SELECT person_id, min(toDate(timestamp)) AS day0
        FROM events WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER}
        GROUP BY person_id
      ),
      active_days AS (
        SELECT DISTINCT person_id, toDate(timestamp) AS active_day
        FROM events WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER}
      )
      SELECT
        f.day0 AS cohort_day,
        count(DISTINCT f.person_id) AS cohort_size,
        count(DISTINCT if(a.active_day = f.day0 + 1, a.person_id, NULL)) AS d1,
        count(DISTINCT if(a.active_day = f.day0 + 7, a.person_id, NULL)) AS d7,
        count(DISTINCT if(a.active_day = f.day0 + 30, a.person_id, NULL)) AS d30
      FROM first_seen f
      LEFT JOIN active_days a ON a.person_id = f.person_id
      WHERE f.day0 >= today() - ${days} AND f.day0 <= today() - 1
      GROUP BY cohort_day
      ORDER BY cohort_day ASC
    `);

    const cohorts = rows.map(([cohortDay, size, d1, d7, d30]) => ({
      day: String(cohortDay),
      cohortSize: Number(size) || 0,
      d1: Number(d1) || 0,
      d7: Number(d7) || 0,
      d30: Number(d30) || 0,
    }));

    // Blended totals, each excluding cohorts too young to have reached that mark —
    // otherwise a fresh cohort's unavoidable 0 would drag the average down and look
    // like a regression.
    const todayMs = Date.now();
    const ageInDays = (iso) => Math.floor((todayMs - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
    const blended = {};
    for (const n of INTERVALS) {
      const eligible = cohorts.filter((c) => ageInDays(c.day) >= n);
      const cohortSize = eligible.reduce((s, c) => s + c.cohortSize, 0);
      const returned = eligible.reduce((s, c) => s + c[`d${n}`], 0);
      blended[`d${n}`] = {
        cohortSize,
        returned,
        percent: cohortSize > 0 ? Math.round((returned / cohortSize) * 1000) / 10 : 0,
        cohortsCounted: eligible.length,
      };
    }

    return res.json({
      success: true,
      days,
      ...blended,          // d1 / d7 / d30 — shape kept compatible with the old cards
      cohorts,             // per-day curve
    });
  }));

  // ── Home screen interaction breakdown (customer app) ──
  // Every tappable thing on Home.js (search, banners, category tiles, astrologer
  // cards in all three astrologer sections, free-service/astro-report cards, blog
  // cards, review cards, the "View All" links, the fixed Chat/Call bar) fires
  // `captureEvent('home_screen_click', {section, label})` — see
  // astrowani_customer-main/src/screens/Home/Home.js and AnimatedAstrologerMarquee.js.
  // Per-astrologer cards were deliberately excluded until 2026-08-14; now included as
  // 'astrologer_card' / 'live_astrologer_card' / 'call_astrologer_card' (one section
  // value per astrologer list on Home, so they're distinguishable in the table below) —
  // the actual Call/Chat action buttons on those cards are NOT covered by this event,
  // they fire call_initiated/chat_initiated separately (see the funnel endpoint above).
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

  // ── Free Introductory Call Funnel: Offer Shown → Slots Opened → Slot Picked → Booked → Answered ──
  app.get('/api/admin/analytics/free-call-funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT
        count(DISTINCT if(event = 'free_call_offer_shown', person_id, NULL)) AS shown,
        count(DISTINCT if(event = 'free_call_slots_opened', person_id, NULL)) AS slotsOpened,
        count(DISTINCT if(event IN ('free_call_slot_selected', 'free_call_slot_picked'), person_id, NULL)) AS slotPicked,
        count(DISTINCT if(event = 'free_call_booked', person_id, NULL)) AS booked,
        count(DISTINCT if(event = 'free_call_answered', person_id, NULL)) AS answered,
        count(DISTINCT if(event = 'free_call_offer_dismissed', person_id, NULL)) AS dismissed,
        count(DISTINCT if(event = 'free_call_booking_failed', person_id, NULL)) AS failed,
        count(DISTINCT if(event = 'free_call_declined', person_id, NULL)) AS declined
      FROM events
      WHERE properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
        AND event IN ('free_call_offer_shown', 'free_call_slots_opened', 'free_call_slot_selected',
                      'free_call_slot_picked', 'free_call_booked', 'free_call_answered',
                      'free_call_offer_dismissed', 'free_call_booking_failed', 'free_call_declined')
    `);
    const [shown, slotsOpened, slotPicked, booked, answered, dismissed, failed, declined] =
      rows[0] || [0, 0, 0, 0, 0, 0, 0, 0];

    // Dismissal breakdown by step
    const dismissRows = await runHogQL(`
      SELECT properties.step AS step, count() AS n
      FROM events
      WHERE event = 'free_call_offer_dismissed' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
      GROUP BY step
      ORDER BY n DESC
    `);
    const dismissBreakdown = dismissRows.map(([step, n]) => ({ step: step || 'unknown', count: Number(n) || 0 }));

    return res.json({
      success: true,
      basis: 'persons',
      stages: [
        { key: 'shown', label: 'Offer Shown', count: Number(shown) || 0 },
        { key: 'slotsOpened', label: 'Opened Slots', count: Number(slotsOpened) || 0 },
        { key: 'slotPicked', label: 'Selected Slot', count: Number(slotPicked) || 0 },
        { key: 'booked', label: 'Booked Free Call', count: Number(booked) || 0 },
        { key: 'answered', label: 'Call Answered', count: Number(answered) || 0 },
      ],
      dismissed: Number(dismissed) || 0,
      failed: Number(failed) || 0,
      declined: Number(declined) || 0,
      dismissBreakdown,
    });
  }));

  // ── Astrology Services & Free Tools Engagement Breakdown ──
  app.get('/api/admin/analytics/services-engagement', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT
        count(DISTINCT if(event = 'horoscope_sign_selected' OR event = 'horoscope_details_opened', person_id, NULL)) AS horoscope,
        count(DISTINCT if(event = 'free_service_submitted' AND properties.service = 'janam_kundali', person_id, NULL)) AS kundali,
        count(DISTINCT if(event = 'free_service_submitted' AND properties.service = 'kundali_match', person_id, NULL)) AS kundaliMatch,
        count(DISTINCT if(event = 'panchang_viewed', person_id, NULL)) AS panchang,
        count(DISTINCT if(event = 'astro_report_submitted' OR event = 'astro_report_generated', person_id, NULL)) AS astroReports,
        count(DISTINCT if(event = 'live_join_tapped' OR event = 'live_stream_connected' OR event = 'live_viewer_joined', person_id, NULL)) AS liveStreams,
        count(DISTINCT if(event = 'live_aarti_youtube_opened', person_id, NULL)) AS liveAarti,
        count(DISTINCT if(event = 'wallet_viewed', person_id, NULL)) AS walletViews
      FROM events
      WHERE properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
        AND event IN ('horoscope_sign_selected', 'horoscope_details_opened', 'free_service_submitted',
                      'panchang_viewed', 'astro_report_submitted', 'astro_report_generated',
                      'live_join_tapped', 'live_stream_connected', 'live_viewer_joined',
                      'live_aarti_youtube_opened', 'wallet_viewed')
    `);
    const [horoscope, kundali, kundaliMatch, panchang, astroReports, liveStreams, liveAarti, walletViews] =
      rows[0] || [0, 0, 0, 0, 0, 0, 0, 0];

    return res.json({
      success: true,
      services: [
        { key: 'horoscope', label: 'Daily Horoscope', users: Number(horoscope) || 0, icon: '♈' },
        { key: 'kundali', label: 'Janam Kundali', users: Number(kundali) || 0, icon: '📜' },
        { key: 'kundaliMatch', label: 'Kundali Matching', users: Number(kundaliMatch) || 0, icon: '💍' },
        { key: 'panchang', label: 'Daily Panchang', users: Number(panchang) || 0, icon: '📅' },
        { key: 'astroReports', label: 'Astro Reports', users: Number(astroReports) || 0, icon: '🔮' },
        { key: 'liveStreams', label: 'Live Video Streams', users: Number(liveStreams) || 0, icon: '📹' },
        { key: 'liveAarti', label: 'Live Aarti & Pooja', users: Number(liveAarti) || 0, icon: '🪔' },
        { key: 'walletViews', label: 'Wallet Screen Views', users: Number(walletViews) || 0, icon: '👛' },
      ].sort((a, b) => b.users - a.users),
    });
  }));

  // ── Wallet Recharge Funnel: viewed → selected amount → started payment → recharged ──
  app.get('/api/admin/analytics/wallet-funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const rows = await runHogQL(`
      SELECT
        count(DISTINCT if(event = 'wallet_viewed', person_id, NULL)) AS viewed,
        count(DISTINCT if(event = 'recharge_amount_selected', person_id, NULL)) AS selected,
        count(DISTINCT if(event = 'recharge_started', person_id, NULL)) AS started,
        count(DISTINCT if(event = 'wallet_recharged', person_id, NULL)) AS recharged,
        count(DISTINCT if(event = 'recharge_failed', person_id, NULL)) AS failed
      FROM events
      WHERE properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
        AND event IN ('wallet_viewed', 'recharge_amount_selected', 'recharge_started', 'wallet_recharged', 'recharge_failed')
    `);
    const [viewed, selected, started, recharged, failed] = rows[0] || [0, 0, 0, 0, 0];

    const failureRows = await runHogQL(`
      SELECT properties.reason AS reason, count() AS n
      FROM events
      WHERE event = 'recharge_failed' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
      GROUP BY reason
      ORDER BY n DESC
      LIMIT 10
    `);
    const failures = failureRows.map(([reason, n]) => ({
      reason: reason || '(unspecified)',
      count: Number(n) || 0,
    }));

    return res.json({
      success: true,
      basis: 'persons',
      stages: [
        { key: 'viewed', label: 'Opened Wallet', count: Number(viewed) || 0 },
        { key: 'selected', label: 'Selected Amount', count: Number(selected) || 0 },
        { key: 'started', label: 'Initiated Payment', count: Number(started) || 0 },
        { key: 'recharged', label: 'Recharged Successfully', count: Number(recharged) || 0 },
      ],
      failed: Number(failed) || 0,
      failures,
    });
  }));

  console.log(isConfigured()
    ? '[postHogRoutes] Analytics routes registered under /api/admin/analytics'
    : '[postHogRoutes] Analytics routes registered but POSTHOG_* env vars are unset — will 503 until configured');
};
