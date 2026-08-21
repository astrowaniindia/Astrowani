
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';
import PushNotification from 'react-native-push-notification';
import Instance from '../api/ApiCall';
import { navigate, navigationRef } from './NavigationService';

const CHANNEL_ID = 'astrowani-default';

// Tracks which astrologer's chat (if any) the customer currently has open, so a chat-message
// push for that same conversation can be suppressed while they're already looking at it live
// via Supabase Realtime — set/cleared by ChatSessionScreen.js on mount/unmount. Still shows the
// notification normally for any other conversation, or once this chat is closed/backgrounded.
let activeChatAstrologerId = null;
export function setActiveChatAstrologerId(id) {
  activeChatAstrologerId = id || null;
}

PushNotification.configure({
  // Local notifications built by showLocalNotification() (including the ones raised from
  // setBackgroundMessageHandler below) fire this on tap instead of FCM's own
  // onNotificationOpenedApp/getInitialNotification — those only cover notifications the OS
  // auto-displayed, not ones our own JS constructed. userInfo carries the original data payload.
  onNotification: function (notification) {
    handleNotificationTap({ data: notification?.userInfo || {} });
  },
  popInitialNotification: true,
  requestPermissions: false, // permission is requested explicitly via requestUserPermission()
});

PushNotification.createChannel(
  {
    channelId: CHANNEL_ID,
    channelName: 'Astrowani Notifications',
    importance: 4, // IMPORTANCE_HIGH
    vibrate: true,
  },
  () => {},
);

function showLocalNotification(remoteMessage) {
  const title = remoteMessage?.notification?.title || remoteMessage?.data?.title;
  const message = remoteMessage?.notification?.body || remoteMessage?.data?.body;
  if (!message) return;
  PushNotification.localNotification({
    channelId: CHANNEL_ID,
    smallIcon: 'ic_notification',
    // App logo in the notification's large-icon slot (top-right corner) — mipmap resource
    // already bundled for the launcher icon, no extra asset needed.
    largeIcon: 'ic_launcher',
    title,
    message,
    userInfo: remoteMessage?.data || {},
  });
}

// Sends the current FCM token to the backend so it can push to this device later.
// Silently no-ops if the user isn't logged in yet — OTP verification also sends the
// token directly as part of its own request.
async function syncTokenWithBackend(token) {
  try {
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken || !token) return;
    await Instance.post(
      '/api/users/fcm-token',
      { fcmToken: token },
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
  } catch (_) {
    // best-effort — a missed sync just means push arrives once the token next refreshes
  }
}

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
const getFCMToken = async () => {
  try {
    let token = await messaging().getToken();
    await AsyncStorage.setItem('fcmToken', token);
    console.log('FCM Token:', token);
    await syncTokenWithBackend(token);
  } catch (error) {
    console.error('Error fetching FCM Token:', error);
  }
};

messaging().onTokenRefresh(async token => {
  await AsyncStorage.setItem('fcmToken', token);
  await syncTokenWithBackend(token);
});

messaging().onMessage(async remoteMessage => {
  console.log('Foreground remoteMessage:', remoteMessage);

  // Customer is already looking at this exact conversation live via Realtime — a system
  // notification for the same message on top of that is just noise. Any other chat, or once
  // this one is closed/backgrounded, still notifies normally (setBackgroundMessageHandler
  // below is unaffected — the app can't be foregrounded on this chat while backgrounded).
  const isOpenChatMessage =
    remoteMessage?.data?.type === 'chat_message' &&
    activeChatAstrologerId &&
    remoteMessage?.data?.astrologerId === activeChatAstrologerId;
  if (isOpenChatMessage) return;

  // Android/iOS both need a manual local notification while the app is foregrounded —
  // FCM only auto-displays the system-tray notification when the app is backgrounded/killed.
  showLocalNotification(remoteMessage);

  // Handle incoming call notifications
  if (remoteMessage?.data?.type === 'incoming_call') {
    console.log('Incoming call notification received in foreground');
    // This will be handled by the VoiceCallScreen component
    // The component should listen for this message and show the incoming call UI
  }

  // updateNotificationCount();
})

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background remoteMessage:', remoteMessage);
  // Admin broadcasts/personal notifications arrive as data-only (see backend
  // notificationRoutes.js) specifically so they land here even when the app is
  // backgrounded/killed, showing our own notification (with the logo) instead of
  // nothing — a notification-block message would auto-display via the OS but skip
  // this handler entirely, and skip the large icon along with it.
  showLocalNotification(remoteMessage);
});


// Tapping the persistent "call/chat still in progress" notification (see
// activeSessionNotification.js) must land back on the live session, not the app's normal
// start screen — the OS's default "bring app to front" only resumes the right screen if
// the app process survived the background; if Android killed it, a plain foreground-bring
// re-mounts fresh at the initial route with no memory of where the customer was. Storing
// the target here and consuming it in Navigation.js (on ready + on next foreground) covers
// both cases, same pattern as the vendor app's pendingCallNavigation for notification Accept.
async function handleActiveSessionTap(data) {
  const params = (() => { try { return JSON.parse(data.params || '{}'); } catch (_) { return {}; } })();
  if (navigationRef.isReady()) {
    navigationRef.navigate(data.screen, params);
  } else {
    await AsyncStorage.setItem('pendingSessionNavigation', JSON.stringify({ screen: data.screen, params }));
  }
}

function handleNotificationTap(remoteMessage) {
  const type = remoteMessage?.data?.type;
  if (type === 'admin_broadcast' || type === 'admin_personal') {
    navigate('NotificationScreen');
  } else if (type === 'voice_note') {
    navigate('VoiceNotes');
  } else if (type === 'report_delivered' || type === 'order_update') {
    // 'order_update' is the shipped / out-for-delivery / delivered / cancelled push sent
    // from the admin Orders page (adminRoutes.js STATUS_PUSH). Same destination as a
    // delivered report — My Orders is where the tracking timeline lives.
    navigate('MyOrders');
  } else if (type === 'active_session') {
    handleActiveSessionTap(remoteMessage.data);
  }
}

messaging().getInitialNotification().then(remoteMessage => {
  if (remoteMessage) {
    console.log('Initial remoteMessage:', remoteMessage);
    handleNotificationTap(remoteMessage);
  }
})

// Handle incoming call notifications
messaging().onNotificationOpenedApp(remoteMessage => {
  console.log('Notification opened from background:', remoteMessage);
  if (remoteMessage?.data?.type === 'incoming_call') {
    console.log('Incoming call notification opened');
  } else {
    handleNotificationTap(remoteMessage);
  }
});