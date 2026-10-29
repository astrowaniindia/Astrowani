import { getUser, onAuthChange } from './session.js?v=55';
import { sanitiseProps, scrubEvent } from './analytics-scrub.js?v=55';

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
  return { page, site_language: lang };
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
    trackPageview();

    wireDelegatedClicks();

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
