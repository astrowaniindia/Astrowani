import {StyleSheet, Text, View} from 'react-native';
import React from 'react';
import NavigationScreen from './src/routes/NavigationScreen';
import CustomAlert from './src/utils/CustomAlert';

const App = () => {
  return (
    <>
      <NavigationScreen />
      <CustomAlert />
    </>
  );
};

export default App;

const styles = StyleSheet.create({});
