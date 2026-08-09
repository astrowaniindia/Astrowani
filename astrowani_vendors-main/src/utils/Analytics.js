// Product analytics (PostHog) — screen views + user identification for the vendor app.
// Mirrors CrashReporting.js: a Project API Key hardcoded here is fine, it's write-only for
// event ingestion (same trust level as the Sentry DSN above it). Server-side read access uses
// a separate, narrowly-scoped Personal API Key that never ships in either app — see
// astrowani-backend/src/postHogRoutes.js.
import PostHog from 'posthog-react-native';
import {supabase} from '../api/SupabaseClient';

// TODO: replace with the real Project API Key once the PostHog project exists (see
// CLAUDE.md "Product Analytics (PostHog)" subsystem for what's needed and why).
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

// 'test' | 'production' — see the matching comment in the customer app's Analytics.js.
// Same admin toggle (app_settings.analytics_environment) drives both apps.
let currentEnvironment = 'test';
export function getAnalyticsEnvironment() {
  return currentEnvironment;
}

export async function loadAnalyticsEnvironment() {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'analytics_environment')
      .limit(1);
    if (data && data.length) currentEnvironment = data[0].value === 'production' ? 'production' : 'test';
  } catch (_) {
    // Analytics must never crash the app — stays 'test' on failure, which is the safe default.
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
