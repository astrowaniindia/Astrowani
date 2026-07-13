import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';
import {LanguageContext} from '../../../context/LanguageContext';

export default function NumerologyResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title={t('result.loshuGrid')} data={data?.loshuGrid} />
      <ReportResultView title={t('result.nameAnalysis')} data={data?.nameAnalysis} />
      <ReportResultView title={t('result.mobileAnalysis')} data={data?.mobileAnalysis} />
      <ReportResultView title={t('result.luckyThings')} data={data?.luckyThings} />
      <ReportResultView title={t('result.personalYear')} data={data?.personalYear} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
