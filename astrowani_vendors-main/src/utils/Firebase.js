
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, PermissionsAndroid } from 'react-native';
import { supabase } from '../api/SupabaseClient';
import { displayIncomingRequestNotification } from './incomingRequestNotifications';
// import PushNotification from 'react-native-push-notification';
// import { navigationRef } from '../common/component/NavigationService';

const INCOMING_REQUEST_TYPES = ['incoming_call', 'incoming_video_call', 'chat_request'];

// Registration.js saves fcm_token once, at signup — but it's never refreshed after that,
// so most vendor devices end up with a stale/missing token by the time push actually
// matters. This keeps astrologers.fcm_token current on every login and token rotation.
async function syncTokenWithBackend(token) {
  try {
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId || !token) return;
    await supabase.from('astrologers').update({ fcm_token: token }).eq('id', astroId);
  } catch (e) {
    console.log('Error syncing FCM token:', e);
  }
}

export const getFCMToken = async () => {
  try {
    let fcmToken = await AsyncStorage.getItem('fcmToken');
    if (!fcmToken) {
      fcmToken = await messaging().getToken();
      if (fcmToken) {
        await AsyncStorage.setItem('fcmToken', fcmToken);
      }
    }
    console.log('FCM Token:', fcmToken);
    await syncTokenWithBackend(fcmToken);
    return fcmToken;
  } catch (error) {
    console.log('Error getting FCM token:', error);
  }
};

messaging().onTokenRefresh(async token => {
  await AsyncStorage.setItem('fcmToken', token);
  await syncTokenWithBackend(token);
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
messaging().onMessage(async remoteMessage => {
  console.log('Foreground remoteMessage:', remoteMessage);
  const data = remoteMessage?.data || {};
  if (INCOMING_REQUEST_TYPES.includes(data.type)) {
    // HomeScreen's own socket/Realtime listener already shows the in-app popup while it's
    // mounted and foregrounded — this heads-up notification covers every other screen too
    // (e.g. vendor is on Profile/Wallet when a request comes in).
    await displayIncomingRequestNotification(data);
  }
})

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background remoteMessage:', remoteMessage);
  const data = remoteMessage?.data || {};
  if (INCOMING_REQUEST_TYPES.includes(data.type)) {
    await displayIncomingRequestNotification(data);
  }
});


messaging().getInitialNotification().then(remoteMessage => {
  if (remoteMessage) {
    console.log('Initial remoteMessage:', remoteMessage);
    // Ensure the navigationRef is properly defined and used
    // navigationRef.current?.navigate('Notification');
  }
})