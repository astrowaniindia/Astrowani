import { getUser, onAuthChange } from './session.js?v=72';
import { sanitiseProps, scrubEvent } from './analytics-scrub.js?v=72';

/**
 * Product analytics for the website — PostHog, the SAME PROJECT as both apps.
 *
 * WHY POSTHOG AND NOT GOOGLE ANALYTICS, since a generic SEO checklist always
 * says GA4. Three reasons, and the first two are the decisive ones:
 *
 *  1. The Privacy Policy already names PostHog ("PostHog (app and website usage
 *     analytics, linked to your account ID)") and names no Google Analytics.
 *     Adding GA4 means a policy edit on a live page; adding PostHog meant one
 *     word.
 *  2. The admin dashboard IS PostHog. postHogRoutes.js, journeyRoutes.js,
 *     birdEyeRoutes.js, freeCallAnalyticsRoutes.js and the "Excluded from
 *     analytics" feature all query this project. GA4 numbers would land in a
 *     console nobody on this project opens.
 *  3. The customer app already has a 270-name event vocabulary across 395 call
 *     sites. The website is a second SURFACE on the same funnel, not a separate
 *     product, so it reuses those names (see track() below).
 *
 * THE SUPER PROPERTIES ARE NOT DECORATION. Every HogQL query in the admin
 * backend filters `environment = 'production'`, so an event that arrives
 * without it is invisible to every chart on the dashboard — the app lost 873
 * events that way before super properties were introduced there. And the
 * inverse is just as expensive: the app spent two weeks counting emulator
 * sessions as real traffic, which moved the measured call-failure rate from
 * 9.7% to 14.3% with no visible sign that anything was wrong. So `environment`
 * is decided from the HOSTNAME, synchronously, before the first event, and the
 * stored override may only ever DOWNGRADE production to test — never promote a
 * developer's machine to production.
 *
 * `app: 'website'` is what keeps the two surfaces apart inside one project. The
 * apps register `app: 'customer'` / `'astrologer'`; without this the website
 * would silently inflate every app funnel it shares an event name with.
 *
 * NOTHING HERE MAY EVER BREAK THE PAGE. The SDK is loaded lazily, after load
 * and on an idle callback, so it is never on the critical path; every public
 * function swallows its own errors; and a failed load leaves the site exactly
 * the site it was, with track() calls going into a bounded queue that is simply
 * never flushed.
 */

// Real Project API Key, the same one both apps ship. Safe to hardcode: it is
// write-only for event ingestion, the same trust level as the Sentry DSN. Read
// access uses a Personal API Key that exists only in the VPS environment — see
// astrowani-backend/src/postHogRoutes.js.
const POSTHOG_KEY = 'phc_xheDnkQ5TTg5BsjemUVoJyosxqF9hjJQiuyvo6boxetJ';
const POSTHOG_HOST = 'https://us.i.posthog.com';

// ── Environment ────────────────────────────────────────────────────────────────

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', ''];

// shop.astrowani.com/test-site IS the live website, whatever the path is called,
// so it reports 'production'. Only a developer machine reports 'test'. This is
// also why the eventual move to astrowani.com needs no change here.
const BUILD_ENVIRONMENT = LOCAL_HOSTNAMES.includes(location.hostname) ? 'test' : 'production';

const ENV_OVERRIDE_KEY = 'aw_analytics_env';

function resolveEnvironment() {
  let stored = null;
  try {
    stored = localStorage.getItem(ENV_OVERRIDE_KEY);
  } catch (_) {
    // Private browsing or blocked site data. The build default is correct.
  }
  // DOWNGRADE ONLY. Setting this to 'test' in devtools lets someone QA the live
  // site without contaminating production numbers. The reverse — a stored value
  // promoting a local build to 'production' — is the exact mistake that cost the
  // app two weeks of inflated figures, so it is not possible here.
  return stored === 'test' ? 'test' : BUILD_ENVIRONMENT;
}

const ENVIRONMENT = resolveEnvironment();

// ── The SDK, loaded late ───────────────────────────────────────────────────────

let posthog = null;
let loading = null;

// Bounded: a page that calls track() while offline must not grow an array
// forever. 50 events is far more than any single page view produces.
const QUEUE_LIMIT = 50;
const queue = [];

