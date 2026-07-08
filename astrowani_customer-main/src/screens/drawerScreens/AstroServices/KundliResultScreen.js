import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import ReportResultView from './ReportResultView';

export default function KundliResultScreen({route}) {
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      {data?.chartSvg ? (
        <View style={styles.svgCard}>
          <SvgXml xml={data.chartSvg} width="100%" height={300} />
        </View>
      ) : null}
      <ReportResultView title="Kundli Overview" data={data?.extendedKundali} />
      <ReportResultView title="Ascendant Report" data={data?.ascendantReport} />
      <ReportResultView title="Planet Details" data={data?.planetDetails} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  svgCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginHorizontal: scale(15),
    marginBottom: verticalScale(14),
    padding: scale(10),
    alignItems: 'center',
  },
});
