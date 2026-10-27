
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, PermissionsAndroid, AppState } from 'react-native';
import Instance from '../api/ApiCall';
import { getDeviceId } from './deviceId';
import { hideOngoingSession } from './ongoingSession';
import { displayIncomingRequestNotification, cancelIncomingRequestForKey, displayGenericNotification, titleFor } from './incomingRequestNotifications';
import { startRingingService, stopRingingService } from './ringingForegroundService';
// import PushNotification from 'react-native-push-notification';
// import { navigationRef } from '../common/component/NavigationService';

// Silence the modular deprecation warning from Firebase. Set here, at module scope, so it
// covers every messaging() call in this file (including the module-level handlers below) —
// it used to live inside Registration.js's own getFCMToken, where it only covered that one
// call site and disappeared when that copy was removed.
global.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;

const INCOMING_REQUEST_TYPES = ['incoming_call', 'incoming_video_call', 'chat_request'];
const CANCEL_REQUEST_TYPE = 'cancel_incoming_request';
// Sent by sessionManager.terminateSession to the astrologer's device when a session ends.
const SESSION_ENDED_TYPE = 'session_ended';

// Registration.js saves fcm_token once, at signup — but it's never refreshed after that,
// so most vendor devices end up with a stale/missing token by the time push actually
// matters. This keeps the token current on every login and token rotation.
//
// Goes through the backend (2026-09-11), never Supabase directly: a direct write needed
// the public key to be able to UPDATE fcm_token on ANY astrologer, which let anyone
// holding the key redirect someone else's incoming-call pushes. The backend takes the
// astrologer from our JWT. Not signed in yet → skip; login sends the token itself.
async function syncTokenWithBackend(token) {
  try {
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken || !token) return;
    const deviceId = await getDeviceId();
    await Instance.post(
      '/api/vendor/fcm-token',
      { fcmToken: token, deviceId, platform: Platform.OS },
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
  } catch (e) {
    console.log('Error syncing FCM token:', e?.message);
  }
}

/**
 * iOS ONLY, and it is what makes push work there at all. On iOS an FCM token cannot
 * exist until APNs has handed the device its own token, which arrives asynchronously
 * after the permission dialog is answered. `getToken()` called before then throws,
 * and this function used to catch that and give up -- leaving a phone that had
 * granted notifications and simply never told the backend a token existed. Same fix,
 * same reason, as the customer app's utils/PushNotification.js (2026-10-24).
 */
async function ensureRegisteredForRemoteMessages() {
  if (Platform.OS !== 'ios') return;
  try {
    if (!messaging().isDeviceRegisteredForRemoteMessages) {
      await messaging().registerDeviceForRemoteMessages();
    }
  } catch (e) {
    console.log('registerDeviceForRemoteMessages failed:', e?.message);
  }
}

const TOKEN_RETRY_DELAYS_MS = [0, 1500, 4000, 10000, 15000];

export const getFCMToken = async (attempt = 0) => {
  try {
    // ASK FIREBASE, DO NOT TRUST THE CACHE. This used to return the AsyncStorage
    // value whenever one existed and never call getToken() again, which meant a
    // token that CHANGED was never picked up -- the backend kept pushing to the old
    // one forever. Firebase caches the token natively, so getToken() is cheap and is
    // the only thing that can tell us it changed.
    //
    // A dead token is invisible from the server: FCM ACCEPTS a send to a
    // known-but-stale token and reports success, and Apple then drops it. Nothing
    // errors, push_success reads 1, and no notification arrives. The customer app had
    // the same weakness in a milder form (it did call getToken, but only at launch);
    // this copy was worse. Fixed 2026-10-27 alongside it.
    await ensureRegisteredForRemoteMessages();
    let fcmToken = await messaging().getToken();
    if (!fcmToken) {
      // Only now fall back to whatever was stored, so a transient getToken failure
      // does not lose a token that was working a moment ago.
      fcmToken = await AsyncStorage.getItem('fcmToken');
    }
    if (fcmToken) {
      await AsyncStorage.setItem('fcmToken', fcmToken);
    }
    if (!fcmToken) throw new Error('empty token');
    console.log('FCM Token:', fcmToken);
    await syncTokenWithBackend(fcmToken);
    return fcmToken;
  } catch (error) {
    const next = attempt + 1;
    if (next < TOKEN_RETRY_DELAYS_MS.length) {
      console.log(`FCM token not ready (${error?.message}) — retry ${next}`);
      setTimeout(() => { getFCMToken(next).catch(() => {}); }, TOKEN_RETRY_DELAYS_MS[next]);
      return null;
    }
    console.log('Error getting FCM token:', error);
  }
};

messaging().onTokenRefresh(async token => {
  await AsyncStorage.setItem('fcmToken', token);
  await syncTokenWithBackend(token);
});

