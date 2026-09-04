import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navigation from './src/routes/Navigation';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import IntroSplash from './src/screens/Splash/IntroSplash';
import { requestUserPermission } from './src/utils/PushNotification';
import CustomAlert, { showAlert } from './src/Component/CustomAlert';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LanguageProvider } from './src/context/LanguageContext';
import ErrorBoundary from './src/components/ErrorBoundary';

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
  // Gates on the intro animation's own onFinish, not a timer here, so the
  // animation always plays to completion even if the AsyncStorage bootstrap
  // below resolves first (the common case — a token read is near-instant).
  const [introDone, setIntroDone] = useState(false);

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

  if (isLoading || !introDone) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <IntroSplash onFinish={() => setIntroDone(true)} />
      </GestureHandlerRootView>
    );
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          {/* Root boundary. Inside LanguageProvider so the fallback renders in the
              customer's own language, and inside GestureHandlerRootView so the
              fallback's buttons are actually tappable.

              isRoot: this wraps the navigator itself, so a crash here means there is
              no navigator left to send anyone "home" with — the fallback offers only
              Retry. Screen-level boundaries mounted lower down should NOT pass it. */}
          <ErrorBoundary name="AppRoot" isRoot>
            <Navigation initialRoute={userToken ? 'DrawerNavigator' : 'Login'} />
          </ErrorBoundary>
          <CustomAlert />
        </GestureHandlerRootView>
      </LanguageProvider>
    </SafeAreaProvider>
  );
};

export default App;