// Product analytics (PostHog) — screen views + user identification for the customer app.
// Mirrors CrashReporting.js: a Project API Key hardcoded here is fine, it's write-only for
// event ingestion (same trust level as the Sentry DSN above it). Server-side read access uses
// a separate, narrowly-scoped Personal API Key that never ships in either app — see
// astrowani-backend/src/postHogRoutes.js.
import PostHog from 'posthog-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';

// Real Project API Key — the PostHog project exists and is receiving events. Safe to
// hardcode: it is write-only for ingestion (same trust level as the Sentry DSN). The
// `disabled` guard below is a leftover safety net from when this was a placeholder; it
// stays because it costs nothing and correctly disables the SDK if the key is ever
// blanked out again.
const POSTHOG_API_KEY = 'phc_xheDnkQ5TTg5BsjemUVoJyosxqF9hjJQiuyvo6boxetJ';
const POSTHOG_HOST = 'https://us.i.posthog.com';

export const posthog = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
  disabled: POSTHOG_API_KEY.startsWith('REPLACE_WITH_'),
});

export function identifyCustomer(customerId) {
  if (!customerId) return;
  try {
    posthog.identify(String(customerId), { role: 'customer' });
  } catch (_) {
    // Analytics must never crash the app.
  }
}

export function resetAnalyticsIdentity() {
  try {
    posthog.reset();
  } catch (_) {}
}

// ── Environment tag ('test' | 'production') ─────────────────────────────────────
//
// Tagged onto every event. The admin dashboard's HogQL queries filter to
// 'production', so pre-launch testing (friends/family acting as astrologers) never
// contaminates real launch numbers.
//
// THIS USED TO START AT 'test' AND WAIT ON A NETWORK READ, WHICH LOST DATA.
// loadAnalyticsEnvironment() is an async Supabase fetch, but PostHog captures its
// first $screen the moment the navigator mounts — hundreds of milliseconds earlier.
// So the first screen view of every launch was tagged 'test' and became permanently
// invisible to every dashboard query. Worse, 'test' was also the *failure* default:
// an offline cold start or a failed app_settings read discarded that user's entire
// session, which preferentially dropped users on poor connections and silently
// deleted single-screen bounces — exactly the users retention analysis needs.
//
// The fix: environment is a property of the BUILD, known synchronously at module
// load, so there is no window where events are mistagged. A release build reports
// 'production' from its very first event; a debug build reports 'test'. The remote
// override still works and is still honoured, but it can now only *correct* an
// already-sane value instead of being the only thing standing between a real user
// and a discarded session — and a failed read leaves the build default in place.
const BUILD_ENVIRONMENT = typeof __DEV__ !== 'undefined' && __DEV__ ? 'test' : 'production';
const ENV_CACHE_KEY = 'analytics_environment_cached';

let currentEnvironment = BUILD_ENVIRONMENT;
export function getAnalyticsEnvironment() {
  return currentEnvironment;
}

function normalizeEnv(value) {
  return value === 'production' ? 'production' : value === 'test' ? 'test' : null;
}

// Register as SUPER PROPERTIES so every event carries app + environment, not just the
// ones we tag by hand. captureEvent() and the navigation autocapture's
// routeToProperties both set these explicitly, but PostHog's own lifecycle events
// ($screen aside — 'Application Opened', 'Application Backgrounded', 'Application
// Installed') go through neither, so they were arriving with no environment at all and
// were invisible to every dashboard query that filters on it. Measured against the
// live project: 873 events with a null environment. Super properties close that gap
// for anything added later too, instead of requiring each new call site to remember.
function applyEnvironmentSuperProperties() {
  try {
    posthog.register({ app: 'customer', environment: currentEnvironment });
  } catch (_) {}
}
applyEnvironmentSuperProperties();

export async function loadAnalyticsEnvironment() {
  // 1. Last known remote value, cached locally. Resolves in a few ms rather than a
  //    network round-trip, so a returning user is correctly tagged almost immediately
  //    even on a cold, offline start.
  try {
    const cached = normalizeEnv(await AsyncStorage.getItem(ENV_CACHE_KEY));
    if (cached) { currentEnvironment = cached; applyEnvironmentSuperProperties(); }
  } catch (_) {}

  // 2. Authoritative remote value. On failure we deliberately keep whatever we have
  //    (cache, else build default) — never fall back to 'test', which is what made a
  //    transient network error cost a whole session's worth of data.
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'analytics_environment')
      .limit(1);
    const remote = data && data.length ? normalizeEnv(data[0].value) : null;
    if (remote) {
      currentEnvironment = remote;
      applyEnvironmentSuperProperties();
      try {
        await AsyncStorage.setItem(ENV_CACHE_KEY, remote);
      } catch (_) {}
    }
  } catch (_) {
    // Analytics must never crash the app, and must never discard a session either.
  }
}

// Business events — the starter set. Always tags `app: 'customer'` so events are
// distinguishable from the vendor app inside one shared PostHog project.
export function captureEvent(name, properties = {}) {
  try {
    posthog.capture(name, { app: 'customer', environment: currentEnvironment, ...properties });
  } catch (_) {}
}

// Session replay is OFF by default and controlled entirely from the admin dashboard's
// Analytics page (session_replay_enabled / session_replay_sample_rate in app_settings, a
// public-read table). Reads Supabase directly rather than adding a bespoke backend
// endpoint — same pattern Navigation.js already uses for wallet_balance. Call once per app
// launch; the sample-rate coin flip happens locally so PostHog never sees which users were
// excluded. Masking of text inputs/images is on by default in the SDK, so OTP and profile
// screens are safe without extra config here.
export async function applySessionReplaySetting() {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['session_replay_enabled', 'session_replay_sample_rate']);
    const settings = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    const enabled = settings.session_replay_enabled === 'true';
    const sampleRate = Math.max(0, Math.min(1, Number(settings.session_replay_sample_rate) || 0));
    if (enabled && Math.random() < sampleRate) {
      await posthog.startSessionRecording();
    }
  } catch (_) {
    // Analytics must never crash the app.
  }
}
