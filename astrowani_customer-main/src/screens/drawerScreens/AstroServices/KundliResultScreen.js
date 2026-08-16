import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {ASTRO, ReportShell, SectionCard} from '../../../components/astro/AstroUI';
import ZoomableChart from '../../../components/astro/ZoomableChart';
import {
  PlanetTable, KundliAttributes, AscendantReport, InfoSection,
} from '../../../components/astro/AstroBlocks';
import {useReportLanguage, TranslatingOverlay} from '../../../components/astro/ReportLanguage';
import {LanguageContext} from '../../../context/LanguageContext';

export default function KundliResultScreen({route, navigation}) {
  const {t} = React.useContext(LanguageContext);
  // Owns the payload so the header's EN/हिं toggle can swap it for the Hindi one.
  const {data, busy} = useReportLanguage(route, navigation);

  return (
    <View style={styles.main}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ReportShell title={t('result.kundliOverview')} subtitle={t('report.kundliSub')}>
          {!!data?.chartSvg && (
            <SectionCard
              title={t('report.lagnaChart')}
              glyph="✧"
              subtitle={t('report.yourBirthChart')}
              index={0}>
              <ZoomableChart svg={data.chartSvg} title={t('report.lagnaChart')} />
            </SectionCard>
          )}

          <KundliAttributes data={data?.extendedKundali} index={1} />
          <AscendantReport data={data?.ascendantReport} title={t('result.ascendantReport')} index={2} />
          <PlanetTable data={data?.planetDetails} title={t('result.planetDetails')} index={3} />

          {/* Anything the blocks above did not consume still renders, so a payload
              change can never make a paid report look empty. */}
          {!data?.extendedKundali && !data?.planetDetails && (
            <InfoSection title={t('result.kundliOverview')} data={data} index={4} />
          )}
        </ReportShell>
      </ScrollView>
      <TranslatingOverlay visible={busy} label={t('report.translating')} />
    </View>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
