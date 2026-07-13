import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';
import {LanguageContext} from '../../../context/LanguageContext';

export default function DoshResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title={t('result.mangalDosh')} data={data?.mangalDosh} />
      <ReportResultView title={t('result.kaalsarpDosh')} data={data?.kaalsarpDosh} />
      <ReportResultView title={t('result.manglikDosh')} data={data?.manglikDosh} />
      <ReportResultView title={t('result.pitraDosh')} data={data?.pitraDosh} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
