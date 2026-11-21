// Website analytics — Admin -> Website Analytics (astrowani-admin/src/pages/WebsiteAnalytics.jsx).
//
// Everything astrowani.com sends to PostHog carries `app = 'website'` (registered
// in astrowani-website/aw/analytics.js), so this whole report is ONE filter away
// from the app dashboards and never mixes the two. What the website sends:
//   $pageview         page_key, page_type, page_path, site_language, utm_*, came_from
//   web_click         every link/button tap: label, section, target_kind, target
//   web_scroll        25/50/75/100 % reached
//   web_page_engaged  visible seconds on the page + deepest scroll, on leaving
//   web_form_submit   which form (never its values)
//   web_js_error      script errors (site health)
// plus the funnel events the website shares with the app (app_store_click,
// login_*, chat_*, call_*, recharge_*, wallet_recharged...).
//
// Every query is scoped by `scope` below, which includes postHogRoutes' ENV_FILTER
// (production only, the admin's analytics start date, excluded customers). A new
// query here that skips it would count test traffic and excluded people.
//
// All HogQL interpolations are fixed strings or come from resolveDateWhere, which
// only ever admits ISO dates or a clamped integer — nothing from the request
// reaches a query unvalidated.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminRoutes');
const { runHogQL, isConfigured, ENV_FILTER, resolveDateWhere } = require('./postHogRoutes');
const { WEB_PREFIX } = require('./acquisition');
const { pagedSelect } = require('./pagedSelect');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const LOCAL_DATE = "toDate(toTimeZone(timestamp, 'Asia/Kolkata'))";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE = { defaultDays: 7, maxDays: 365 };

// Pageviews logged before page_key existed (2026-11-21) carry only `page`.
// For those, PostHog's own $pathname is used instead and turned into a key by
// normalizePageKey() — the same rules as pageKey() in aw/analytics.js.
const PAGE_KEY = "coalesce(nullIf(properties.page_key, ''), nullIf(properties.$pathname, ''), nullIf(properties.page, ''), 'unknown')";

// The funnel events the website shares with the app, in funnel order.
const CONVERSIONS = [
  ['app_store_click', 'Tapped "Get the app"'],
  ['consult_cta_click', 'Tapped a consult button'],
  ['login_otp_sent', 'Asked for a login OTP'],
  ['login_completed', 'Logged in'],
  ['signup_completed', 'Signed up on the website'],
  ['chat_initiated', 'Started a chat request'],
  ['chat_started', 'Chat connected'],
  ['call_initiated', 'Started a call request'],
  ['call_connected', 'Call connected'],
  ['recharge_started', 'Opened wallet recharge'],
  ['wallet_recharged', 'Recharged the wallet'],
  ['blog_opened', 'Opened a blog article'],
  ['language_toggled', 'Switched language'],
];

function rangeOf(req) {
  const { from, to } = req.query;
  if (ISO_DATE.test(from || '') && ISO_DATE.test(to || '')) {
    const end = new Date(`${to}T00:00:00+05:30`);
    end.setUTCDate(end.getUTCDate() + 1);
    return { meta: { from, to }, startIso: new Date(`${from}T00:00:00+05:30`).toISOString(), endIso: end.toISOString() };
  }
  const n = parseInt(req.query.days, 10);
  const days = Number.isFinite(n) && n > 0 ? Math.min(n, RANGE.maxDays) : RANGE.defaultDays;
  return { meta: { days }, startIso: new Date(Date.now() - days * 86400000).toISOString(), endIso: null };
}

// Sort a referrer into something a person reads at a glance.
function classifySource({ utm, domain, adClick }) {
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  if (adClick === 'google') return { group: 'Paid ads', label: 'Google Ads' };
  if (adClick === 'meta') return { group: 'Paid ads', label: 'Meta ads' };
  if (utm) return { group: 'Campaign links', label: `utm: ${utm}` };
  if (!d || d === '$direct') return { group: 'Direct', label: 'Direct / typed / app link' };
  if (/(^|\.)astrowani\.com$/.test(d)) return { group: 'Direct', label: 'From astrowani.com' };
  if (/(^|\.)google\./.test(d)) return { group: 'Search', label: 'Google Search' };
  if (/(^|\.)bing\.com$/.test(d)) return { group: 'Search', label: 'Bing' };
  if (/duckduckgo|yahoo|yandex|ecosia|baidu|brave/.test(d)) return { group: 'Search', label: d };
  if (/chatgpt|openai|perplexity|copilot|gemini|claude\.ai/.test(d)) return { group: 'AI assistants', label: d };
  if (/facebook|fb\.|instagram|t\.co$|twitter|x\.com$|youtube|linkedin|pinterest|reddit|whatsapp|telegram|quora|threads/.test(d)) return { group: 'Social', label: d };
  return { group: 'Other websites', label: d };
}

