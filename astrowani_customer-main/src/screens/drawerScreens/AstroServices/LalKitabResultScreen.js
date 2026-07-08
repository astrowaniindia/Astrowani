import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';

export default function LalKitabResultScreen({route}) {
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title="Lal Kitab Horoscope" data={data?.horoscope} />
      <ReportResultView title="Lal Kitab Debts" data={data?.debts} />
      <ReportResultView title="Lal Kitab Remedies" data={data?.remedies} />
      <ReportResultView title="Lal Kitab Houses" data={data?.houses} />
      <ReportResultView title="Lal Kitab Planets" data={data?.planets} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
