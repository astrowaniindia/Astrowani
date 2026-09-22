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
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminRoutes');
const { TtlCache } = require('./ttlCache');
const { hogqlSinceClause } = require('./analyticsSince');
const { hogqlExclusionClause } = require('./analyticsExclusions');

const POSTHOG_HOST = process.env.POSTHOG_HOST; // e.g. https://us.i.posthog.com
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

function isConfigured() {
  return !!(POSTHOG_HOST && POSTHOG_PROJECT_ID && POSTHOG_PERSONAL_API_KEY);
}

// A few cards are answered by Postgres rather than PostHog, because the truth lives
// there and no client event can reproduce it (see the free-call outcome stage below).
const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// Every "day" on this dashboard is an INDIAN day. `toDate(timestamp)` alone resolves
// against whatever timezone the PostHog project is set to — so with a UTC project the
// "Today" card silently dropped everyone active between 00:00 and 05:30 IST into
// yesterday (measured 2026-09-20: 47 signups by the UTC day vs 54 by the IST day).
// `toTimeZone` re-presents the same absolute instant in IST, so this is correct
// regardless of the project setting and stays correct if that setting ever changes.
const ANALYTICS_TZ = 'Asia/Kolkata';
const LOCAL_DATE = `toDate(toTimeZone(timestamp, '${ANALYTICS_TZ}'))`;

// Every card on the Analytics page shares ONE date-range control (preset buttons +
// custom From/To) instead of each card having its own — this is the single place that
// resolves whatever the frontend sent into a HogQL WHERE clause. `from`/`to` (both
// YYYY-MM-DD, inclusive) take priority; `days` is kept working as a fallback for any
// caller that hasn't been updated (e.g. a stale cached frontend build) rather than
// breaking it outright.
function resolveDateWhere(req, { defaultDays = 7, maxDays = 180 } = {}) {
  const { from, to } = req.query;
  if (ISO_DATE.test(from || '') && ISO_DATE.test(to || '')) {
    return `${LOCAL_DATE} >= toDate('${from}') AND ${LOCAL_DATE} <= toDate('${to}')`;
  }
  const days = clampDays(req.query.days, defaultDays, maxDays);
  return `timestamp >= now() - INTERVAL ${days} DAY`;
}

// The START of the page's date range only, with no end. For "of the people who
// signed up in this range, how many went on to do X" — X may happen after the
// range ends and must still count.
function resolveDateStart(req, { defaultDays = 7, maxDays = 180 } = {}) {
  const { from, to } = req.query;
  if (ISO_DATE.test(from || '') && ISO_DATE.test(to || '')) {
    return `${LOCAL_DATE} >= toDate('${from}')`;
  }
  const days = clampDays(req.query.days, defaultDays, maxDays);
  return `timestamp >= now() - INTERVAL ${days} DAY`;
}

// The range a response was actually computed for, echoed back so the dashboard can
// refuse to render a card under a header it does not belong to. Each of the auth /
// signup-to-consult / journey cards fetches on its own, so without this a slow or
// failed refetch left the PREVIOUS range's numbers on screen under the new dates —
// which is exactly how a week's signups came to be read as one day's (2026-09-20).
function rangeMeta(req, { defaultDays = 7, maxDays = 180 } = {}) {
  const { from, to } = req.query;
  if (ISO_DATE.test(from || '') && ISO_DATE.test(to || '')) return { from, to };
  return { days: clampDays(req.query.days, defaultDays, maxDays) };
}

// The same range the HogQL clauses use, as absolute instants, for the Postgres-backed
// cards. The dashboard's dates are IST calendar dates (see ANALYTICS_TZ) and
// `created_at` is timestamptz, so the boundaries are built with an explicit +05:30 —
// never with the server's local timezone, which is UTC on the VPS.
function resolveRangeInstants(req, { defaultDays = 7, maxDays = 180 } = {}) {
  const { from, to } = req.query;
  if (ISO_DATE.test(from || '') && ISO_DATE.test(to || '')) {
    const endExclusive = new Date(`${to}T00:00:00+05:30`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1); // `to` is inclusive
    return { startIso: new Date(`${from}T00:00:00+05:30`).toISOString(), endIso: endExclusive.toISOString() };
  }
  const days = clampDays(req.query.days, defaultDays, maxDays);
  return { startIso: new Date(Date.now() - days * 86400000).toISOString(), endIso: null };
}

