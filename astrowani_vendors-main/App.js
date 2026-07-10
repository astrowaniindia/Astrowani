import {StyleSheet, Text, View} from 'react-native';
import React from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import NavigationScreen from './src/routes/NavigationScreen';
import CustomAlert from './src/utils/CustomAlert';

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
