import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {
  NumerologyNumbers, NameAnalysis, MobileAnalysis, LuckyThings, PersonalYear,
} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function NumerologyResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title="Numerology Report" subtitle="Your numbers, name, and lucky things">
        {/* loshu-grid returns the 3x3 magic square plus radical/destiny/kua/
            psychic/lifePath numbers and plane percentages. The square is drawn
            as a square — printing it as nine key/value rows threw away the one
            thing that makes it readable: which cells are empty. */}
        <NumerologyNumbers data={data?.loshuGrid} title={t('result.loshuGrid')} index={0} />
        <PersonalYear data={data?.personalYear} title={t('result.personalYear')} index={1} />
        <LuckyThings data={data?.luckyThings} title={t('result.luckyThings')} index={2} />
        <NameAnalysis data={data?.nameAnalysis} title={t('result.nameAnalysis')} index={3} />
        <MobileAnalysis data={data?.mobileAnalysis} title={t('result.mobileAnalysis')} index={4} />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
