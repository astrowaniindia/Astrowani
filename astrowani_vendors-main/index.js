/**
 * @format
 */
import 'react-native-gesture-handler';

// Polyfill TextEncoder/TextDecoder for Supabase Realtime
import { TextEncoder, TextDecoder } from 'text-encoding';
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

import React from 'react';
import {AppRegistry, ScrollView, Text} from 'react-native';
import {name as appName} from './app.json';

// EVERYTHING ELSE IS REQUIRED INSIDE A TRY, ON PURPOSE.
//
// The first iOS build of this app opened to a black screen with the process alive
// and NOTHING in Sentry. That combination is diagnostic on its own: ES imports are
// hoisted and evaluated before any statement, so the whole graph below — App, and
// through it Firebase, navigation, CallKit, PushKit — runs BEFORE
// initCrashReporting() can install Sentry's handler. A throw in any of it is
// therefore invisible to Sentry AND skips AppRegistry.registerComponent, leaving
// iOS with a live window and no root view. A black screen.
//
// require() inside a try/catch is evaluated where it is written rather than
// hoisted, so a failure is catchable and, more importantly, SHOWABLE. Registration
// happens either way: worst case the app renders the error instead of vanishing.
let startupError = null;
let App = null;

try {
  const {initCrashReporting} = require('./src/utils/CrashReporting');
  initCrashReporting(); // first, so anything after it reaches Sentry

  require('./src/utils/Analytics'); // PostHog singleton, side-effect import

  App = require('./App').default;
} catch (e) {
  startupError = e;
  console.error('[startup] app failed to load:', e);
}

// Notification and CallKit wiring is deliberately SEPARATE from the block above: a
// failure here costs one feature, not the app, so it must not prevent the app tree
// from loading.
let notifee = null;
let EventType = null;
try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  EventType = notifeeModule.EventType;
} catch (e) {
  console.warn('[startup] notifee unavailable:', e?.message || e);
}

const AsyncStorage = (() => {
  try { return require('@react-native-async-storage/async-storage').default; } catch (_) { return null; }
})();
const {acceptRequest, rejectRequest} = (() => {
  try { return require('./src/utils/incomingRequestActions'); } catch (_) { return {}; }
})();
const {cancelIncomingRequestNotification} = (() => {
  try { return require('./src/utils/incomingRequestNotifications'); } catch (_) { return {}; }
})();
const {navigationRef} = (() => {
  try { return require('./src/utils/navigationRef'); } catch (_) { return {}; }
})();
const {initCallKeep} = (() => {
  try { return require('./src/utils/callKeep'); } catch (e) {
    console.warn('[startup] callKeep unavailable:', e?.message || e);
    return {};
  }
})();

// iOS CallKit + PushKit. Registered here, outside the component tree, for exactly the
// same reason notifee.onBackgroundEvent below is: when a VoIP push wakes a KILLED app,
// the native events are replayed as soon as listeners attach, so those listeners must
// exist before the app tree mounts. Registering inside a component would miss the one
// case this feature exists for — answering a call on an app that was not running.
// No-op on Android, which keeps using the FCM + notifee + foreground-service path.
// Guarded for the same reason as the notifee listeners below: CallKit/PushKit setup
// depends on entitlements a free-provisioned build does not carry, and a throw here
// would take the whole app down before it could register.
try {
  initCallKeep();
} catch (e) {
  console.warn('[startup] initCallKeep failed:', e?.message || e);
}

