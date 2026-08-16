import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell, SectionCard} from '../../../components/astro/AstroUI';
import ZoomableChart from '../../../components/astro/ZoomableChart';
import {
  PlanetTable, KundliAttributes, AscendantReport, InfoSection,
} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function KundliResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title={t('result.kundliOverview')} subtitle="Birth chart, positions and attributes">
        {!!data?.chartSvg && (
          // noPad: the chart is the content, so it runs edge to edge inside the
          // card rather than sitting in a padded well that shrinks it further.
          <SectionCard title="Lagna Chart (D1)" glyph="✧" subtitle="Your birth chart" index={0}>
            <ZoomableChart svg={data.chartSvg} title="Lagna Chart (D1)" />
          </SectionCard>
        )}

        <KundliAttributes data={data?.extendedKundali} title="Birth Attributes" index={1} />
        <AscendantReport data={data?.ascendantReport} title={t('result.ascendantReport')} index={2} />
        <PlanetTable data={data?.planetDetails} title={t('result.planetDetails')} index={3} />

        {/* Anything the blocks above did not consume still renders, so a payload
            change can never make a paid report look empty. */}
        {!data?.extendedKundali && !data?.planetDetails && (
          <InfoSection title="Report" data={data} index={4} />
        )}
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
