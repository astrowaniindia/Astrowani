import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';

const DetailList = ({title, data}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView contentContainerStyle={styles.scrollViewContainer}>
        {data.map((item, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.value}>{item.value}</Text>
            {item.extra && <Text style={styles.extra}>{item.extra}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default DetailList;

const styles = StyleSheet.create({
  container: {
    padding: scale(15),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center', // Align items vertically in the center
    paddingVertical: verticalScale(8),
    borderBottomWidth: verticalScale(1),
    borderBottomColor: COLORS.AntiFlash,
  },
  label: {
    fontFamily: 'Lato-Bold',
    color: '#000',
    fontSize: moderateScale(13),
    borderRightWidth: scale(1),
    borderRightColor: COLORS.AntiFlash,
    width: scale(100),
  },
  value: {
    flex: 1,
    fontFamily: 'Lato-Regular',

    color: '#000',
    paddingLeft: scale(20),
    fontSize: moderateScale(13),
  },
  extra: {
    flex: 1,
    fontFamily: 'Lato-Regular',

    borderLeftWidth: scale(1),
    borderLeftColor: COLORS.AntiFlash,
    color: '#000',
    paddingLeft: scale(20),
    fontSize: moderateScale(13),
  },
  sectionTitle: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    borderTopRightRadius: moderateScale(10),
    borderTopLeftRadius: moderateScale(10),
    textAlign: 'center',
    paddingVertical: verticalScale(10),
    backgroundColor: COLORS.lightTurquoise,
  },
  scrollViewContainer: {
    padding: scale(10),
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: moderateScale(8),
    borderBottomRightRadius: moderateScale(8),
  },
});