function flushQueue() {
  while (queue.length) {
    const [name, props] = queue.shift();
    try {
      posthog.capture(name, props);
    } catch (_) {}
  }
}

function load() {
  if (posthog || loading) return loading;
  // The filename carries the version, so this import needs no ?v= and
  // aw/bump-version.js deliberately does not rewrite it.
  loading = import('./vendor/posthog-1.438.12.js')
    .then((module) => {
      const client = module.posthog || module.default;
      client.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // Manual events only, exactly like the apps. Autocapture records the
        // text of whatever was clicked, which on this site can be an
        // astrologer's name or a value the visitor typed.
        autocapture: false,
        // We send $pageview ourselves, after the page name is known.
        capture_pageview: false,
        capture_pageleave: true,
        disable_session_recording: true,
        disable_surveys: true,
        // No /decide call: no feature flags, no surveys, and — with the
        // no-external build — nothing fetched from us-assets.i.posthog.com. The
        // site has no other third-party script host and this keeps it that way.
        // `advanced_disable_flags` is the current name; the SDK warns that
        // `advanced_disable_decide` is deprecated and will be removed in a major
        // version. Both are passed so the intent survives either way.
        advanced_disable_flags: true,
        advanced_disable_feature_flags: true,
        disable_external_dependency_loading: true,
        persistence: 'localStorage+cookie',
        // Pure, and tested in Node — see aw/analytics-scrub.js and its test.
        before_send: (event) =>
          scrubEvent(event, { base: location.origin, warn: (m) => console.warn(m) }),
      });
      client.register({ app: 'website', environment: ENVIRONMENT });
      posthog = client;
      identifyFromSession();
      flushQueue();
      return client;
    })
    .catch((err) => {
      loading = null;
      console.warn('[aw/analytics] PostHog failed to load:', err && err.message);
      return null;
    });
  return loading;
}

function whenIdle(fn) {
  const idle = window.requestIdleCallback;
  if (typeof idle === 'function') idle(fn, { timeout: 3000 });
  else setTimeout(fn, 200);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * One event. Prefer a name the customer app already uses — `recharge_started`,
 * `chat_initiated`, `call_connected`, `login_completed` — so the existing
 * funnels pick the website up as a surface instead of needing their own charts.
 * Safe to call before the SDK has loaded, and safe to call if it never does.
 */
export function track(name, props) {
  if (!name) return;
  try {
    const clean = sanitiseProps(props);
    if (posthog) posthog.capture(name, clean);
    else if (queue.length < QUEUE_LIMIT) queue.push([name, clean]);
  } catch (_) {}
}

/** The page itself. Called by initAnalytics(); call it again only on a real SPA-style change. */
export function trackPageview(extra) {
  track('$pageview', { ...pageProps(), ...(extra || {}) });
}

function pageProps() {
  let page = 'index';
  try {
    const path = location.pathname;
    const file = path.endsWith('/') ? 'index.html' : path.split('/').pop() || 'index.html';
    page = file.endsWith('.html') ? file.slice(0, -5) : file;
    if (!page) page = 'index';
  } catch (_) {}
  let lang = 'en';
  try {
    lang = (document.documentElement.lang || 'en').toLowerCase().startsWith('hi') ? 'hi' : 'en';
  } catch (_) {}
  return { page, page_key: pageKey(), page_type: pageType(), page_path: safePath(), site_language: lang, device_class: deviceClass() };
}

// ── Website analytics (Admin -> Website Analytics) ─────────────────────────────
// ONE stable name per page, the same rule as the Play Store tag in script.js
// (awWebPageKey) minus its `web_` prefix, so "which page brought installs" and
// "which page gets traffic" use the same key. Articles, profiles and stories
// collapse to one key each; the individual one is in page_path.
function pageKey() {
  try {
    let p = (location.pathname || '/').toLowerCase().replace(/^\/hi(?=\/|$)/, '') || '/';
    if (is404()) return '404';
    if (p === '/' || p === '/index.html') return 'home';
    if (/^\/blog\/./.test(p) || p === '/blog-post.html') return 'blog_article';
    if (/^\/astrologers\/./.test(p)) return 'astrologer_profile';
    if (/^\/stories\/./.test(p)) return 'story';
    const key = p.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/g, '_');
    return key.slice(0, 60) || 'home';
  } catch (_) {
    return 'unknown';
  }
}

