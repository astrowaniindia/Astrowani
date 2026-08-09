import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import ReusableList from '../component/ReusableList';

const Allastrologers = ({actionButton, handleAstrologer, data, refreshing, onRefresh}) => {
  return (
    <ReusableList
      data={data}
      buttonType="chat"
      handleAstrologer={handleAstrologer}
      actionButton={actionButton}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
};

export default Allastrologers;
