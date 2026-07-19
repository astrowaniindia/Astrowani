
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';
import PushNotification from 'react-native-push-notification';
import Instance from '../api/ApiCall';
import { navigate } from './NavigationService';

const CHANNEL_ID = 'astrowani-default';

PushNotification.configure({
  onNotification: function () {},
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
  // updateNotificationCount();
});


function handleNotificationTap(remoteMessage) {
  const type = remoteMessage?.data?.type;
  if (type === 'admin_broadcast' || type === 'admin_personal') {
    navigate('NotificationScreen');
  } else if (type === 'voice_note') {
    navigate('VoiceNotes');
  } else if (type === 'report_delivered') {
    navigate('MyOrders');
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