// Which LAYOUT the visitor saw: the site switches to its phone layout below
// 960px, but tablets and small laptops in between still read as desktop for a
// click map. 768 is the line the heatmap draws its two columns on.
function deviceClass() {
  try { return window.innerWidth < 768 ? 'mobile' : 'desktop'; } catch (_) { return 'desktop'; }
}

// A CSS selector for the clicked element, built from ids, stable classes and
// positions only — never from text — so the admin's click map can find the
// same element again on the live page (aw/heatmap-view.js) at ANY screen width.
// State classes that come and go (open, active, hover effects) are skipped, or
// the same button would split into several entries.
const UNSTABLE_CLASS = /^(active|open|is-|has-|nav-drop-open|show|visible|hidden|tilt|magnetic|reveal|in-view|aw-)/;
function cssSelector(el) {
  try {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && node !== document.body && depth < 8; depth++) {
      const tag = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) { parts.unshift(`#${node.id}`); break; }
      const astro = node.getAttribute('data-astro-id');
      if (astro && /^[0-9a-f-]{36}$/i.test(astro) && node.classList.contains('astro-card')) {
        parts.unshift(`.astro-card[data-astro-id="${astro}"]`);
        break;
      }
      const classes = Array.from(node.classList).filter((c) => !UNSTABLE_CLASS.test(c) && /^[A-Za-z][\w-]*$/.test(c)).slice(0, 2);
      let part = tag + classes.map((c) => `.${c}`).join('');
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      // Stop at the first selector that names exactly this element: short
      // selectors survive the 120-character property limit in analytics-scrub.
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) break; } catch (_) {}
      node = parent;
    }
    const out = parts.join(' > ');
    return out.length <= 120 ? out : '';
  } catch (_) {
    return '';
  }
}

function pageType() {
  const k = pageKey();
  if (k === 'home') return 'home';
  if (k === '404') return 'not_found';
  if (k === 'blog_article' || k === 'blog') return 'blog';
  if (k === 'astrologer_profile' || k === 'astrologers' || k === 'consult') return 'astrologers';
  if (k === 'story') return 'story';
  if (/calculator$|^calculators$/.test(k)) return 'calculator';
  if (/horoscope$|^horoscope$|compatibility$|^panchang$/.test(k)) return 'horoscope';
  if (/^(privacy_policy|term_conditions|refund_cancellation|delete_account|child_safety|safety_guidelines|report_vulnerability|terms_and_conditions|refund_cancellation)$/.test(k)) return 'legal';
  if (/^(chat|call|wallet|account|history)/.test(k)) return 'account';
  return 'content';
}

// The page's own address, without the query string. Paths on this site are
// public content addresses (an article slug, an astrologer slug), never anything
// personal — the personal pages (wallet, chat) carry their ids in the query.
function safePath() {
  try { return (location.pathname || '/').slice(0, 120); } catch (_) { return '/'; }
}

function is404() {
  try { return /page not found/i.test(document.title || ''); } catch (_) { return false; }
}

// Where this visit came from. The URL scrub drops every query parameter that is
// not a content selector, utm_* included, so the campaign tags are copied onto
// the pageview as plain properties here instead (they are labels we or an ad
// network chose, never personal).
function sourceProps() {
  const out = {};
  try {
    const q = new URLSearchParams(location.search);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = q.get(k);
      if (v) out[k] = v.slice(0, 80);
    }
    if (q.get('gclid') || q.get('gbraid') || q.get('wbraid')) out.ad_click = 'google';
    if (q.get('fbclid')) out.ad_click = out.ad_click || 'meta';
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.host !== location.host) out.came_from = ref.host.replace(/^www\./, '');
  } catch (_) {}
  return out;
}

// A short, readable label for a clicked element. Never from anything that can
// hold the visitor's own details (the signed-in nav, form fields), and a long
// run of digits is blanked rather than sent, in case a number was typed into
// something that looks like a button.
function clickLabel(el) {
  try {
    if (el.closest('.nav-login, .ch-nav-login, [data-aw-nav-signup], [data-aw-private], form input, textarea')) return '(account)';
    const raw = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.textContent || '';
    const label = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (/\d{6,}/.test(label.replace(/\s/g, ''))) return '(number)';
    return label || (el.querySelector('img') ? '(image)' : '(unlabelled)');
  } catch (_) {
    return '(unlabelled)';
  }
}

