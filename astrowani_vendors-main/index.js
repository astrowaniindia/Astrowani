/**
 * @format
 */
import 'react-native-gesture-handler';

// Polyfill TextEncoder/TextDecoder for Supabase Realtime
import { TextEncoder, TextDecoder } from 'text-encoding';
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee, {EventType} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {acceptRequest, rejectRequest} from './src/utils/incomingRequestActions';
import {cancelIncomingRequestNotification} from './src/utils/incomingRequestNotifications';

// Must be registered outside the component tree (Notifee requirement) so Accept/Reject
// presses are handled even when the app process was killed and briefly woken to run this.
notifee.onBackgroundEvent(async ({type, detail}) => {
  if (type !== EventType.ACTION_PRESS) return;
  const req = detail.notification?.data || {};
  const pressActionId = detail.pressAction?.id;

  try {
    if (pressActionId === 'reject') {
      await rejectRequest(req);
    } else if (pressActionId === 'accept') {
      const result = await acceptRequest(req);
      if (result.ok) {
        // Consumed once on next app foreground/launch (see NavigationScreen.js) — Accept's
        // launchActivity brings the app forward, but a fresh cold start still needs to know
        // where to navigate.
        const screen =
          req.callType === 'video' ? 'VideoCall' : req.callType === 'chat' ? 'VendorChatSession' : 'AudioCall';
        await AsyncStorage.setItem(
          'pendingCallNavigation',
          JSON.stringify({screen, params: result.navigationParams}),
        );
      }
    }
  } catch (e) {
    console.warn('[notifee background event] action handling error:', e.message);
  } finally {
    await cancelIncomingRequestNotification(detail.notification?.id);
  }
});

AppRegistry.registerComponent(appName, () => App);
