import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {scale, moderateScale} from '../../../utils/Scaling';
import {ASTRO, ReportShell, SectionCard} from '../../../components/astro/AstroUI';

// Divisional charts are identified by their D-number (d1, d9, …); show which
// one this is rather than an unlabelled square, since the whole point of the
// report is choosing a specific division.
const DIVISION_NAMES = {
  d1: 'Lagna (Rashi)', d3: 'Drekkana', d4: 'Chaturthamsa', d6: 'Shashtamsa',
  d7: 'Saptamsa', d8: 'Ashtamsa', d9: 'Navamsa', d10: 'Dasamsa', d12: 'Dwadasamsa',
  d16: 'Shodasamsa', d20: 'Vimsamsa', d24: 'Chaturvimsamsa', d27: 'Bhamsa',
  d30: 'Trimsamsa', d40: 'Khavedamsa', d45: 'Akshavedamsa', d60: 'Shashtiamsa',
  sun: 'Sun Chart', moon: 'Moon Chart',
  bhav_chalit_chart: 'Bhav Chalit', transit_chart: 'Transit',
};

export default function ChartResultScreen({route}) {
  const {data} = route.params || {};
  const div = String(data?.division || '').toLowerCase();
  const name = DIVISION_NAMES[div] || (div ? div.toUpperCase() : 'Chart');

  return (
    <ScrollView style={styles.main}>
      <ReportShell title={name} subtitle={div ? `Divisional chart · ${div.toUpperCase()}` : undefined}>
        {data?.chartSvg ? (
          <SectionCard title={name} glyph="✧">
            <View style={styles.chartWrap}>
              <SvgXml xml={data.chartSvg} width="100%" height={moderateScale(340)} />
            </View>
          </SectionCard>
        ) : (
          <SectionCard title="Chart" glyph="✧">
            <Text style={styles.empty}>This chart could not be generated. Please try again.</Text>
          </SectionCard>
        )}
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  chartWrap: {alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: scale(6)},
  empty: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.muted},
});