// Pageviews from before page_key existed carry the old `page` value ("index",
// "blog-post", "kundli-reading"). Map them onto the new keys so one page is one
// row. Visitors are then summed across the two spellings, which can count a
// person twice only on the day the change shipped.
function normalizePageKey(k) {
  const v = String(k || 'unknown').toLowerCase();
  if (v.startsWith('/')) {
    const p = v.replace(/^\/hi(?=\/|$)/, '') || '/';
    if (p === '/' || p === '/index.html') return 'home';
    if (/^\/blog\/./.test(p) || p === '/blog-post.html') return 'blog_article';
    if (/^\/astrologers\/./.test(p)) return 'astrologer_profile';
    if (/^\/stories\/./.test(p)) return 'story';
    return p.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'home';
  }
  if (v === 'index') return 'home';
  if (v === 'blog-post') return 'blog_article';
  return v.replace(/-/g, '_');
}

function mergePages(rows) {
  const out = new Map();
  for (const r of rows) {
    const key = normalizePageKey(r.pageKey);
    const m = out.get(key) || { pageKey: key, pageType: '', views: 0, visitors: 0 };
    m.views += r.views; m.visitors += r.visitors;
    if (!m.pageType && r.pageType) m.pageType = r.pageType;
    out.set(key, m);
  }
  return [...out.values()].sort((a, b) => b.views - a.views);
}

// The address to show in the click map when no pageview recorded one (pageviews
// before 2026-11-21 carry no page_path). Legal pages keep their WordPress
// folder addresses (astrowani-website/aw/legal-paths.js).
const LEGAL_PATHS = {
  privacy_policy: '/privacy-policy/', term_conditions: '/term_conditions/', terms_and_conditions: '/term_conditions/',
  refund_cancellation: '/refund_cancellation/', delete_account: '/delete-account/', child_safety: '/child-safety/',
  safety_guidelines: '/safety-guidelines/', report_vulnerability: '/report-vulnerability/',
};
function guessPath(page) {
  if (page === 'home') return '/';
  if (LEGAL_PATHS[page]) return LEGAL_PATHS[page];
  if (['blog_article', 'astrologer_profile', 'story'].includes(page)) return null;
  return `/${page.replace(/_/g, '-')}.html`;
}

const num = (v) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

