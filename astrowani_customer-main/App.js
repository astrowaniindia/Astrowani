import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navigation from './src/routes/Navigation';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import { requestUserPermission } from './src/utils/PushNotification';
import CustomAlert from './src/Component/CustomAlert';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);

  useEffect(() => {
    const bootstrapAsync = async () => {
      let token;
      try {
        token = await AsyncStorage.getItem('token');
      } catch (e) {
        // Restoring token failed
        console.log('Failed to get token from AsyncStorage', e);
      }

      // Request FCM token
      const fcmToken = await requestUserPermission();
      if (fcmToken) {
        await AsyncStorage.setItem('fcmToken', fcmToken);
        console.log('FCM Token stored:', fcmToken);
      } else {
        console.log('FCM Token not obtained');
      }

      // After restoring token, we may need to validate it in production apps

      // This will switch to the App screen or Auth screen and this loading
      // screen will be unmounted and thrown away.
      setUserToken(token);
      setIsLoading(false);
    };

    bootstrapAsync();
  }, []);

  if (isLoading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Navigation initialRoute={userToken ? 'DrawerNavigator' : 'Login'} />
        <CustomAlert />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

export default App;