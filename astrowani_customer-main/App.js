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

import { LanguageProvider } from './src/context/LanguageContext';

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);

  useEffect(() => {
    const bootstrapAsync = async () => {
      let token;
      try {
        token = await AsyncStorage.getItem('token');
      } catch (e) {
        console.log('Failed to get token from AsyncStorage', e);
      }

      const fcmToken = await requestUserPermission();
      if (fcmToken) {
        await AsyncStorage.setItem('fcmToken', fcmToken);
      }

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
      <LanguageProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Navigation initialRoute={userToken ? 'DrawerNavigator' : 'Login'} />
          <CustomAlert />
        </GestureHandlerRootView>
      </LanguageProvider>
    </SafeAreaProvider>
  );
};

export default App;