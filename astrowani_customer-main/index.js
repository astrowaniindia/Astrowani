/**
 * @format
 */

// Polyfill TextEncoder/TextDecoder for Supabase Realtime.
//
// These two statements must run BEFORE anything that touches Supabase. They did not
// used to: ES `import`s are hoisted and evaluated before any statement in the file, so
// when App and its module graph were imported below, they all evaluated before these
// assignments. Requiring the app graph inside the try block further down fixes that
// ordering as a side effect — require() runs where it is written, not hoisted.
import { TextEncoder, TextDecoder } from 'text-encoding';
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

import React from 'react';
import { AppRegistry, ScrollView, Text } from 'react-native';
import { name as appName } from './app.json';

// EVERYTHING ELSE IS REQUIRED INSIDE A TRY, ON PURPOSE.
//
// Ported from the vendor app (astrowani_vendors-main/index.js), where the first iOS
// build opened to a black screen with the process alive and NOTHING in Sentry. That
// combination is diagnostic on its own: ES imports are hoisted and evaluated before any
// statement, so the whole graph below — App, and through it Firebase, navigation,
// payments — runs BEFORE initCrashReporting() can install Sentry's handler. A throw in
// any of it is therefore invisible to Sentry AND skips AppRegistry.registerComponent,
// leaving iOS with a live window and no root view. A black screen.
//
// require() inside a try/catch is evaluated where it is written rather than hoisted, so
// a failure is catchable and, more importantly, SHOWABLE. Registration happens either
// way: worst case the app renders the error instead of vanishing.
let startupError = null;
let App = null;

try {
  const { initCrashReporting } = require('./src/utils/CrashReporting');
  initCrashReporting(); // first, so anything after it reaches Sentry

  // Importing this initializes the PostHog client as a module-level singleton (see
  // src/utils/Analytics.js) — no separate init call needed, it just has to be
  // constructed before the app tree mounts.
  require('./src/utils/Analytics');

  App = require('./App').default;
} catch (e) {
  startupError = e;
  console.error('[startup] app failed to load:', e);
}

// Push wiring is deliberately SEPARATE from the block above: a failure here costs one
// feature, not the app, so it must not stop the app tree from loading.
//
// Registers messaging().setBackgroundMessageHandler (and the other FCM listeners). Must
// run from index.js, not just from App.js — when Android wakes the app for a
// background/killed-state FCM message it runs a minimal "headless JS" context that only
// executes index.js's top-level code, never the React component tree. Wiring this only
// via App.js meant the handler was never registered in that context ("No task registered
// for key ReactNativeFirebaseMessagingHeadlessTask") and every backgrounded push
// silently vanished. require() here still runs during index.js evaluation, so headless
// registration is unaffected by the move.
try {
  require('./src/utils/PushNotification');
} catch (e) {
  console.warn('[startup] push notifications unavailable:', e?.message || e);
}

/**
 * Shown instead of a black screen when the app graph above fails to load. Built with
 * React.createElement rather than JSX so it cannot itself depend on anything that may
 * be part of the failure.
 */
function StartupErrorScreen() {
  return React.createElement(
    ScrollView,
    { style: { flex: 1, backgroundColor: '#2b140c' }, contentContainerStyle: { padding: 20, paddingTop: 60 } },
    React.createElement(
      Text,
      { style: { color: '#FFD700', fontSize: 18, fontWeight: '700', marginBottom: 12 } },
      'Astrowani failed to start',
    ),
    React.createElement(
      Text,
      { style: { color: '#fff', fontSize: 13, marginBottom: 16 } },
      String(startupError?.message || startupError || 'Unknown error'),
    ),
    React.createElement(
      Text,
      { style: { color: 'rgba(255,255,255,0.65)', fontSize: 11 } },
      String(startupError?.stack || '').slice(0, 3000),
    ),
  );
}

// OTA updates (JS-only fixes ship without a store release) — see
// "MD files/deployment-and-releases.md". Edge function deployed via `npx hot-updater init`
// on 2026-08-05, backed by the "hot-updater-storage-for-astrowani" Supabase bucket.
//
// The OTA check wraps whatever we are about to render — the real app, or the error
// screen. That ordering is deliberate and load-bearing: wrapping App directly meant
// that if requiring App threw, the update check never ran and a startup crash could
// ONLY be fixed by a new store build. Wrapping the fallback too means a broken build
// can still pull a fixed bundle and heal itself on the next launch.
const RootComponent = App || StartupErrorScreen;
let WrappedApp = RootComponent;
try {
  const { HotUpdater } = require('@hot-updater/react-native');
  WrappedApp = HotUpdater.wrap({
    baseURL: 'https://fxpoustnddrgumhwdcma.supabase.co/functions/v1/update-server',
    updateStrategy: 'appVersion',
  })(RootComponent);
} catch (e) {
  // No OTA this launch, but the app still renders.
  console.warn('[startup] HotUpdater.wrap failed:', e?.message || e);
}

// Registration ALWAYS happens. Skipping it is what produced a black screen with a live
// process and nothing in Sentry.
AppRegistry.registerComponent(appName, () => WrappedApp);
