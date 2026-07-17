import {StyleSheet, Text, View} from 'react-native';
import React from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import NavigationScreen from './src/routes/NavigationScreen';
import CustomAlert from './src/utils/CustomAlert';
// Side-effect import — registers FCM foreground/background/token-refresh handlers.
// Without this import the whole file is dead code and no push handling runs at all.
import './src/utils/Firebase';

const App = () => {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <NavigationScreen />
      <CustomAlert />
    </GestureHandlerRootView>
  );
};

export default App;

const styles = StyleSheet.create({});
