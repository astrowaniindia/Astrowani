import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';

export default function NumerologyResultScreen({route}) {
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title="Loshu Grid" data={data?.loshuGrid} />
      <ReportResultView title="Name Analysis" data={data?.nameAnalysis} />
      <ReportResultView title="Mobile Number Analysis" data={data?.mobileAnalysis} />
      <ReportResultView title="Lucky Things" data={data?.luckyThings} />
      <ReportResultView title="Personal Year" data={data?.personalYear} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
