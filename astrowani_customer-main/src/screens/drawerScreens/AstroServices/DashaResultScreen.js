import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';
import {LanguageContext} from '../../../context/LanguageContext';

export default function DashaResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title={t('result.currentMahadasha')} data={data?.currentMahadashaFull} />
      <ReportResultView title={t('result.mahadashaTimeline')} data={data?.mahadasha} />
      <ReportResultView title={t('result.yoginiDashaMain')} data={data?.yoginiDashaMain} />
      <ReportResultView title={t('result.yoginiDashaSub')} data={data?.yoginiDashaSub} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