function clampDays(raw, fallback, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

// Production events only, and only from the admin's "count analytics from" start date
// (src/analyticsSince.js). A getter rather than a plain string so every query picks up
// the current start date — every query below interpolates ${ENV_FILTER}.
const PRODUCTION_ONLY = `properties.environment = 'production'`;
const ENV_FILTER_HOLDER = {
  toString() {
    // Also drops customers the admin excluded from analytics (src/analyticsExclusions.js).
    return [PRODUCTION_ONLY, hogqlSinceClause(), hogqlExclusionClause()].filter(Boolean).join(' AND ');
  },
};
const ENV_FILTER = ENV_FILTER_HOLDER;

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
  // One screen now serves BOTH flows (2026-09-20, commit 519a634): the customer types
  // a number and the screen decides. It always fires `login_screen_viewed` +
  // `login_submit_tapped`, and only then — once the server answers NO_ACCOUNT — does the
  // signup path take over with `signup_otp_sent`.
  //
  // So the first two stages are genuinely SHARED and cannot be attributed to one flow.
  // Counting only the old `Register` events here made the signup funnel read
  // "Viewed 2 -> OTP Sent 47 (2350%)", because the top measured a near-dead screen while
  // everything below it measured everyone. `shared: true` is passed through to the UI so
  // it can say so rather than presenting a drop-off that does not exist.
  const SHARED_ENTRY_STAGES = [
    {
      key: 'viewed',
      label: 'Opened sign-in screen',
      shared: true,
      screenNames: ['Login', 'Register'],
      events: ['login_screen_viewed', 'signup_screen_viewed'],
    },
    {
      key: 'submitted',
      label: 'Tapped Continue',
      shared: true,
      events: ['login_submit_tapped', 'signup_submit_tapped'],
    },
  ];

  const AUTH_FUNNELS = {
    // Short signup (2026-09-14): mobile -> OTP -> name -> welcome. The old
    // "Tapped Upload Photo" stage was removed with the photo step — keeping a stage
    // whose event the app no longer sends would read 0 and make every stage after
    // it look larger than the one before (see the analytics correctness rules).
    signup: {
      label: 'Signup',
      stages: [
        { ...SHARED_ENTRY_STAGES[0] },
        { ...SHARED_ENTRY_STAGES[1] },
        { key: 'otp_sent', label: 'OTP Sent', events: ['signup_otp_sent'] },
        { key: 'otp_verified', label: 'OTP Verified', events: ['signup_otp_verified'] },
        { key: 'completed', label: 'Account Created', events: ['signup_completed'] },
        { key: 'name_saved', label: 'Name Saved', events: ['signup_name_saved'] },
        { key: 'welcome', label: 'Tapped Namaste (reached Home)', events: ['signup_welcome_hi_tapped'] },
      ],
    },
    login: {
      label: 'Login',
      stages: [
        { ...SHARED_ENTRY_STAGES[0] },
        { ...SHARED_ENTRY_STAGES[1] },
        { key: 'otp_sent', label: 'OTP Sent', events: ['login_otp_sent'] },
        { key: 'completed', label: 'Logged In', events: ['login_completed'] },
      ],
    },
  };

  app.get('/api/admin/analytics/auth-funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const type = AUTH_FUNNELS[req.query.type] ? req.query.type : 'signup';
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const def = AUTH_FUNNELS[type];

    // A stage matches any of its named events, plus (for the entry stage) a `$screen`
    // view of any of its screens — the app has shipped both the named event and plain
    // autocapture at different times, and old installed builds still send the old names.
    const stageCondition = (st) => {
      const parts = (st.events || []).map((e) => `event = '${e}'`);
      (st.screenNames || []).forEach((n) => {
        parts.push(`(event = '$screen' AND properties.$screen_name = '${n}')`);
      });
      return parts.join(' OR ');
    };
    const selects = def.stages
      .map((st) => `count(DISTINCT if(${stageCondition(st)}, person_id, NULL)) AS ${st.key}`)
      .join(',\n        ');
    const eventList = [...new Set(
      def.stages.flatMap((st) => [
        ...(st.events || []),
        ...((st.screenNames || []).length ? ['$screen'] : []),
      ])
    )].map((e) => `'${e}'`).join(', ');

    const rows = await runHogQL(`
      SELECT
        ${selects}
      FROM events
      WHERE properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
        AND event IN (${eventList})
    `);
    const values = rows[0] || def.stages.map(() => 0);
    const stages = def.stages.map((st, i) => ({
      key: st.key,
      label: st.label,
      shared: !!st.shared,
      count: Number(values[i]) || 0,
    }));
    return res.json({
      success: true,
      type,
      label: def.label,
      stages,
      range: rangeMeta(req, { defaultDays: 7 }),
      note: 'The first two stages are shared by signup and login — one screen serves both, and which flow it is only becomes known after the number is checked.',
    });
  }));

  // ── Signup -> first consultation, end to end ──
  //
  // The question the short signup (2026-09-14) is judged by: not "did more people
  // sign up" (they will — signup got shorter) but "did more people who opened
  // signup end up talking to an astrologer". Birth details moved from signup to
  // the first chat/call, so drop-off can move rather than disappear; only an
  // end-to-end view shows the net effect.
  //
  // "viewed" counts BOTH `signup_screen_viewed` (the old, now-unreachable Register
  // screen) and `login_screen_viewed` (the merged Login screen every signup/login visit
  // actually fires since 2026-09-20, commit 519a634) — same fix as the auth-funnel's
  // SHARED_ENTRY_STAGES above. Counting only the old event made this card's own top
  // stage read near-zero under a real "OTP Sent" figure, an impossible funnel shape
  // (found 2026-09-22 while investigating the identical bug in /auth-funnel).
  //
  // Two parts, because the stages count different people:
  //  - Before an account exists (screen opened, OTP sent) there is no customer to
  //    follow, so those are plain distinct-person counts inside the date range.
  //  - From "Account created" on, it is a COHORT: customers whose signup_completed
  //    fell in the range, followed forward with no end date, so a customer who
  //    signed up on the last day and chatted two days later still counts. Without
  //    the cohort, long-standing customers chatting in the range would inflate the
  //    bottom of the funnel above its top.
  //
  // Stages are distinct people and do not enforce order, same as the other
  // funnels on this page.
  /* ── The whole first journey, click by click ─────────────────────────────
   * Opening the app -> signing up -> the free call -> the free 5-minute chat ->
   * sharing. Every tap the customer makes is its own stage, so a drop can be
   * pinned to the exact screen it happens on rather than to "signup" or "the
   * offer" as a whole.
   *
   * Two parts, for the same reason as signup-to-consult: before an account exists
   * there is no customer to follow, so those stages are plain distinct-person
   * counts inside the date range. From "Account created" on it is a COHORT —
   * customers whose signup_completed falls in the range, followed forward with no
   * end date — so someone who signed up on the last day and chatted the next day
   * still counts, and long-standing customers never inflate the bottom.
   *
   * Stages are distinct people and do not enforce order, same as every other
   * funnel on this page. Every event named here is one the app actually sends;
   * when an event is renamed in the app, it must be renamed here in the same
   * commit, or this card silently reads zero (audit 2026-08-21).
   */
  const JOURNEY_PRE = [
    { key: 'opened', label: 'Opened the app (sign-in screen)', events: ['login_screen_viewed', 'signup_screen_viewed'] },
    { key: 'tapped_continue', label: 'Tapped Continue / Get OTP', events: ['login_submit_tapped', 'signup_submit_tapped'] },
    { key: 'otp_sent', label: 'OTP sent', events: ['login_otp_sent', 'signup_otp_sent'] },
  ];
  const JOURNEY_COHORT = [
    { key: 'created', label: 'OTP verified — account created', events: ['signup_completed'] },
    { key: 'name_saved', label: 'Name saved', events: ['signup_name_saved'] },
    { key: 'welcome', label: 'Welcome gift screen seen', events: ['signup_welcome_viewed'] },
    { key: 'call_offer', label: 'Free-call offer shown', events: ['free_call_offer_shown'] },
    { key: 'call_claim', label: 'Tapped Claim my FREE call', events: ['free_call_claim_tapped', 'free_call_quick_book_tapped'] },
    { key: 'call_slots', label: 'Time slots opened', events: ['free_call_slots_opened'] },
    { key: 'call_slot_picked', label: 'Tapped a time', events: ['free_call_slot_selected'] },
    { key: 'call_booked', label: 'Free call booked', events: ['free_call_booked'] },
    { key: 'birth_opened', label: 'Birth details opened', events: ['birth_details_screen_viewed'] },
    { key: 'birth_saved', label: 'Birth details saved', events: ['birth_details_saved'] },
    { key: 'chat_offer', label: 'Free 5-minute chat offered', events: ['free_chat_offer_shown'] },
    { key: 'chat_accepted', label: 'Tapped start free chat', events: ['free_chat_offer_accepted'] },
    { key: 'chat_opened', label: 'Chat screen opened', events: ['free_bot_chat_started'] },
    { key: 'chat_message', label: 'Sent a message in the chat', events: ['free_bot_chat_message_sent'] },
    { key: 'chat_completed', label: 'Finished the full 5 minutes', events: ['free_bot_chat_ended'], filter: "properties.completed = true" },
    { key: 'share_shown', label: 'Refer & earn offered after chat', events: ['referral_prompt_shown'] },
    { key: 'shared', label: 'Shared the referral', events: ['referral_shared'] },
  ];

  const journeyCase = (stage) => {
    const list = stage.events.map((e) => `'${e}'`).join(', ');
    const cond = stage.filter ? `event IN (${list}) AND ${stage.filter}` : `event IN (${list})`;
    return `count(DISTINCT if(${cond}, person_id, NULL)) AS ${stage.key}`;
  };
  const journeyEventList = (stages) => {
    const all = new Set();
    stages.forEach((s) => s.events.forEach((e) => all.add(e)));
    return [...all].map((e) => `'${e}'`).join(', ');
  };

  app.get('/api/admin/analytics/onboarding-journey', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 30 });
    const dateStart = resolveDateStart(req, { defaultDays: 30 });
    const scope = `properties.app = 'customer' AND ${ENV_FILTER}`;

    const [preRows, cohortRows] = await Promise.all([
      runHogQL(`
        SELECT ${JOURNEY_PRE.map(journeyCase).join(',\n          ')}
        FROM events
        WHERE ${scope} AND ${dateWhere}
          AND event IN (${journeyEventList(JOURNEY_PRE)})
      `),
      runHogQL(`
        SELECT ${JOURNEY_COHORT.map(journeyCase).join(',\n          ')}
        FROM events
        WHERE ${scope} AND ${dateStart}
          AND event IN (${journeyEventList(JOURNEY_COHORT)})
          AND person_id IN (
            SELECT person_id FROM events
            WHERE event = 'signup_completed' AND ${scope} AND ${dateWhere}
          )
      `),
    ]);

    const pre = (preRows[0] || []).map((v) => Number(v) || 0);
    const cohort = (cohortRows[0] || []).map((v) => Number(v) || 0);
    return res.json({
      success: true,
      stages: [
        ...JOURNEY_PRE.map((s, i) => ({ key: s.key, label: s.label, count: pre[i] || 0 })),
        ...JOURNEY_COHORT.map((s, i) => ({ key: s.key, label: s.label, count: cohort[i] || 0 })),
      ],
      range: rangeMeta(req, { defaultDays: 30 }),
    });
  }));

  app.get('/api/admin/analytics/signup-to-consult', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 30 });
    const dateStart = resolveDateStart(req, { defaultDays: 30 });
    const scope = `properties.app = 'customer' AND ${ENV_FILTER}`;

    const [preRows, cohortRows] = await Promise.all([
      runHogQL(`
        SELECT
          count(DISTINCT if((event = '$screen' AND properties.$screen_name IN ('Register', 'Login')) OR event IN ('signup_screen_viewed', 'login_screen_viewed'), person_id, NULL)) AS viewed,
          count(DISTINCT if(event = 'signup_otp_sent', person_id, NULL)) AS otp_sent
        FROM events
        WHERE ${scope} AND ${dateWhere}
          AND event IN ('$screen', 'signup_screen_viewed', 'login_screen_viewed', 'signup_otp_sent')
      `),
      runHogQL(`
        SELECT
          count(DISTINCT person_id) AS created,
          count(DISTINCT if(event = 'signup_name_saved', person_id, NULL)) AS name_saved,
          count(DISTINCT if(event = 'signup_welcome_hi_tapped', person_id, NULL)) AS reached_home,
          count(DISTINCT if(event = 'birth_details_saved', person_id, NULL)) AS birth_saved,
          count(DISTINCT if(event IN ('chat_initiated', 'call_initiated'), person_id, NULL)) AS requested,
          count(DISTINCT if(event IN ('chat_started', 'call_connected'), person_id, NULL)) AS connected
        FROM events
        WHERE ${scope} AND ${dateStart}
          AND event IN ('signup_completed', 'signup_name_saved', 'signup_welcome_hi_tapped',
                        'birth_details_saved', 'chat_initiated', 'call_initiated',
                        'chat_started', 'call_connected')
          AND person_id IN (
            SELECT person_id FROM events
            WHERE event = 'signup_completed' AND ${scope} AND ${dateWhere}
          )
      `),
    ]);

    const [viewed, otpSent] = (preRows[0] || []).map((v) => Number(v) || 0);
    const [created, nameSaved, reachedHome, birthSaved, requested, connected] =
      (cohortRows[0] || []).map((v) => Number(v) || 0);

    return res.json({
      success: true,
      stages: [
        { key: 'viewed', label: 'Opened signup', count: viewed || 0 },
        { key: 'otp_sent', label: 'OTP sent', count: otpSent || 0 },
        { key: 'created', label: 'Account created', count: created || 0 },
        { key: 'name_saved', label: 'Name saved', count: nameSaved || 0 },
        { key: 'reached_home', label: 'Tapped Namaste (reached Home)', count: reachedHome || 0 },
        { key: 'birth_saved', label: 'Birth details saved', count: birthSaved || 0 },
        { key: 'requested', label: 'Requested a chat or call', count: requested || 0 },
        { key: 'connected', label: 'Consultation connected', count: connected || 0 },
      ],
      range: rangeMeta(req, { defaultDays: 30 }),
    });
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
          -- The frame is NOT optional. ClickHouse defaults an ORDER BY window to
          -- "RANGE UNBOUNDED PRECEDING AND CURRENT ROW", and leadInFrame only looks
          -- INSIDE the frame — so with the default it can never see the next row and
          -- returns NULL for all of them. That read as "the session ended here",
          -- putting the Home exit rate at 99.7% (526 of 527) when the real figure is
          -- 66 of 389: measured 2026-09-20, most people go on to ChatScreen.
          leadInFrame(properties.$screen_name) OVER (
            PARTITION BY properties.$session_id ORDER BY timestamp
            ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
          ) AS next_screen
        FROM events
        WHERE event = '$screen' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
      )
      SELECT next_screen, count() AS n
      FROM ordered
      -- The app's route is named HomeScreen; this asked for 'Home' and matched nothing,
      -- so the card read 0 Home views next to a Top Screens table showing 332 of them
      -- (2026-09-20). 'Home' is kept for any older build that reported the short name.
      WHERE screen IN ('HomeScreen', 'Home')
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
    const [shown, slotsOpened, slotPicked, booked, answeredInApp, dismissed, failed, declined] =
      rows[0] || [0, 0, 0, 0, 0, 0, 0, 0];

    // "Call Answered" used to count the `free_call_answered` event, which only fires when
    // the customer answers an IN-APP ring (components/FreeCallIncoming.js). Astrologers
    // run these calls from the `tel:` dialler in the vendor app and then mark the booking
    // done, so that event never fires for them and the stage read 0 forever — on
    // 2026-09-20 it showed "0 answered" against 6 bookings the database had as completed.
    //
    // The outcome of a free call is recorded in `free_call_bookings.status`, so that is
    // what this stage reports now: the bookings MADE in this range (the same cohort as
    // the "Booked" stage above), by how they turned out. The in-app figure is kept
    // alongside it as a separate stat rather than deleted — it is the only measure of
    // that path — but it is no longer presented as the outcome of the funnel.
    const { startIso, endIso } = resolveRangeInstants(req, { defaultDays: 7 });
    let outcomes = null;
    try {
      let q = db.from('free_call_bookings').select('status').gte('created_at', startIso);
      if (endIso) q = q.lt('created_at', endIso);
      const { data, error } = await q;
      if (error) throw error;
      outcomes = { booked: 0, completed: 0, missed: 0, cancelled: 0, total: data.length };
      data.forEach((r) => {
        if (Object.prototype.hasOwnProperty.call(outcomes, r.status)) outcomes[r.status] += 1;
      });
    } catch (err) {
      // A funnel that cannot read one stage must not blank the other four.
      console.error('[postHogRoutes] free-call outcomes query failed:', err.message);
    }

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
        {
          key: 'completed',
          label: 'Call Completed',
          count: outcomes ? outcomes.completed : 0,
          source: 'database',
          unavailable: !outcomes,
        },
      ],
      outcomes,
      answeredInApp: Number(answeredInApp) || 0,
      dismissed: Number(dismissed) || 0,
      failed: Number(failed) || 0,
      declined: Number(declined) || 0,
      dismissBreakdown,
    });
  }));

  // ── Free 5-Minute Chat Funnel: Offer Shown → Accepted → Chat Started → Sent a
  // Message → Stayed All 5 Minutes → Recharged Wallet ──
  // "Sent a message" comes from free_bot_chat_message_sent, which older app bundles
  // don't send; the stage is left out until the range contains any of it, so older
  // ranges don't show a fake 100% drop there.
  // "Recharged wallet" = people who started the free chat and have a wallet_recharged
  // event from the start of the range onward (not bounded by the range end — a recharge
  // the day after the chat still counts).
  app.get('/api/admin/analytics/free-chat-funnel', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 7 });
    const dateStart = resolveDateStart(req, { defaultDays: 7 });
    const startedInRange = `SELECT person_id FROM events
      WHERE event = 'free_bot_chat_started' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}`;
    const [counts, recharged, messageEver] = await Promise.all([
      runHogQL(`
        SELECT
          count(DISTINCT if(event = 'free_chat_offer_shown', person_id, NULL)) AS shown,
          count(DISTINCT if(event = 'free_chat_offer_accepted', person_id, NULL)) AS accepted,
          count(DISTINCT if(event = 'free_bot_chat_started', person_id, NULL)) AS started,
          count(DISTINCT if(event = 'free_bot_chat_message_sent', person_id, NULL)) AS messaged,
          count(DISTINCT if(event = 'free_bot_chat_ended' AND properties.completed = true, person_id, NULL)) AS completed,
          count(DISTINCT if(event = 'free_chat_offer_dismissed', person_id, NULL)) AS dismissed,
          count(DISTINCT if(event = 'free_bot_chat_ended' AND properties.completed = false, person_id, NULL)) AS endedEarly,
          count(DISTINCT if(event = 'free_bot_chat_ai_fallback', person_id, NULL)) AS aiFallback
        FROM events
        WHERE properties.app = 'customer' AND ${ENV_FILTER} AND ${dateWhere}
          AND event IN ('free_chat_offer_shown', 'free_chat_offer_accepted', 'free_bot_chat_started',
                        'free_bot_chat_message_sent', 'free_bot_chat_ended', 'free_chat_offer_dismissed',
                        'free_bot_chat_ai_fallback')
      `),
      runHogQL(`
        SELECT count(DISTINCT person_id)
        FROM events
        WHERE event = 'wallet_recharged' AND properties.app = 'customer' AND ${ENV_FILTER} AND ${dateStart}
          AND person_id IN (${startedInRange})
      `),
      runHogQL(`
        SELECT count(DISTINCT person_id)
        FROM events
        WHERE event = 'free_bot_chat_message_sent' AND properties.app = 'customer' AND ${ENV_FILTER}
      `),
    ]);
    const [shown, accepted, started, messaged, completed, dismissed, endedEarly, aiFallback] =
      (counts[0] || [0, 0, 0, 0, 0, 0, 0, 0]).map((n) => Number(n) || 0);
    const rechargedCount = Number(recharged[0]?.[0]) || 0;
    // Message tracking exists at all (any date) → the stage is meaningful for this range.
    const messageTracked = (Number(messageEver[0]?.[0]) || 0) > 0;

    const stages = [
      { key: 'shown', label: 'Offer Shown', count: shown },
      { key: 'accepted', label: 'Accepted Offer', count: accepted },
      { key: 'started', label: 'Chat Started', count: started },
      ...(messageTracked ? [{ key: 'messaged', label: 'Sent a Message', count: messaged }] : []),
      { key: 'completed', label: 'Stayed All 5 Minutes', count: completed },
      { key: 'recharged', label: 'Recharged Wallet', count: rechargedCount },
    ];

    return res.json({
      success: true,
      basis: 'persons',
      stages,
      messageTracked,
      dismissed,
      endedEarly,
      aiFallback,
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