// Which block of the page a click came from: the nearest element with an id,
// else the nearest section's heading. Lets the report say "hero" vs "footer".
function clickSection(el) {
  try {
    if (el.closest('header, nav, #site-nav, .ch-nav')) return 'nav';
    if (el.closest('footer')) return 'footer';
    const withId = el.closest('[id]');
    if (withId && withId.id && !/^(content|main)$/.test(withId.id)) return withId.id.slice(0, 40);
    const sec = el.closest('section, .band, .block');
    const h = sec && sec.querySelector('h1, h2, h3');
    if (h) return h.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
  } catch (_) {}
  return 'page';
}

function clickTarget(link) {
  try {
    const url = new URL(link.getAttribute('href'), location.href);
    if (url.protocol === 'tel:') return { target_kind: 'phone_link' };
    if (url.protocol === 'mailto:') return { target_kind: 'email_link' };
    if (url.host === location.host) {
      if (url.pathname === location.pathname && url.hash) return { target_kind: 'anchor', target: url.hash.slice(0, 60) };
      return { target_kind: 'internal', target: url.pathname.slice(0, 120) };
    }
    return { target_kind: 'outbound', target: url.host.replace(/^www\./, '') };
  } catch (_) {
    return { target_kind: 'unknown' };
  }
}

/**
 * Everything a visitor does on a page, in a handful of generic events, so the
 * website report needs no per-feature instrumentation to stay complete:
 *   web_click        every link / button / tab tap (label, section, target)
 *   web_scroll       25 / 50 / 75 / 100 % of the page reached
 *   web_page_engaged on leaving: seconds the tab was actually visible + deepest scroll
 *   web_form_submit  any form submitted (which form, never its values)
 *   web_js_error     a script error on the page (site health)
 * Autocapture stays OFF on purpose: it would record field values and the
 * signed-in nav. These carry only labels, positions and our own addresses.
 */
function wireWebsiteTracking() {
  const base = () => ({ page_key: pageKey(), page_type: pageType(), device_class: deviceClass() });

  document.addEventListener('click', (e) => {
    try {
      const el = e.target.closest && e.target.closest('a[href], button, [role="button"], [role="tab"], summary, input[type="submit"], input[type="button"], label[for]');
      if (!el) return;
      const props = { ...base(), element: el.tagName.toLowerCase(), label: clickLabel(el), section: clickSection(el) };
      // Where on the element, as fractions of its box, plus where on the page:
      // what the click map needs to put the marker on the exact spot.
      const sel = cssSelector(el);
      if (sel) props.sel = sel;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        props.rx = Math.round(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) * 100) / 100;
        props.ry = Math.round(Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) * 100) / 100;
      }
      const docH = Math.max(1, document.documentElement.scrollHeight);
      props.page_y = Math.round(((window.scrollY + e.clientY) / docH) * 1000) / 1000;
      if (el.tagName === 'A') Object.assign(props, clickTarget(el));
      const action = el.getAttribute('data-aw-action');
      if (action) props.action = action.slice(0, 30);
      if (el.closest('.astro-card')) props.in_astrologer_card = true;
      track('web_click', props);
    } catch (_) {}
  }, true);

  let maxScroll = 0;
  const marks = [25, 50, 75, 100];
  const sent = new Set();
  const onScroll = () => {
    try {
      const doc = document.documentElement;
      const total = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = Math.min(100, Math.round((window.scrollY / total) * 100));
      if (pct > maxScroll) maxScroll = pct;
      for (const m of marks) {
        if (pct >= m && !sent.has(m)) { sent.add(m); track('web_scroll', { ...base(), depth: m }); }
      }
    } catch (_) {}
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Visible time only: a tab left open in the background is not reading.
  let visibleMs = 0;
  let since = document.visibilityState === 'visible' ? Date.now() : 0;
  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    if (since) visibleMs += Date.now() - since;
    since = 0;
    const seconds = Math.round(visibleMs / 1000);
    if (seconds < 1) return;
    trackNow('web_page_engaged', { ...base(), seconds: Math.min(seconds, 3600), max_scroll: maxScroll });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (since) { visibleMs += Date.now() - since; since = 0; }
    } else if (!reported) {
      since = Date.now();
    }
  });
  window.addEventListener('pagehide', report);

  document.addEventListener('submit', (e) => {
    try {
      const f = e.target;
      const form = (f.getAttribute('id') || f.getAttribute('data-act') || f.getAttribute('aria-label') || f.className || 'form').toString().slice(0, 40);
      track('web_form_submit', { ...base(), form, section: clickSection(f) });
    } catch (_) {}
  }, true);

  let errors = 0;
  window.addEventListener('error', (e) => {
    try {
      if (errors++ >= 5) return; // one broken page must not flood the project
      const file = e.filename ? String(e.filename).split('?')[0].split('/').pop() : '';
      track('web_js_error', { ...base(), err: String(e.message || 'error').slice(0, 120), file, line: e.lineno || 0 });
    } catch (_) {}
  });
}

