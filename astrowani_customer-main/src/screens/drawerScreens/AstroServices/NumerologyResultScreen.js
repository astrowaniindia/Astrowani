import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {NumerologyNumbers, InfoSection} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function NumerologyResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main}>
      <ReportShell title={t('result.loshuGrid')} subtitle="Your numbers and their strengths">
        {/* loshu-grid returns radical/destiny/kua/psychic/lifePath numbers plus
            planePercentages — tiles for the numbers, bars for the percentages. */}
        <NumerologyNumbers data={data?.loshuGrid} title={t('result.loshuGrid')} />
        <InfoSection title={t('result.nameAnalysis')} data={data?.nameAnalysis} glyph="✎" />
        <InfoSection title={t('result.mobileAnalysis')} data={data?.mobileAnalysis} glyph="☎" />
        <InfoSection title={t('result.luckyThings')} data={data?.luckyThings} glyph="★" />
        <InfoSection title={t('result.personalYear')} data={data?.personalYear} glyph="◷" />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