// Re-sync on every foreground, same as the customer app. onTokenRefresh alone cannot
// cover the launch where the app is new to the device and has already read its token
// before anything was listening -- which is exactly what a reinstall looks like.
// Throttled, because an astrologer switching between apps during a consultation must
// not generate a write per switch.
let lastTokenSyncAt = 0;
AppState.addEventListener('change', (state) => {
  if (state !== 'active') return;
  if (Date.now() - lastTokenSyncAt < 60000) return;
  lastTokenSyncAt = Date.now();
  getFCMToken().catch(() => {});
});

export async function requestUserPermission() {
  if (Platform.OS == 'android' && Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (granted == PermissionsAndroid.RESULTS.GRANTED) {
      getFCMToken()
    } else {
      console.log('Permission Denied');
    }
  } else {
    const authStatus = await messaging().requestPermission();
    const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    // await messaging().registerDeviceForRemoteMessages();
    if (enabled) {
      console.log('Authorization status:', authStatus);
      // await messaging().registerDeviceForRemoteMessages();
      getFCMToken()
    }
  }
}
// 'app_update' / 'app_review' come from the admin's App Prompts page
// (astrowani-backend/src/appPromptRoutes.js). They are plain informational
// notifications and render through the same generic path as an admin broadcast —
// data-only, so they reach this handler and get our large icon instead of being
// auto-displayed by the OS.
const ADMIN_NOTIFICATION_TYPES = ['admin_broadcast', 'admin_personal', 'app_update', 'app_review'];

messaging().onMessage(async remoteMessage => {
  console.log('Foreground remoteMessage:', remoteMessage);
  const data = remoteMessage?.data || {};
  if (INCOMING_REQUEST_TYPES.includes(data.type)) {
    // HomeScreen's own socket/Realtime listener already shows the in-app request card while
    // it's mounted and foregrounded — this heads-up notification covers every other screen
    // too (e.g. vendor is on Profile/Wallet when a request comes in).
    //
    // foreground: true — onMessage only fires with the app open, so the process is alive and
    // incomingRingtone.js can ring. Using the silent channel here avoids the notification's
    // own sound landing on top of that ringtone.
    await displayIncomingRequestNotification(data, { foreground: true });
  } else if (data.type === CANCEL_REQUEST_TYPE) {
    // Customer gave up (timeout/cancel) before we acted — pull down the now-stale notification.
    await cancelIncomingRequestForKey(data);
  } else if (data.type === SESSION_ENDED_TYPE) {
    // The server ended a chat/call/live while this app was away — clear its ongoing notification.
    await hideOngoingSession(data.sessionId);
  } else if (ADMIN_NOTIFICATION_TYPES.includes(data.type)) {
    // Sent as data-only (see backend notificationRoutes.js) specifically so it reaches this
    // handler instead of being silently auto-displayed by the OS without our large icon.
    await displayGenericNotification(data);
  }
})

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background remoteMessage:', remoteMessage);
  const data = remoteMessage?.data || {};
  if (INCOMING_REQUEST_TYPES.includes(data.type)) {
    // No `foreground` flag: this handler runs backgrounded or in a KILLED app.
    await displayIncomingRequestNotification(data);
    // The REAL phone ringtone, kept alive by a native foreground service — see
    // ringingForegroundService.js for why this can't just be incomingRingtone.js here:
    // Android can reclaim this process moments after this handler returns, which would
    // silently cut a JS-driven ringtone along with it. Fire-and-forget: never block
    // showing the notification above on this.
    //
    // requestDataJson carries the full request payload so the persistent overlay banner
    // can pass it back to JS when the astrologer taps Accept/Reject on the overlay.
    const callType = data.type === 'incoming_video_call' ? 'video'
                   : data.type === 'incoming_call' ? 'audio' : 'chat';
    const requestDataJson = JSON.stringify({
      table: data.type === 'chat_request' ? 'chat_requests' : 'call_requests',
      callType,
      callerId: data.callerId || '',
      callerName: data.callerName || '',
      roomId: data.roomId || '',
      sessionId: data.sessionId || '',
      token: data.token || '',
    });
    startRingingService(
      titleFor(data.type),
      data.callerName ? `From ${data.callerName}` : undefined,
      requestDataJson,
    ).catch(() => {});
  } else if (data.type === CANCEL_REQUEST_TYPE) {
    await cancelIncomingRequestForKey(data);
    // The customer gave up before we acted — stop the real ringtone the same way the
    // notification itself gets pulled down.
    stopRingingService().catch(() => {});
  } else if (data.type === SESSION_ENDED_TYPE) {
    await hideOngoingSession(data.sessionId);
  } else if (ADMIN_NOTIFICATION_TYPES.includes(data.type)) {
    await displayGenericNotification(data);
  }
});


messaging().getInitialNotification().then(remoteMessage => {
  if (remoteMessage) {
    console.log('Initial remoteMessage:', remoteMessage);
    // Ensure the navigationRef is properly defined and used
    // navigationRef.current?.navigate('Notification');
  }
})