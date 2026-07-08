import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';

export default function MatchingResultScreen({route}) {
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title="Ashtakoot Matching" data={data?.ashtakoot} />
      <ReportResultView title="Dashakoot Matching" data={data?.dashakoot} />
      <ReportResultView title="Aggregate Compatibility" data={data?.aggregate} />
      <ReportResultView title="Boy's Mangal Dosh" data={data?.boyMangalDosh} />
      <ReportResultView title="Girl's Mangal Dosh" data={data?.girlMangalDosh} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
