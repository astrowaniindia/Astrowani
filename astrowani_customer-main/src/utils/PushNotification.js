
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, PermissionsAndroid } from 'react-native';
// import PushNotification from 'react-native-push-notification';
// import { navigationRef } from '../common/component/NavigationService';

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
  } catch (error) {
    console.error('Error fetching FCM Token:', error);
  }
};
messaging().onMessage(async remoteMessage => {
  console.log('Foreground remoteMessage:', remoteMessage);
  if (Platform.OS === 'ios') {
    /* PushNotification.localNotification({
      title: remoteMessage.notification.title,
      message: remoteMessage.notification.body,
    }); */
  }

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


messaging().getInitialNotification().then(remoteMessage => {
  if (remoteMessage) {
    console.log('Initial remoteMessage:', remoteMessage);
    // Ensure the navigationRef is properly defined and used
    // navigationRef.current?.navigate('Notification');
  }
})

// Handle incoming call notifications
messaging().onNotificationOpenedApp(remoteMessage => {
  console.log('Notification opened from background:', remoteMessage);
  if (remoteMessage?.data?.type === 'incoming_call') {
    // Navigate to VoiceCallScreen with incoming call params
    // This would need to be handled in the component that has navigation access
    // For now, we'll log it and expect the app to handle it
    console.log('Incoming call notification opened');
  }
});