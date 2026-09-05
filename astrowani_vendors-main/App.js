import {StyleSheet, Text, View} from 'react-native';
import React from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import NavigationScreen from './src/routes/NavigationScreen';
import CustomAlert from './src/utils/CustomAlert';
import {LanguageProvider} from './src/context/LanguageContext';
import ErrorBoundary from './src/components/ErrorBoundary';
// Side-effect import — registers FCM foreground/background/token-refresh handlers.
// Without this import the whole file is dead code and no push handling runs at all.
import './src/utils/Firebase';

const App = () => {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{flex: 1}}>
        <LanguageProvider>
          {/* Root boundary. Until now the only ErrorBoundary in this app wrapped
              CustomDrawer (NavigationScreen.js), so an uncaught render error in any
              of the ~50 screens was a permanent white screen recoverable only by
              reinstalling.

              Placement is load-bearing: INSIDE LanguageProvider so the fallback
              renders in the astrologer's own language, and INSIDE
              GestureHandlerRootView so its buttons are actually tappable.

              `isRoot` hides the "Go to dashboard" action — this boundary wraps the
              navigator itself, so when it catches, there is no navigator left to
              navigate with. */}
          <ErrorBoundary name="AppRoot" isRoot>
            <NavigationScreen />
          </ErrorBoundary>
          <CustomAlert />
        </LanguageProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

export default App;

const styles = StyleSheet.create({});
