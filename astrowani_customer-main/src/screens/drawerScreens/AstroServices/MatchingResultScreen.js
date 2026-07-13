import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';
import {LanguageContext} from '../../../context/LanguageContext';

export default function MatchingResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title={t('result.ashtakootMatching')} data={data?.ashtakoot} />
      <ReportResultView title={t('result.dashakootMatching')} data={data?.dashakoot} />
      <ReportResultView title={t('result.aggregateCompatibility')} data={data?.aggregate} />
      <ReportResultView title={t('result.boysMangalDosh')} data={data?.boyMangalDosh} />
      <ReportResultView title={t('result.girlsMangalDosh')} data={data?.girlMangalDosh} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
