import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';
import {LanguageContext} from '../../../context/LanguageContext';

export default function LalKitabResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title={t('result.lalKitabHoroscope')} data={data?.horoscope} />
      <ReportResultView title={t('result.lalKitabDebts')} data={data?.debts} />
      <ReportResultView title={t('result.lalKitabRemedies')} data={data?.remedies} />
      <ReportResultView title={t('result.lalKitabHouses')} data={data?.houses} />
      <ReportResultView title={t('result.lalKitabPlanets')} data={data?.planets} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