// Accept/Reject pressed on the incoming-request notification.
//
// Notifee splits delivery by app state: presses reach onBackgroundEvent when the app is
// backgrounded or killed, and onForegroundEvent when it is open. Only the background one
// was ever registered, so with the app in the foreground — which is the NORMAL state for
// an astrologer waiting on calls — pressing Accept or Reject did nothing at all. Accept's
// launchActivity merely pulled the app forward, and the astrologer had to press Accept a
// second time on the in-app popup. Both handlers now share this one function so they can
// never drift apart.
//
// Accepting from the notification does not leave the in-app popup stranded: HomeScreen's
// Realtime listener on call_requests/chat_requests dismisses on ANY status change away
// from 'pending', 'accepted' included.
const handleNotificationAction = async ({type, detail}) => {
  if (type !== EventType.ACTION_PRESS) return;
  const req = detail.notification?.data || {};
  const pressActionId = detail.pressAction?.id;

  try {
    if (pressActionId === 'reject') {
      await rejectRequest(req);
    } else if (pressActionId === 'accept') {
      const result = await acceptRequest(req);
      if (result.ok) {
        const screen =
          req.callType === 'video' ? 'VideoCall' : req.callType === 'chat' ? 'VendorChatSession' : 'AudioCall';
        // Try navigating right now — this JS context is alive whenever the app process wasn't
        // fully killed (backgrounded, or even still technically foregrounded under a pulled-down
        // notification shade), so navigationRef.current is already set and this fires instantly
        // without waiting on any lifecycle event. Confirmed on-device: a shade-pull Accept (app
        // never actually left 'active') never fires onReady OR an AppState transition, so relying
        // on those alone left the flag below permanently unconsumed.
        if (navigationRef.current?.isReady()) {
          navigationRef.current.navigate(screen, result.navigationParams);
        } else {
          // Truly cold/killed process — no live navigator yet. Consumed once on next app
          // foreground/launch (see NavigationScreen.js); Accept's launchActivity brings the
          // app forward, which triggers that consumption.
          await AsyncStorage.setItem(
            'pendingCallNavigation',
            JSON.stringify({screen, params: result.navigationParams}),
          );
        }
      }
    }
  } catch (e) {
    console.warn('[notifee background event] action handling error:', e.message);
  } finally {
    await cancelIncomingRequestNotification(detail.notification?.id);
  }
};

// NOTHING above AppRegistry.registerComponent may be allowed to throw. If it does,
// registration never runs and iOS shows a live app window with no root view — a
// black screen with the app apparently running, which is what the first vendor iOS
// build did. Losing a notification listener degrades one feature; losing
// registration loses the entire app, so every side effect here is isolated.
const safely = (label, fn) => {
  try {
    fn();
  } catch (e) {
    console.warn(`[startup] ${label} failed:`, e?.message || e);
  }
};

// Must be registered outside the component tree (Notifee requirement) so presses are
// handled even when the app process was killed and briefly woken to run this.
if (notifee) {
  safely('notifee.onBackgroundEvent', () => notifee.onBackgroundEvent(handleNotificationAction));
  // The foreground half. Without this, the buttons are dead whenever the app is open.
  safely('notifee.onForegroundEvent', () => notifee.onForegroundEvent(handleNotificationAction));
}

// Shown INSTEAD of a black screen when the app tree fails to load. A blank window
// tells you nothing and costs a ten-minute rebuild per guess; the message and stack
// name the failing module directly. Plain react-native primitives only — anything
// fancier could fail for the same reason the app just did.
function StartupErrorScreen() {
  return React.createElement(
    ScrollView,
    {style: {flex: 1, backgroundColor: '#2b140c'}, contentContainerStyle: {padding: 20, paddingTop: 60}},
    React.createElement(
      Text,
      {style: {color: '#FFD700', fontSize: 18, fontWeight: '700', marginBottom: 12}},
      'Astrowani failed to start',
    ),
    React.createElement(
      Text,
      {style: {color: '#fff', fontSize: 13, marginBottom: 16}},
      String(startupError?.message || startupError || 'Unknown error'),
    ),
    React.createElement(
      Text,
      {style: {color: 'rgba(255,255,255,0.65)', fontSize: 11}},
      String(startupError?.stack || '').slice(0, 3000),
    ),
  );
}

// The OTA check wraps whatever we are about to render — the real app, or the error
// screen. That ordering is deliberate and load-bearing: it used to wrap App on the
// line straight after require('./App'), so when that require threw, the update check
// never ran and a startup crash could ONLY be fixed by a new store/sideload build.
// Wrapping the fallback too means a broken build can still pull a fixed bundle and
// heal itself on the next launch.
const RootComponent = App || StartupErrorScreen;
let WrappedApp = RootComponent;
try {
  const {HotUpdater} = require('@hot-updater/react-native');
  WrappedApp = HotUpdater.wrap({
    baseURL: 'https://fxpoustnddrgumhwdcma.supabase.co/functions/v1/update-server',
    updateStrategy: 'appVersion',
  })(RootComponent);
} catch (e) {
  // No OTA this launch, but the app still renders.
  console.warn('[startup] HotUpdater.wrap failed:', e?.message || e);
}

// Registration ALWAYS happens. Skipping it is what produced a black screen with a
// live process and nothing in Sentry.
AppRegistry.registerComponent(appName, () => WrappedApp);