module.exports = function registerWebsiteAnalyticsRoutes(app) {
  app.get('/api/admin/website-analytics', requireAdmin, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: 'Analytics not configured (missing POSTHOG_* env vars)' });
    }
    const dateWhere = resolveDateWhere(req, RANGE);
    const scope = `properties.app = 'website' AND ${ENV_FILTER} AND ${dateWhere}`;
    const range = rangeOf(req);
    const errors = {};

    // Each section independent: one failing query blanks one card, not the page.
    const section = async (key, fn) => {
      try { return await fn(); } catch (e) {
        errors[key] = 'query failed';
        console.error(`[websiteAnalytics] ${key}:`, e.response?.data || e.message);
        return null;
      }
    };

    const [overview, engaged, bounce, daily, pages, pageEngagement, topPaths, sources, tech, clicks, conversions, forms, jsErrors, notFound, installs] = await Promise.all([
      section('overview', async () => {
        const [r] = await runHogQL(`
          SELECT count(), uniq(person_id), uniq(properties.$session_id)
          FROM events WHERE event = '$pageview' AND ${scope}`);
        return { pageviews: num(r?.[0]), visitors: num(r?.[1]), sessions: num(r?.[2]) };
      }),
      section('engaged', async () => {
        const [r] = await runHogQL(`
          SELECT avg(toFloat(properties.seconds)), quantile(0.5)(toFloat(properties.seconds)), avg(toFloat(properties.max_scroll))
          FROM events WHERE event = 'web_page_engaged' AND ${scope}`);
        return { avgSeconds: num(r?.[0]), medianSeconds: num(r?.[1]), avgScroll: num(r?.[2]) };
      }),
      section('bounce', async () => {
        const [r] = await runHogQL(`
          SELECT countIf(c = 1), count() FROM (
            SELECT properties.$session_id AS s, count() AS c
            FROM events WHERE event = '$pageview' AND ${scope} AND properties.$session_id IS NOT NULL
            GROUP BY s)`);
        const single = num(r?.[0]); const all = num(r?.[1]);
        return { bounceRate: all ? single / all : 0, sessions: all };
      }),
      section('daily', async () => {
        const rows = await runHogQL(`
          SELECT ${LOCAL_DATE} AS d, count(), uniq(person_id), uniq(properties.$session_id)
          FROM events WHERE event = '$pageview' AND ${scope}
          GROUP BY d ORDER BY d`);
        return rows.map(([d, pv, v, s]) => ({ date: String(d), pageviews: num(pv), visitors: num(v), sessions: num(s) }));
      }),
      section('pages', async () => {
        const rows = await runHogQL(`
          SELECT ${PAGE_KEY} AS k, any(properties.page_type), count(), uniq(person_id)
          FROM events WHERE event = '$pageview' AND ${scope}
          GROUP BY k ORDER BY count() DESC LIMIT 300`);
        return mergePages(rows.map(([k, t, pv, v]) => ({ pageKey: k, pageType: t || '', views: num(pv), visitors: num(v) })));
      }),
      section('pageEngagement', async () => {
        const rows = await runHogQL(`
          SELECT ${PAGE_KEY} AS k, avg(toFloat(properties.seconds)), avg(toFloat(properties.max_scroll)), count()
          FROM events WHERE event = 'web_page_engaged' AND ${scope}
          GROUP BY k`);
        return Object.fromEntries(rows.map(([k, s, sc, n]) => [normalizePageKey(k), { avgSeconds: num(s), avgScroll: num(sc), samples: num(n) }]));
      }),
      section('topPaths', async () => {
        const rows = await runHogQL(`
          SELECT properties.page_key AS k, properties.page_path AS p, count(), uniq(person_id)
          FROM events WHERE event = '$pageview' AND ${scope}
            AND properties.page_key IN ('blog_article', 'astrologer_profile', 'story')
          GROUP BY k, p ORDER BY count() DESC LIMIT 40`);
        return rows.map(([k, p, pv, v]) => ({ pageKey: k, path: p, views: num(pv), visitors: num(v) }));
      }),
      section('sources', async () => {
        const rows = await runHogQL(`
          SELECT
            coalesce(nullIf(properties.utm_source, ''), nullIf(properties.$session_entry_utm_source, ''), '') AS u,
            coalesce(nullIf(properties.came_from, ''), nullIf(properties.$session_entry_referring_domain, ''), nullIf(properties.$referring_domain, ''), '') AS d,
            coalesce(properties.ad_click, '') AS a,
            uniq(properties.$session_id), uniq(person_id)
          FROM events WHERE event = '$pageview' AND ${scope}
          GROUP BY u, d, a ORDER BY uniq(properties.$session_id) DESC LIMIT 200`);
        const byLabel = new Map();
        const byGroup = new Map();
        for (const [u, d, a, sessions, visitors] of rows) {
          const c = classifySource({ utm: u, domain: d, adClick: a });
          const l = byLabel.get(c.label) || { ...c, sessions: 0, visitors: 0 };
          l.sessions += num(sessions); l.visitors += num(visitors);
          byLabel.set(c.label, l);
          const g = byGroup.get(c.group) || { group: c.group, sessions: 0, visitors: 0 };
          g.sessions += num(sessions); g.visitors += num(visitors);
          byGroup.set(c.group, g);
        }
        // Visitors summed across sources can count one person twice (two visits,
        // two sources), so the page labels this "visits", which is exact.
        return {
          groups: [...byGroup.values()].sort((x, y) => y.sessions - x.sessions),
          detail: [...byLabel.values()].sort((x, y) => y.sessions - x.sessions).slice(0, 30),
        };
      }),
      section('tech', async () => {
        const dims = {
          device: 'properties.$device_type',
          browser: 'properties.$browser',
          os: 'properties.$os',
          country: 'properties.$geoip_country_name',
          city: 'properties.$geoip_city_name',
          language: 'properties.site_language',
        };
        const out = {};
        await Promise.all(Object.entries(dims).map(async ([key, expr]) => {
          const rows = await runHogQL(`
            SELECT coalesce(toString(${expr}), 'Unknown') AS v, uniq(person_id)
            FROM events WHERE event = '$pageview' AND ${scope}
            GROUP BY v ORDER BY uniq(person_id) DESC LIMIT 15`);
          out[key] = rows.map(([v, n]) => ({ value: v || 'Unknown', visitors: num(n) }));
        }));
        return out;
      }),
      section('clicks', async () => {
        const rows = await runHogQL(`
          SELECT properties.label AS l, properties.section AS s, properties.target_kind AS tk, properties.target AS t,
                 ${PAGE_KEY} AS k, count(), uniq(person_id)
          FROM events WHERE event = 'web_click' AND ${scope}
          GROUP BY l, s, tk, t, k ORDER BY count() DESC LIMIT 60`);
        return rows.map(([l, s, tk, t, k, c, v]) => ({ label: l || '', section: s || '', targetKind: tk || '', target: t || '', pageKey: k, clicks: num(c), visitors: num(v) }));
      }),
      section('conversions', async () => {
        const list = CONVERSIONS.map(([e]) => `'${e}'`).join(', ');
        const rows = await runHogQL(`
          SELECT event, count(), uniq(person_id)
          FROM events WHERE event IN (${list}) AND ${scope}
          GROUP BY event`);
        const got = new Map(rows.map(([e, c, v]) => [e, { count: num(c), people: num(v) }]));
        return CONVERSIONS.map(([event, label]) => ({ event, label, ...(got.get(event) || { count: 0, people: 0 }) }));
      }),
      section('forms', async () => {
        const rows = await runHogQL(`
          SELECT properties.form AS f, ${PAGE_KEY} AS k, count()
          FROM events WHERE event = 'web_form_submit' AND ${scope}
          GROUP BY f, k ORDER BY count() DESC LIMIT 20`);
        return rows.map(([f, k, c]) => ({ form: f || '', pageKey: k, submits: num(c) }));
      }),
      section('jsErrors', async () => {
        const rows = await runHogQL(`
          SELECT properties.err AS e, properties.file AS f, ${PAGE_KEY} AS k, count(), uniq(person_id)
          FROM events WHERE event = 'web_js_error' AND ${scope}
          GROUP BY e, f, k ORDER BY count() DESC LIMIT 20`);
        return rows.map(([e, f, k, c, v]) => ({ error: e || '', file: f || '', pageKey: k, count: num(c), visitors: num(v) }));
      }),
      section('notFound', async () => {
        const rows = await runHogQL(`
          SELECT properties.page_path AS p, count()
          FROM events WHERE event = '$pageview' AND ${scope} AND properties.page_key = '404'
          GROUP BY p ORDER BY count() DESC LIMIT 20`);
        return rows.map(([p, c]) => ({ path: p || '', views: num(c) }));
      }),
      // App signups that started from a Play Store link on the website — read from
      // the database, which is the truth, not from an event (see acquisition.js).
      section('installs', async () => {
        const { rows } = await pagedSelect(() => {
          let q = db.from('customers').select('acquisition_source, created_at')
            .like('acquisition_source', `${WEB_PREFIX}%`)
            .gte('created_at', range.startIso)
            .order('id');
          if (range.endIso) q = q.lt('created_at', range.endIso);
          return q;
        });
        const bySource = new Map();
        for (const r of rows) bySource.set(r.acquisition_source, (bySource.get(r.acquisition_source) || 0) + 1);
        return {
          total: rows.length,
          bySource: [...bySource.entries()].map(([source, signups]) => ({ source, page: source.slice(WEB_PREFIX.length), signups }))
            .sort((x, y) => y.signups - x.signups),
        };
      }),
    ]);

    res.json({
      success: true,
      range: range.meta,
      overview: overview && { ...overview, ...(engaged || {}), bounceRate: bounce?.bounceRate ?? null, pagesPerSession: overview.sessions ? overview.pageviews / overview.sessions : 0 },
      daily,
      pages: pages && pages.map((p) => ({ ...p, ...((pageEngagement || {})[p.pageKey] || { avgSeconds: null, avgScroll: null }) })),
      topPaths,
      sources,
      tech,
      clicks,
      conversions,
      forms,
      jsErrors,
      notFound,
      installs,
      errors,
    });
  });

  // ── Click map for one page: Admin -> Website Analytics -> Click map ──────────
  // Clicks grouped by the element they landed on (the CSS selector analytics.js
  // records), per layout (desktop / mobile), plus how far down people scrolled.
  // aw/heatmap-view.js pins each group onto the live page in the admin's frame.
  app.get('/api/admin/website-analytics/heatmap', requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ success: false, message: 'Analytics not configured' });
    const page = String(req.query.page || 'home');
    if (!/^[a-z0-9_]{1,60}$/.test(page)) return res.status(400).json({ success: false, message: 'Bad page' });
    const dateWhere = resolveDateWhere(req, RANGE);
    const scope = `properties.app = 'website' AND ${ENV_FILTER} AND ${dateWhere}`;
    // Pageviews from before device_class existed fall back to PostHog's own guess.
    const DEVICE = "coalesce(nullIf(properties.device_class, ''), if(properties.$device_type = 'Desktop', 'desktop', 'mobile'))";
    // Events from before page_key existed are matched by their exact address on
    // astrowani.com (the same rules as normalizePageKey), so traffic from the
    // pre-launch preview at /test-site/ is not counted as this page. `page` is
    // validated to [a-z0-9_] above and guessPath only builds from it.
    let legacyWhere;
    if (page === 'blog_article') legacyWhere = "(properties.$pathname LIKE '/blog/%' OR properties.$pathname LIKE '/hi/blog/%')";
    else if (page === 'astrologer_profile') legacyWhere = "properties.$pathname LIKE '/astrologers/%'";
    else if (page === 'story') legacyWhere = "(properties.$pathname LIKE '/stories/%' OR properties.$pathname LIKE '/hi/stories/%')";
    else {
      const p = guessPath(page);
      const list = page === 'home' ? ['/', '/index.html', '/hi/', '/hi/index.html'] : [p, `/hi${p}`];
      legacyWhere = `properties.$pathname IN (${list.map((x) => `'${x}'`).join(', ')})`;
    }
    const onPage = `(properties.page_key = '${page}' OR (properties.page_key IS NULL AND ${legacyWhere}))`;
    try {
      const [visits, clicks, scroll, paths, sourceRows] = await Promise.all([
        runHogQL(`
          SELECT ${DEVICE} AS d, count(), uniq(person_id)
          FROM events WHERE event = '$pageview' AND ${onPage} AND ${scope}
          GROUP BY d`),
        runHogQL(`
          SELECT ${DEVICE} AS d, properties.sel AS s, count(), uniq(person_id),
                 avg(toFloat(properties.rx)), avg(toFloat(properties.ry)), avg(toFloat(properties.page_y)),
                 any(properties.label), any(properties.section)
          FROM events WHERE event = 'web_click' AND ${onPage} AND ${scope}
            AND properties.sel IS NOT NULL AND properties.sel != ''
          GROUP BY d, s ORDER BY count() DESC LIMIT 400`),
        runHogQL(`
          SELECT ${DEVICE} AS d, toInt(properties.depth) AS depth, uniq(person_id)
          FROM events WHERE event = 'web_scroll' AND ${onPage} AND ${scope}
          GROUP BY d, depth`),
        runHogQL(`
          SELECT properties.page_path AS p, count()
          FROM events WHERE event = '$pageview' AND ${onPage} AND ${scope} AND properties.page_path IS NOT NULL
          GROUP BY p ORDER BY count() DESC LIMIT 5`),
        // Where this page's visitors came from to the website, per layout. Same
        // source fields and grouping as the Website Analytics page; counted in
        // page views so each column's sources add up to its visit count.
        runHogQL(`
          SELECT ${DEVICE} AS d,
            coalesce(nullIf(properties.utm_source, ''), nullIf(properties.$session_entry_utm_source, ''), '') AS u,
            coalesce(nullIf(properties.came_from, ''), nullIf(properties.$session_entry_referring_domain, ''), nullIf(properties.$referring_domain, ''), '') AS dom,
            coalesce(properties.ad_click, '') AS a,
            count(), uniq(person_id)
          FROM events WHERE event = '$pageview' AND ${onPage} AND ${scope}
          GROUP BY d, u, dom, a ORDER BY count() DESC LIMIT 300`),
      ]);
      const devices = {};
      for (const d of ['desktop', 'mobile']) devices[d] = { visits: 0, visitors: 0, clicks: [], scroll: [], totalClicks: 0, sources: [] };
      for (const [d, u, dom, a, pv, v] of sourceRows) {
        if (!devices[d]) continue;
        const c = classifySource({ utm: u, domain: dom, adClick: a });
        const list = devices[d].sources;
        let row = list.find((x) => x.label === c.label);
        if (!row) { row = { ...c, visits: 0, visitors: 0 }; list.push(row); }
        row.visits += num(pv); row.visitors += num(v);
      }
      for (const d of Object.values(devices)) d.sources.sort((x, y) => y.visits - x.visits);
      for (const [d, pv, v] of visits) if (devices[d]) { devices[d].visits = num(pv); devices[d].visitors = num(v); }
      for (const [d, sel, c, v, rx, ry, py, label, section] of clicks) {
        if (!devices[d]) continue;
        devices[d].clicks.push({ sel, clicks: num(c), people: num(v), rx: num(rx), ry: num(ry), pageY: num(py), label: label || '', section: section || '' });
        devices[d].totalClicks += num(c);
      }
      for (const [d, depth, v] of scroll) {
        if (!devices[d]) continue;
        const base = devices[d].visitors || 0;
        devices[d].scroll.push({ depth: num(depth), people: num(v), percent: base ? Math.min(100, Math.round((num(v) / base) * 100)) : 0 });
      }
      for (const d of Object.values(devices)) d.scroll.sort((a, b) => a.depth - b.depth);
      const totals = {
        visits: devices.desktop.visits + devices.mobile.visits,
        visitors: devices.desktop.visitors + devices.mobile.visitors,
        clicks: devices.desktop.totalClicks + devices.mobile.totalClicks,
      };
      res.json({ success: true, page, range: rangeOf(req).meta, path: paths[0]?.[0] || guessPath(page), paths: paths.map(([p, c]) => ({ path: p, views: num(c) })), totals, devices });
    } catch (e) {
      console.error('[websiteAnalytics] heatmap:', e.response?.data || e.message);
      res.status(502).json({ success: false, message: 'PostHog query failed' });
    }
  });

  // Who is on the site right now. Not cached for long (runHogQL caches 60s,
  // which is fine for a "live" number).
  app.get('/api/admin/website-analytics/live', requireAdmin, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ success: false, message: 'Analytics not configured' });
    try {
      const rows = await runHogQL(`
        SELECT ${PAGE_KEY} AS k, uniq(person_id)
        FROM events WHERE properties.app = 'website' AND ${ENV_FILTER}
          AND timestamp >= now() - INTERVAL 5 MINUTE
        GROUP BY k ORDER BY uniq(person_id) DESC LIMIT 15`);
      const [tot] = await runHogQL(`
        SELECT uniq(person_id) FROM events WHERE properties.app = 'website' AND ${ENV_FILTER}
          AND timestamp >= now() - INTERVAL 5 MINUTE`);
      res.json({ success: true, activeVisitors: num(tot?.[0]), pages: rows.map(([k, v]) => ({ pageKey: normalizePageKey(k), visitors: num(v) })) });
    } catch (e) {
      console.error('[websiteAnalytics] live:', e.response?.data || e.message);
      res.status(502).json({ success: false, message: 'PostHog query failed' });
    }
  });
};

module.exports.classifySource = classifySource;
module.exports.normalizePageKey = normalizePageKey;
