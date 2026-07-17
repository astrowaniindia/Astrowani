
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, PermissionsAndroid } from 'react-native';
import { supabase } from '../api/SupabaseClient';
// import PushNotification from 'react-native-push-notification';
// import { navigationRef } from '../common/component/NavigationService';

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
  if (Platform.OS === 'ios') {
    /* PushNotification.localNotification({
      title: remoteMessage.notification.title,
      message: remoteMessage.notification.body,
    }); */
  }
  // updateNotificationCount();
})

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background remoteMessage:', remoteMessage);
  // updateNotificationCount();
});


messaging().getInitialNotification().then(remoteMessage => {
  if (remoteMessage) {
    console.log('Initial remoteMessage:', remoteMessage);
    // Ensure the navigationRef is properly defined and used
    // navigationRef.current?.navigate('Notification');
  }
})