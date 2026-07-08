import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';

export default function DoshResultScreen({route}) {
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      <ReportResultView title="Mangal Dosh" data={data?.mangalDosh} />
      <ReportResultView title="Kaalsarp Dosh" data={data?.kaalsarpDosh} />
      <ReportResultView title="Manglik Dosh" data={data?.manglikDosh} />
      <ReportResultView title="Pitra Dosh" data={data?.pitraDosh} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
});
