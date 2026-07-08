import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';

export default function DashaResultScreen({route}) {
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title="Current Mahadasha" data={data?.currentMahadashaFull} />
      <ReportResultView title="Mahadasha Timeline" data={data?.mahadasha} />
      <ReportResultView title="Yogini Dasha (Main)" data={data?.yoginiDashaMain} />
      <ReportResultView title="Yogini Dasha (Sub)" data={data?.yoginiDashaSub} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
