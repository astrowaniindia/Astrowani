/**
 * @format
 */
import 'react-native-gesture-handler';

// Polyfill TextEncoder/TextDecoder for Supabase Realtime
import { TextEncoder, TextDecoder } from 'text-encoding';
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

import {AppRegistry} from 'react-native';
import {HotUpdater} from '@hot-updater/react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee, {EventType} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {acceptRequest, rejectRequest} from './src/utils/incomingRequestActions';
import {cancelIncomingRequestNotification} from './src/utils/incomingRequestNotifications';
import {navigationRef} from './src/utils/navigationRef';
import {initCrashReporting} from './src/utils/CrashReporting';
// Importing this initializes the PostHog client as a module-level singleton (see
// src/utils/Analytics.js) — no separate init call needed here, just ensures it's
// constructed before the app tree mounts.
import './src/utils/Analytics';
import {initCallKeep} from './src/utils/callKeep';

initCrashReporting();

// iOS CallKit + PushKit. Registered here, outside the component tree, for exactly the
// same reason notifee.onBackgroundEvent below is: when a VoIP push wakes a KILLED app,
// the native events are replayed as soon as listeners attach, so those listeners must
// exist before the app tree mounts. Registering inside a component would miss the one
// case this feature exists for — answering a call on an app that was not running.
// No-op on Android, which keeps using the FCM + notifee + foreground-service path.
initCallKeep();

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

// Must be registered outside the component tree (Notifee requirement) so presses are
// handled even when the app process was killed and briefly woken to run this.
notifee.onBackgroundEvent(handleNotificationAction);
// The foreground half. Without this, the buttons are dead whenever the app is open.
notifee.onForegroundEvent(handleNotificationAction);

// OTA updates (JS-only fixes ship without a Play Store release) — see
// "MD files/deployment-and-releases.md". Edge function deployed via `npx hot-updater init`
// on 2026-08-05, backed by the "hot-updater-storage-for-astrowani-vendor" Supabase bucket.
const WrappedApp = HotUpdater.wrap({
  baseURL: 'https://fxpoustnddrgumhwdcma.supabase.co/functions/v1/update-server',
  updateStrategy: 'appVersion',
})(App);

AppRegistry.registerComponent(appName, () => WrappedApp);