// For the leave-the-page event: hand it to the SDK with the beacon transport,
// which is the one transport that survives the page going away.
function trackNow(name, props) {
  try {
    const clean = sanitiseProps(props);
    if (posthog) posthog.capture(name, clean, { transport: 'sendBeacon' });
  } catch (_) {}
}

/**
 * Tie this browser to the customer's account, using the SAME distinct_id the
 * apps use — the customer UUID from identifyCustomer() in the app's
 * utils/Analytics.js. That identity is the whole point of one project: a visitor
 * who recharges on the website and consults in the app is ONE person, the
 * journey dashboards join across both, and the "Excluded from analytics" list
 * covers their website activity too once they are signed in.
 */
export function identifyFromSession() {
  try {
    const user = getUser();
    if (posthog && user && user.id) posthog.identify(String(user.id), { role: 'customer' });
  } catch (_) {}
}

/** Called once per page from bootScreen(). */
export function initAnalytics() {
  // The admin's click map loads real pages with ?aw_heatmap=1 inside its own
  // frame; an admin looking at a page must never be counted as a visitor.
  try {
    if (new URLSearchParams(location.search).has('aw_heatmap')) return;
  } catch (_) {}
  try {
    onAuthChange(({ user }) => {
      try {
        if (user && user.id) {
          identifyFromSession();
        } else if (posthog) {
          // Signed out: stop attributing this browser to that account.
          posthog.reset();
        }
      } catch (_) {}
    });

    // Queued now, sent as soon as the SDK is up. Doing it this way rather than
    // waiting for the load means a visitor who leaves during the idle window is
    // still counted, which is most of a bounce rate.
    trackPageview(sourceProps());

    wireDelegatedClicks();
    wireWebsiteTracking();

    if (document.readyState === 'complete') whenIdle(load);
    else window.addEventListener('load', () => whenIdle(load), { once: true });
  } catch (e) {
    console.warn('[aw/analytics] init failed:', e && e.message);
  }
}

/**
 * The two clicks worth measuring that live OUTSIDE the aw/ modules.
 *
 * script.js is a classic script, not an ES module, so it cannot import track()
 * — and the store link appears on 181 pages. One delegated listener here is
 * cheaper than a global bridge onto window and keeps every call site in this
 * file. Note the honest limitation: both of these are followed by a navigation,
 * so an event queued before the SDK has finished loading is lost. PostHog
 * flushes on pagehide, which covers the normal case; a click in the first few
 * hundred milliseconds of a cold page is not counted.
 */
function wireDelegatedClicks() {
  document.addEventListener(
    'click',
    (e) => {
      try {
        const link = e.target.closest && e.target.closest('a[href]');
        if (link) {
          const href = link.getAttribute('href') || '';
          if (href.includes('play.google.com')) track('app_store_click', { store: 'play' });
          else if (href.includes('apps.apple.com')) track('app_store_click', { store: 'apple' });
        }
        const lang = e.target.closest && e.target.closest('.nav-util-btn[data-role="lang"]');
        if (lang) {
          const current = document.documentElement.getAttribute('data-lang') === 'hi' ? 'hi' : 'en';
          track('language_toggled', { from: current, to: current === 'hi' ? 'en' : 'hi' });
        }
      } catch (_) {}
    },
    true,
  );
}
