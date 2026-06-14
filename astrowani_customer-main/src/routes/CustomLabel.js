import React from 'react';
import {Text, StyleSheet} from 'react-native';

import {COLORS} from '../Theme/Colors'; // Adjust import path as needed
import {moderateScale} from '../utils/Scaling';

const CustomLabel = ({label}) => {
  return <Text style={styles.label}>{label}</Text>;
};

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Lato-Regular', // Replace with your custom font
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
  },
});

export default CustomLabel;
