import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navigation from './src/routes/Navigation';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import { requestUserPermission } from './src/utils/PushNotification';
import CustomAlert, { showAlert } from './src/Component/CustomAlert';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LanguageProvider } from './src/context/LanguageContext';

// Override global Alert.alert to render our CustomAlert component globally
const originalAlert = Alert.alert;
Alert.alert = (title, message, buttons, options) => {
  if (!buttons || buttons.length === 0 || (buttons.length === 1 && buttons[0].style !== 'cancel')) {
    const type = (title && (
      title.toLowerCase().includes('success') || 
      title.toLowerCase().includes('copied') || 
      title.toLowerCase().includes('booking')
    )) ? 'success' : 'error';
    const onClose = (buttons && buttons[0]?.onPress) ? buttons[0].onPress : undefined;
    const buttonText = (buttons && buttons[0]?.text) ? buttons[0].text : 'OK';
    
    showAlert(title || 'Alert', message || '', type, onClose, buttonText);
  } else {
    originalAlert(title, message, buttons, options);
  }
};

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