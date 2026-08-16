import React from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';
import {moderateScale} from '../../../utils/Scaling';
import {ASTRO, ReportShell, SectionCard, Callout} from '../../../components/astro/AstroUI';
import ZoomableChart from '../../../components/astro/ZoomableChart';

// Divisional charts are identified by their D-number (d1, d9, …); show which
// one this is rather than an unlabelled square, since the whole point of the
// report is choosing a specific division. The one-line purpose is included
// because "Chaturthamsa" alone tells a non-astrologer nothing about what they
// just paid for.
const DIVISIONS = {
  d1: ['Lagna (Rashi)', 'The main birth chart — the whole life at a glance'],
  d3: ['Drekkana', 'Siblings, courage and initiative'],
  d4: ['Chaturthamsa', 'Property, home and inner contentment'],
  d6: ['Shashtamsa', 'Health, illness and obstacles'],
  d7: ['Saptamsa', 'Children and progeny'],
  d8: ['Ashtamsa', 'Longevity and sudden events'],
  d9: ['Navamsa', 'Marriage, dharma and the strength behind every planet'],
  d10: ['Dasamsa', 'Career, profession and public standing'],
  d12: ['Dwadasamsa', 'Parents and ancestry'],
  d16: ['Shodasamsa', 'Vehicles, comforts and luxuries'],
  d20: ['Vimsamsa', 'Spiritual practice and devotion'],
  d24: ['Chaturvimsamsa', 'Education and learning'],
  d27: ['Bhamsa', 'Overall strength and weakness'],
  d30: ['Trimsamsa', 'Misfortune and moral character'],
  d40: ['Khavedamsa', 'Maternal legacy and auspiciousness'],
  d45: ['Akshavedamsa', 'Paternal legacy and conduct'],
  d60: ['Shashtiamsa', 'Past-life karma — the finest division'],
  sun: ['Sun Chart', 'The chart cast from the Sun'],
  moon: ['Moon Chart', 'The chart cast from the Moon'],
  bhav_chalit_chart: ['Bhav Chalit', 'True house positions of the planets'],
  transit_chart: ['Transit', 'Where the planets are today'],
};

export default function ChartResultScreen({route}) {
  const {data} = route.params || {};
  const div = String(data?.division || '').toLowerCase();
  const [name, purpose] = DIVISIONS[div] || [div ? div.toUpperCase() : 'Chart', null];

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title={name} subtitle={div ? `Divisional chart · ${div.toUpperCase()}` : undefined}>
        <SectionCard title={name} glyph="✧" subtitle={div ? div.toUpperCase() : undefined} index={0}>
          {!!purpose && <Callout icon="sparkles">{purpose}</Callout>}
          {data?.chartSvg ? (
            <ZoomableChart svg={data.chartSvg} title={name} />
          ) : (
            <Text style={styles.empty}>This chart could not be generated. Please try again.</Text>
          )}
        </SectionCard>
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  empty: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.muted},
});
