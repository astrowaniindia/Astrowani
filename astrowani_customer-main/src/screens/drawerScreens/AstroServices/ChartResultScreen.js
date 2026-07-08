import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';

export default function ChartResultScreen({route}) {
  const {data} = route.params || {};
  return (
    <ScrollView style={styles.main} contentContainerStyle={{paddingVertical: verticalScale(15)}}>
      {data?.chartSvg ? (
        <View style={styles.svgCard}>
          <SvgXml xml={data.chartSvg} width="100%" height={340} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  svgCard: {
    backgroundColor: COLORS.white, borderRadius: 12, marginHorizontal: scale(15),
    marginBottom: verticalScale(14), padding: scale(10), alignItems: 'center',
  },
});
