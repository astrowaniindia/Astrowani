// Product analytics (PostHog) — screen views + user identification for the vendor app.
// Mirrors CrashReporting.js: a Project API Key hardcoded here is fine, it's write-only for
// event ingestion (same trust level as the Sentry DSN above it). Server-side read access uses
// a separate, narrowly-scoped Personal API Key that never ships in either app — see
// astrowani-backend/src/postHogRoutes.js.
import PostHog from 'posthog-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../api/SupabaseClient';

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

export function identifyVendor(astrologerId) {
  if (!astrologerId) return;
  try {
    posthog.identify(String(astrologerId), { role: 'vendor' });
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
// Derived from the BUILD synchronously at module load, not from an awaited network
// read. See the long explanation in the customer app's Analytics.js: starting at
// 'test' and waiting on app_settings meant the first $screen of every launch was
// mistagged and permanently invisible, and a failed read discarded the whole
// session. Same admin toggle (app_settings.analytics_environment) still drives both
// apps; it just can no longer be the difference between a real session being counted
// and being thrown away.
const BUILD_ENVIRONMENT = typeof __DEV__ !== 'undefined' && __DEV__ ? 'test' : 'production';
const ENV_CACHE_KEY = 'analytics_environment_cached';

let currentEnvironment = BUILD_ENVIRONMENT;
export function getAnalyticsEnvironment() {
  return currentEnvironment;
}

function normalizeEnv(value) {
  return value === 'production' ? 'production' : value === 'test' ? 'test' : null;
}

// Super properties, so app + environment ride on EVERY event — including PostHog's own
// lifecycle events ('Application Opened' / 'Backgrounded' / 'Installed'), which pass
// through neither captureEvent() nor the navigation autocapture's routeToProperties and
// were therefore arriving with no environment at all, invisible to every dashboard
// query that filters on it. See the customer app's Analytics.js for the measured numbers.
function applyEnvironmentSuperProperties() {
  try {
    posthog.register({ app: 'vendor', environment: currentEnvironment });
  } catch (_) {}
}
applyEnvironmentSuperProperties();

export async function loadAnalyticsEnvironment() {
  // Cached last-known remote value first (fast, works offline), authoritative remote
  // value second. A failed read keeps whatever we already have — never 'test'.
  try {
    const cached = normalizeEnv(await AsyncStorage.getItem(ENV_CACHE_KEY));
    if (cached) { currentEnvironment = cached; applyEnvironmentSuperProperties(); }
  } catch (_) {}

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

// Business events — the starter set. Always tags `app: 'vendor'` so events are
// distinguishable from the customer app inside one shared PostHog project.
export function captureEvent(name, properties = {}) {
  try {
    posthog.capture(name, { app: 'vendor', environment: currentEnvironment, ...properties });
  } catch (_) {}
}

// Session replay is OFF by default and controlled entirely from the admin dashboard's
// Analytics page (session_replay_enabled / session_replay_sample_rate in app_settings, a
// public-read table). Reads Supabase directly rather than adding a bespoke backend
// endpoint. Call once per app launch; the sample-rate coin flip happens locally so PostHog
// never sees which users were excluded. Masking of text inputs/images is on by default in
// the SDK, so OTP and profile screens are safe without extra config here.
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
