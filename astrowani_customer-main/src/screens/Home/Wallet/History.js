import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';

const History = ({navigation}) => {
  return (
    <View style={styles.container}>
      <Icon name="history" size={50} color="#800000" style={styles.icon} />
      <Text style={styles.noTransactionText}>No Transaction</Text>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.addMoneyButton}>
        <Text style={styles.addMoneyText}>Add Money</Text>
      </TouchableOpacity>
    </View>
  );
};

export default History;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  icon: {
    marginBottom: 10,
  },
  noTransactionText: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: '#333',
    marginBottom: verticalScale(15),
  },
  addMoneyButton: {
    backgroundColor: '#800000',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(25),
  },
  addMoneyText: {
    color: '#fff',
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
  },
});
